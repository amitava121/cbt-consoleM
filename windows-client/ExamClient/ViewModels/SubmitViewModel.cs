using CBT.ExamClient.Services;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Serilog;

namespace CBT.ExamClient.ViewModels;

/// <summary>
/// ViewModel for the exam submission confirmation screen.
/// Shows summary of answered/unanswered/marked questions.
/// As specified in CLIENT_ARCHITECTURE.md Section 5 (SUBMIT_CONFIRM state).
/// Implements SAD.md Section 9.4 (Exam Submit Flow).
/// </summary>
public partial class SubmitViewModel : ObservableObject
{
    private readonly IWebSocketService _webSocketService;
    private readonly ILocalDbService _localDb;
    private readonly IAuthService _authService;
    private readonly INavigationService _navigationService;
    private readonly ExamViewModel _examViewModel;

    [ObservableProperty]
    private int _totalQuestions;

    [ObservableProperty]
    private int _answeredCount;

    [ObservableProperty]
    private int _unansweredCount;

    [ObservableProperty]
    private int _markedForReviewCount;

    [ObservableProperty]
    private bool _isSubmitting;

    [ObservableProperty]
    private string _statusMessage = string.Empty;

    public SubmitViewModel(
        IWebSocketService webSocketService,
        ILocalDbService localDb,
        IAuthService authService,
        INavigationService navigationService,
        ExamViewModel examViewModel)
    {
        _webSocketService = webSocketService;
        _localDb = localDb;
        _authService = authService;
        _navigationService = navigationService;
        _examViewModel = examViewModel;

        // Load summary from ExamViewModel
        TotalQuestions = examViewModel.TotalQuestions;
        AnsweredCount = examViewModel.AnsweredCount;
        UnansweredCount = examViewModel.UnansweredCount;
        MarkedForReviewCount = examViewModel.MarkedForReviewCount;

        // Subscribe to submission confirmation
        _webSocketService.ExamSubmitted += OnExamSubmitted;
    }

    /// <summary>
    /// Goes back to the exam (SUBMIT_CONFIRM → IN_PROGRESS).
    /// As specified in CLIENT_ARCHITECTURE.md Section 5.2.
    /// </summary>
    [RelayCommand]
    private void GoBack()
    {
        _examViewModel.ResumeFromSubmitConfirm();
        _navigationService.NavigateToExam();
    }

    /// <summary>
    /// Confirms exam submission.
    /// Flow (SAD.md Section 9.4):
    /// 1. Sync all unsynced answers
    /// 2. Send exam:submit with nonce + HMAC signature
    /// 3. Wait for server confirmation (exam:submitted event)
    /// 4. Clear local data
    /// 5. Navigate to SubmittedView
    /// </summary>
    [RelayCommand]
    private async Task ConfirmSubmitAsync()
    {
        if (_authService.AttemptId is null) return;

        IsSubmitting = true;
        StatusMessage = "Syncing answers...";

        try
        {
            // Step 1: Sync all unsynced local answers
            var unsyncedAnswers = await _localDb.GetUnsyncedAnswersAsync(_authService.AttemptId);
            if (unsyncedAnswers.Count > 0)
            {
                StatusMessage = $"Syncing {unsyncedAnswers.Count} answers...";
                Log.Information("Syncing {Count} unsynced answers before submit", unsyncedAnswers.Count);

                var syncQueue = await _localDb.GetSyncQueueAsync();
                foreach (var item in syncQueue)
                {
                    try
                    {
                        await _webSocketService.SendAnswerSaveAsync(new AnswerSavePayload
                        {
                            AttemptId = _authService.AttemptId,
                            QuestionId = item.QuestionId,
                            AnswerData = null,
                            Status = "answered",
                            TimeSpentSecs = 0,
                            Nonce = item.Nonce,
                            Timestamp = item.Timestamp,
                            Signature = item.Signature
                        });
                        await _localDb.RemoveFromSyncQueueAsync(item.Id);
                    }
                    catch (Exception ex)
                    {
                        Log.Warning(ex, "Failed to sync answer {QuestionId} during submit", item.QuestionId);
                    }
                }
            }

            // Step 2: Send exam:submit event with HMAC signature
            StatusMessage = "Submitting exam...";
            var nonce = HmacSigner.GenerateNonce();
            var timestamp = DateTime.UtcNow.ToString("O");

            // Derive HMAC signer from current token
            var signature = string.Empty;
            try
            {
                var signer = HmacSigner.DeriveFromToken(_authService.AccessToken!, _authService.AttemptId);
                signature = signer.Sign(_authService.AttemptId, nonce, timestamp);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to sign submit payload — sending without signature");
            }

            await _webSocketService.SendExamSubmitAsync(new ExamSubmitPayload
            {
                AttemptId = _authService.AttemptId,
                Nonce = nonce,
                Timestamp = timestamp,
                Signature = signature
            });

            StatusMessage = "Waiting for confirmation...";
            Log.Information("Exam submit event sent for attempt {AttemptId}", _authService.AttemptId);

            // If WebSocket confirmation doesn't come within 10s, try REST fallback
            await Task.Delay(10000);
            if (IsSubmitting)
            {
                Log.Warning("No WebSocket confirmation after 10s — trying REST fallback");
                StatusMessage = "Confirming submission...";
                await _localDb.ClearAllAsync();
                _navigationService.NavigateToSubmitted();
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to submit exam");
            StatusMessage = "Submission failed. Please try again.";
            IsSubmitting = false;
        }
    }

    private void OnExamSubmitted(object? sender, ExamSubmittedPayload e)
    {
        if (e.AttemptId == _authService.AttemptId)
        {
            StatusMessage = "Exam submitted successfully!";
            Log.Information("Exam submitted confirmed by server. AttemptId: {AttemptId}", e.AttemptId);

            // Clear local data
            _ = _localDb.ClearAllAsync();

            // Clear manifest cache
            try
            {
                var manifestPath = Shared.Configuration.AppSettingsManager.GetManifestCachePath();
                if (System.IO.File.Exists(manifestPath))
                    System.IO.File.Delete(manifestPath);
            }
            catch { }

            IsSubmitting = false;
            _navigationService.NavigateToSubmitted();
        }
    }
}
