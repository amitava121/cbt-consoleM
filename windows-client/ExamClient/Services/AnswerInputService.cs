using System.Text.Json;
using System.Windows.Threading;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// Handles answer input with proper save triggers and debouncing.
/// As specified in CLIENT_ARCHITECTURE.md Section 6.3 (Save Frequency).
/// 
/// Save triggers:
/// - Option selection (MCQ): Immediate local save + WS send
/// - Text input (essay/fill-in): Debounced 500ms after last keystroke
/// - Mark for review: Immediate local save + WS send
/// - Question navigation: Save current question state
/// - Timer tick (every 30s): Save remaining_time
/// </summary>
public sealed class AnswerInputService : IDisposable
{
    private readonly ILocalDbService _localDb;
    private readonly IAuthService _authService;
    private DispatcherTimer? _debounceTimer;
    private string? _pendingQuestionId;
    private string? _pendingAnswerJson;

    private const int DebounceMs = 500;

    /// <summary>
    /// Raised when an answer has been saved locally and should be synced to server.
    /// </summary>
    public event EventHandler<AnswerSavedLocallyEventArgs>? AnswerSavedLocally;

    public AnswerInputService(ILocalDbService localDb, IAuthService authService)
    {
        _localDb = localDb;
        _authService = authService;
    }

    /// <summary>
    /// Called when an MCQ option is selected (immediate save).
    /// CLIENT_ARCHITECTURE.md §6.3: "Option selection (MCQ) — Immediate local save + WS send"
    /// </summary>
    public async Task OnOptionSelectedAsync(string questionId, List<string> selectedOptionIds, int timeSpentSecs, bool isMarkedForReview)
    {
        var answerData = new AnswerData { SelectedOptionIds = selectedOptionIds };
        var answerJson = JsonSerializer.Serialize(answerData);

        await SaveAnswerAsync(questionId, answerJson, timeSpentSecs, isMarkedForReview);
    }

    /// <summary>
    /// Called when text input changes (debounced — 500ms after last keystroke).
    /// CLIENT_ARCHITECTURE.md §6.3: "Text input (essay/fill-in) — Debounced (500ms after last keystroke)"
    /// </summary>
    public void OnTextInputChanged(string questionId, string text, int timeSpentSecs, bool isMarkedForReview)
    {
        var answerData = new AnswerData { TextInput = text };
        _pendingQuestionId = questionId;
        _pendingAnswerJson = JsonSerializer.Serialize(answerData);

        // Reset debounce timer
        _debounceTimer?.Stop();
        _debounceTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(DebounceMs)
        };
        _debounceTimer.Tick += async (_, _) =>
        {
            _debounceTimer.Stop();
            if (_pendingQuestionId is not null && _pendingAnswerJson is not null)
            {
                await SaveAnswerAsync(_pendingQuestionId, _pendingAnswerJson, timeSpentSecs, isMarkedForReview);
                _pendingQuestionId = null;
                _pendingAnswerJson = null;
            }
        };
        _debounceTimer.Start();
    }

    /// <summary>
    /// Called when a numerical answer is entered (immediate save).
    /// </summary>
    public async Task OnNumericalAnswerAsync(string questionId, double value, int timeSpentSecs, bool isMarkedForReview)
    {
        var answerData = new AnswerData { NumericalAnswer = value };
        var answerJson = JsonSerializer.Serialize(answerData);

        await SaveAnswerAsync(questionId, answerJson, timeSpentSecs, isMarkedForReview);
    }

    /// <summary>
    /// Called when matching pairs are set (immediate save).
    /// </summary>
    public async Task OnMatchingPairsAsync(string questionId, List<MatchingPair> pairs, int timeSpentSecs, bool isMarkedForReview)
    {
        var answerData = new AnswerData { MatchingPairs = pairs };
        var answerJson = JsonSerializer.Serialize(answerData);

        await SaveAnswerAsync(questionId, answerJson, timeSpentSecs, isMarkedForReview);
    }

    /// <summary>
    /// Called when drag-drop order is set (immediate save).
    /// </summary>
    public async Task OnDragDropOrderAsync(string questionId, List<string> order, int timeSpentSecs, bool isMarkedForReview)
    {
        var answerData = new AnswerData { DragDropOrder = order };
        var answerJson = JsonSerializer.Serialize(answerData);

        await SaveAnswerAsync(questionId, answerJson, timeSpentSecs, isMarkedForReview);
    }

    /// <summary>
    /// Forces save of any pending debounced input (called on question navigation).
    /// CLIENT_ARCHITECTURE.md §6.3: "Question navigation — Save current question state"
    /// </summary>
    public async Task FlushPendingAsync()
    {
        _debounceTimer?.Stop();

        if (_pendingQuestionId is not null && _pendingAnswerJson is not null)
        {
            await SaveAnswerAsync(_pendingQuestionId, _pendingAnswerJson, 0, false);
            _pendingQuestionId = null;
            _pendingAnswerJson = null;
        }
    }

    private async Task SaveAnswerAsync(string questionId, string answerJson, int timeSpentSecs, bool isMarkedForReview)
    {
        if (_authService.AttemptId is null) return;

        var answer = new LocalAnswer
        {
            Id = Guid.NewGuid().ToString(),
            AttemptId = _authService.AttemptId,
            QuestionId = questionId,
            AnswerDataJson = answerJson,
            Status = SyncStatus.SavedLocal,
            TimeSpentSecs = timeSpentSecs,
            IsMarkedForReview = isMarkedForReview,
            Nonce = Shared.Crypto.HmacSigner.GenerateNonce(),
            CreatedAt = DateTime.UtcNow.ToString("O"),
            UpdatedAt = DateTime.UtcNow.ToString("O")
        };

        // Save to local SQLite immediately (zero latency to user)
        await _localDb.SaveAnswerAsync(answer);

        Log.Debug("Answer saved locally for question {QuestionId}", questionId);

        // Notify for server sync
        AnswerSavedLocally?.Invoke(this, new AnswerSavedLocallyEventArgs
        {
            QuestionId = questionId,
            AnswerDataJson = answerJson,
            Nonce = answer.Nonce!,
            TimeSpentSecs = timeSpentSecs,
            IsMarkedForReview = isMarkedForReview
        });
    }

    public void Dispose()
    {
        _debounceTimer?.Stop();
    }
}

/// <summary>
/// Event args for when an answer is saved locally and needs server sync.
/// </summary>
public sealed class AnswerSavedLocallyEventArgs : EventArgs
{
    public string QuestionId { get; set; } = string.Empty;
    public string AnswerDataJson { get; set; } = string.Empty;
    public string Nonce { get; set; } = string.Empty;
    public int TimeSpentSecs { get; set; }
    public bool IsMarkedForReview { get; set; }
}
