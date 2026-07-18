using System.Text.Json;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// Delta synchronization service implementation.
/// As specified in CLIENT_ARCHITECTURE.md Section 8.3.
/// 
/// Delta sync algorithm:
/// 1. REQUEST SERVER ANSWER STATE — send sync:delta event with attemptId
/// 2. COMPUTE DELTA — compare local_answers with server's answer list
///    a) New answers (server missing)
///    b) Updated answers (local newer based on updatedAt timestamp)
///    c) Conflicting (server newer) — server wins
/// 3. SEND DELTA — batch send only new + updated answers
/// 4. RECONCILE LOCAL STATE — update statuses to "synced", clear sync_queue
/// </summary>
public sealed class DeltaSyncService : IDeltaSyncService
{
    private readonly IWebSocketService _webSocketService;
    private readonly ILocalDbService _localDb;
    private readonly IAuthService _authService;
    private readonly IApiService _apiService;

    private TaskCompletionSource<SyncDeltaResponsePayload>? _deltaResponseTcs;

    public bool IsSyncing { get; private set; }

    public DeltaSyncService(
        IWebSocketService webSocketService,
        ILocalDbService localDb,
        IAuthService authService,
        IApiService apiService)
    {
        _webSocketService = webSocketService;
        _localDb = localDb;
        _authService = authService;
        _apiService = apiService;

        // Subscribe to delta sync responses
        _webSocketService.DeltaSyncReceived += OnDeltaSyncReceived;
    }

    /// <summary>
    /// Performs a complete delta sync after reconnection.
    /// CLIENT_ARCHITECTURE.md Section 8.3 — Delta Sync (Recovery)
    /// </summary>
    public async Task PerformDeltaSyncAsync(string attemptId)
    {
        if (IsSyncing)
        {
            Log.Warning("Delta sync already in progress — skipping");
            return;
        }

        IsSyncing = true;
        Log.Information("Starting delta sync for attempt {AttemptId}", attemptId);

        try
        {
            // Step 1: Request server's answer state
            _deltaResponseTcs = new TaskCompletionSource<SyncDeltaResponsePayload>();

            await _webSocketService.SendDeltaSyncRequestAsync(new SyncDeltaRequestPayload
            {
                AttemptId = attemptId
            });

            // Wait for server response (timeout 15s)
            var serverState = await WaitForDeltaResponseAsync(TimeSpan.FromSeconds(15));

            if (serverState is null)
            {
                Log.Warning("Delta sync: no response from server — falling back to full queue flush");
                await FlushSyncQueueAsync();
                return;
            }

            // Step 2: Compute delta
            var localAnswers = await _localDb.GetAllAnswersAsync(attemptId);
            var serverAnswerMap = serverState.Answers.ToDictionary(a => a.QuestionId, a => a.UpdatedAt);

            var answersToSend = new List<LocalAnswer>();

            foreach (var localAnswer in localAnswers)
            {
                if (!serverAnswerMap.TryGetValue(localAnswer.QuestionId, out var serverUpdatedAt))
                {
                    // Case (a): Server doesn't have this answer — send it
                    answersToSend.Add(localAnswer);
                }
                else
                {
                    // Compare timestamps
                    var localTime = DateTime.Parse(localAnswer.UpdatedAt);
                    var serverTime = DateTime.Parse(serverUpdatedAt);

                    if (localTime > serverTime)
                    {
                        // Case (b): Local is newer — send it
                        answersToSend.Add(localAnswer);
                    }
                    else
                    {
                        // Case (c): Server is newer — server wins, mark local as synced
                        await _localDb.UpdateAnswerSyncStatusAsync(
                            localAnswer.QuestionId, SyncStatus.Synced, serverUpdatedAt);
                    }
                }
            }

            Log.Information("Delta computed: {ToSend} answers to send, {ServerWins} server-wins",
                answersToSend.Count, localAnswers.Count - answersToSend.Count);

            // Step 3: Send delta (batch)
            if (answersToSend.Count > 0)
            {
                await SendDeltaAnswersAsync(attemptId, answersToSend);
            }

            // Step 4: Clear sync queue (all items have been reconciled)
            await _localDb.ClearSyncQueueAsync();

            Log.Information("Delta sync complete: {Count} answers synced", answersToSend.Count);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Delta sync failed for attempt {AttemptId}", attemptId);
        }
        finally
        {
            IsSyncing = false;
        }
    }

    /// <summary>
    /// Performs full crash recovery flow.
    /// CLIENT_ARCHITECTURE.md Section 8.1 steps 4-7.
    /// Assumes re-login has already been done (tokens are valid).
    /// </summary>
    public async Task<CrashRecoveryResult> PerformCrashRecoveryAsync(string attemptId)
    {
        Log.Information("Starting crash recovery for attempt {AttemptId}", attemptId);

        try
        {
            // Step 4: Reconnect WebSocket (should already be done by caller)
            if (!_webSocketService.IsConnected)
            {
                Log.Error("WebSocket not connected — cannot perform crash recovery");
                return new CrashRecoveryResult { Error = "WebSocket not connected" };
            }

            // Step 5: Send session:resume event and wait for server response
            await _webSocketService.SendSessionResumeAsync(attemptId);

            // Wait for session:resume response from server via SessionResumed event
            var resumeData = await WaitForSessionResumeAsync(TimeSpan.FromSeconds(10));

            if (resumeData is null)
            {
                // Fallback: use REST API to get attempt status
                Log.Warning("No session:resume response — falling back to REST");
                var status = await _apiService.GetAttemptStatusAsync(attemptId);

                if (status.Status != "in_progress")
                {
                    return new CrashRecoveryResult
                    {
                        Error = $"Attempt status is {status.Status} — cannot resume"
                    };
                }

                resumeData = new SessionResumePayload
                {
                    AttemptId = attemptId,
                    RemainingTimeSecs = status.RemainingTimeSeconds,
                    LastQuestionId = status.LastQuestionId ?? string.Empty,
                    UnsyncedCount = 0
                };
            }

            // Step 6: Perform delta sync
            await PerformDeltaSyncAsync(attemptId);

            // Step 7: Return recovery data for ExamViewModel to use
            return new CrashRecoveryResult
            {
                Success = true,
                RemainingTimeSeconds = resumeData.RemainingTimeSecs,
                LastQuestionId = resumeData.LastQuestionId,
                SyncedAnswerCount = (await _localDb.GetAllAnswersAsync(attemptId)).Count
            };
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Crash recovery failed for attempt {AttemptId}", attemptId);
            return new CrashRecoveryResult { Error = ex.Message };
        }
    }

    /// <summary>
    /// Flushes all pending items in the sync queue to the server.
    /// Used on reconnect and before exam submission.
    /// Implements retry with exponential backoff per item.
    /// </summary>
    public async Task FlushSyncQueueAsync()
    {
        var queue = await _localDb.GetSyncQueueAsync();
        if (queue.Count == 0)
        {
            Log.Debug("Sync queue is empty — nothing to flush");
            return;
        }

        Log.Information("Flushing sync queue: {Count} items", queue.Count);
        var successCount = 0;

        foreach (var item in queue)
        {
            var success = await SendSyncQueueItemWithRetryAsync(item);
            if (success)
            {
                await _localDb.RemoveFromSyncQueueAsync(item.Id);
                await _localDb.UpdateAnswerSyncStatusAsync(item.QuestionId, SyncStatus.Synced,
                    DateTime.UtcNow.ToString("O"));
                successCount++;
            }
            else
            {
                Log.Warning("Failed to sync item {Id} for question {QuestionId} after retries",
                    item.Id, item.QuestionId);
            }
        }

        Log.Information("Sync queue flush complete: {Success}/{Total} items synced",
            successCount, queue.Count);
    }

    /// <summary>
    /// Sends a single sync queue item with retry (max 3 attempts, exponential backoff).
    /// </summary>
    private async Task<bool> SendSyncQueueItemWithRetryAsync(SyncQueueItem item)
    {
        const int maxRetries = 3;
        var attemptId = _authService.AttemptId;

        if (attemptId is null || !_webSocketService.IsConnected) return false;

        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            try
            {
                AnswerData? answerData = null;
                if (!string.IsNullOrEmpty(item.AnswerDataJson))
                {
                    answerData = JsonSerializer.Deserialize<AnswerData>(item.AnswerDataJson);
                }

                await _webSocketService.SendAnswerSaveAsync(new AnswerSavePayload
                {
                    AttemptId = attemptId,
                    QuestionId = item.QuestionId,
                    AnswerData = answerData,
                    Status = "answered",
                    TimeSpentSecs = 0,
                    Nonce = item.Nonce,
                    Timestamp = item.Timestamp,
                    Signature = item.Signature
                });

                return true;
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Sync retry {Attempt}/{Max} failed for question {QuestionId}",
                    attempt + 1, maxRetries, item.QuestionId);

                if (attempt < maxRetries - 1)
                {
                    // Exponential backoff: 1s, 2s, 4s
                    var delay = TimeSpan.FromSeconds(Math.Pow(2, attempt));
                    await Task.Delay(delay);
                }
            }
        }

        return false;
    }

    private async Task SendDeltaAnswersAsync(string attemptId, List<LocalAnswer> answers)
    {
        foreach (var answer in answers)
        {
            try
            {
                var nonce = HmacSigner.GenerateNonce();
                var timestamp = DateTime.UtcNow.ToString("O");

                // Derive signature if possible
                var signature = string.Empty;
                if (_authService.AccessToken is not null)
                {
                    try
                    {
                        var signer = HmacSigner.DeriveFromToken(_authService.AccessToken, attemptId);
                        signature = signer.Sign(answer.AnswerDataJson ?? string.Empty, nonce, timestamp);
                    }
                    catch { }
                }

                AnswerData? answerData = null;
                if (!string.IsNullOrEmpty(answer.AnswerDataJson))
                {
                    answerData = JsonSerializer.Deserialize<AnswerData>(answer.AnswerDataJson);
                }

                await _webSocketService.SendAnswerSaveAsync(new AnswerSavePayload
                {
                    AttemptId = attemptId,
                    QuestionId = answer.QuestionId,
                    AnswerData = answerData,
                    Status = answer.IsMarkedForReview ? "marked_for_review" : "answered",
                    TimeSpentSecs = answer.TimeSpentSecs,
                    Nonce = nonce,
                    Timestamp = timestamp,
                    Signature = signature
                });

                await _localDb.UpdateAnswerSyncStatusAsync(answer.QuestionId, SyncStatus.Synced,
                    DateTime.UtcNow.ToString("O"));
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to send delta answer for question {QuestionId}", answer.QuestionId);
            }
        }
    }

    private void OnDeltaSyncReceived(object? sender, SyncDeltaResponsePayload e)
    {
        _deltaResponseTcs?.TrySetResult(e);
    }

    private async Task<SyncDeltaResponsePayload?> WaitForDeltaResponseAsync(TimeSpan timeout)
    {
        if (_deltaResponseTcs is null) return null;

        var completedTask = await Task.WhenAny(_deltaResponseTcs.Task, Task.Delay(timeout));
        if (completedTask == _deltaResponseTcs.Task)
        {
            return await _deltaResponseTcs.Task;
        }

        Log.Warning("Delta sync response timed out after {Timeout}s", timeout.TotalSeconds);
        return null;
    }

    private TaskCompletionSource<SessionResumePayload>? _sessionResumeTcs;

    private async Task<SessionResumePayload?> WaitForSessionResumeAsync(TimeSpan timeout)
    {
        _sessionResumeTcs = new TaskCompletionSource<SessionResumePayload>();

        // Subscribe temporarily
        void handler(object? s, SessionResumePayload payload) => _sessionResumeTcs.TrySetResult(payload);
        _webSocketService.SessionResumed += handler;

        try
        {
            var completedTask = await Task.WhenAny(_sessionResumeTcs.Task, Task.Delay(timeout));
            if (completedTask == _sessionResumeTcs.Task)
            {
                return await _sessionResumeTcs.Task;
            }
            return null;
        }
        finally
        {
            _webSocketService.SessionResumed -= handler;
        }
    }
}
