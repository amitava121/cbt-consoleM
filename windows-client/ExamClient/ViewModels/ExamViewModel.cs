using System.Collections.ObjectModel;
using System.Text.Json;
using System.Windows.Threading;
using CBT.ExamClient.Services;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Serilog;

namespace CBT.ExamClient.ViewModels;

/// <summary>
/// Main exam ViewModel managing the exam state machine, question navigation,
/// auto-save pipeline, timer, and heartbeat.
/// As specified in CLIENT_ARCHITECTURE.md Sections 5, 6, and 7.
/// </summary>
public partial class ExamViewModel : ObservableObject
{
    private readonly IApiService _apiService;
    private readonly IWebSocketService _webSocketService;
    private readonly ILocalDbService _localDb;
    private readonly IAuthService _authService;

    private readonly INavigationService _navigationService;
    private DispatcherTimer? _examTimer;
    private DispatcherTimer? _heartbeatTimer;
    private HmacSigner? _hmacSigner;
    private ExamManifest? _manifest;

    // --- Observable Properties ---

    [ObservableProperty]
    private ExamState _examState = ExamState.Idle;

    [ObservableProperty]
    private Question? _currentQuestion;

    [ObservableProperty]
    private int _currentQuestionIndex;

    [ObservableProperty]
    private int _remainingTimeSeconds;

    [ObservableProperty]
    private string _timerDisplay = "00:00:00";

    [ObservableProperty]
    private string _currentSectionName = string.Empty;

    [ObservableProperty]
    private bool _isOnline = true;

    [ObservableProperty]
    private string _connectionStatus = "Connected";

    [ObservableProperty]
    private ObservableCollection<QuestionPaletteItem> _questionPalette = [];

    [ObservableProperty]
    private int _answeredCount;

    [ObservableProperty]
    private int _unansweredCount;

    [ObservableProperty]
    private int _markedForReviewCount;

    [ObservableProperty]
    private int _totalQuestions;

    /// <summary>
    /// Whether the current question is MCQ single answer.
    /// </summary>
    public bool IsMcqSingle => CurrentQuestion?.Type is "mcq_single" or "true_false";

    /// <summary>
    /// Whether the current question is MCQ multiple answer.
    /// </summary>
    public bool IsMcqMultiple => CurrentQuestion?.Type == "mcq_multiple";

    /// <summary>
    /// Whether the current question requires text input (essay/fill-in).
    /// </summary>
    public bool IsTextInput => CurrentQuestion?.Type is "essay" or "fill_in_blank";

    /// <summary>
    /// Whether the current question requires numerical input.
    /// </summary>
    public bool IsNumerical => CurrentQuestion?.Type == "numerical";

    /// <summary>
    /// Whether the current question is True/False.
    /// </summary>
    public bool IsTrueFalse => CurrentQuestion?.Type == "true_false";

    [ObservableProperty]
    private string _textAnswer = string.Empty;

    [ObservableProperty]
    private string _numericalAnswer = string.Empty;

    [ObservableProperty]
    private object? _currentQuestionImageSource;

    /// <summary>
    /// All questions loaded for the exam (cached in memory for instant navigation).
    /// As specified in CLIENT_ARCHITECTURE.md Section 12.2 — no network on navigation.
    /// </summary>
    private List<Question> _allQuestions = [];

    /// <summary>
    /// Sections for the exam.
    /// </summary>
    public ObservableCollection<ExamSectionInfo> Sections { get; } = [];

    public ExamViewModel(
        IApiService apiService,
        IWebSocketService webSocketService,
        ILocalDbService localDb,
        IAuthService authService,
        INavigationService navigationService)
    {
        _apiService = apiService;
        _webSocketService = webSocketService;
        _localDb = localDb;
        _authService = authService;
        _navigationService = navigationService;

        // Subscribe to WebSocket events
        _webSocketService.AnswerSaved += OnAnswerSaved;
        _webSocketService.HeartbeatAcknowledged += OnHeartbeatAck;
        _webSocketService.ExamPaused += OnExamPaused;
        _webSocketService.ExamResumed += OnExamResumed;
        _webSocketService.ExamTerminated += OnExamTerminated;
        _webSocketService.SessionAutoSubmitted += OnSessionAutoSubmitted;
        _webSocketService.TimeSynced += OnTimeSynced;
        _webSocketService.Disconnected += OnDisconnected;
        _webSocketService.Reconnected += OnReconnected;
    }

    /// <summary>
    /// Initializes the exam session with loaded data from ExamListViewModel.
    /// Transitions state: IDLE → LOADING → IN_PROGRESS.
    /// As specified in CLIENT_ARCHITECTURE.md Section 5.2.
    /// </summary>
    public void InitializeExam(
        ExamManifest manifest,
        List<Question> questions,
        CBT.Shared.Models.ExamStartResponseData startResponse,
        HmacSigner hmacSigner)
    {
        _manifest = manifest;
        _hmacSigner = hmacSigner;
        _allQuestions = questions;
        TotalQuestions = questions.Count;

        // Transition: IDLE → LOADING
        ExamState = ExamState.Loading;

        // Populate sections
        Sections.Clear();
        foreach (var section in startResponse.Sections)
        {
            Sections.Add(section);
        }

        // Build question palette
        QuestionPalette.Clear();
        for (int i = 0; i < questions.Count; i++)
        {
            QuestionPalette.Add(new QuestionPaletteItem
            {
                QuestionId = questions[i].Id,
                QuestionNumber = i + 1,
                AnswerStatus = AnswerStatus.NotVisited
            });
        }

        // Set timer from server-authoritative response (manifest duration)
        RemainingTimeSeconds = startResponse.RemainingTimeSeconds;
        UpdateTimerDisplay();

        // Load first question
        CurrentQuestionIndex = 0;
        LoadQuestion(0);

        // Mark first question as visited
        if (QuestionPalette.Count > 0)
        {
            QuestionPalette[0].AnswerStatus = AnswerStatus.Visited;
        }

        UpdatePaletteCounts();

        // Transition: LOADING → IN_PROGRESS
        ExamState = ExamState.InProgress;

        // Start timer and heartbeat
        StartTimer();
        StartHeartbeat();

        Log.Information("Exam initialized. Questions: {Count}, Duration: {Duration}s, AttemptId: {AttemptId}",
            TotalQuestions, RemainingTimeSeconds, _authService.AttemptId);
    }

    /// <summary>
    /// Navigates to the next question.
    /// </summary>
    [RelayCommand]
    private void NextQuestion()
    {
        if (CurrentQuestionIndex < _allQuestions.Count - 1)
        {
            SaveCurrentQuestionState();
            CurrentQuestionIndex++;
            LoadQuestion(CurrentQuestionIndex);
        }
    }

    /// <summary>
    /// Navigates to the previous question.
    /// </summary>
    [RelayCommand]
    private void PreviousQuestion()
    {
        if (CurrentQuestionIndex > 0)
        {
            SaveCurrentQuestionState();
            CurrentQuestionIndex--;
            LoadQuestion(CurrentQuestionIndex);
        }
    }

    /// <summary>
    /// Navigates to a specific question by index (from palette).
    /// </summary>
    [RelayCommand]
    private void GoToQuestion(int index)
    {
        if (index >= 0 && index < _allQuestions.Count)
        {
            SaveCurrentQuestionState();
            CurrentQuestionIndex = index;
            LoadQuestion(index);
        }
    }

    /// <summary>
    /// Marks the current question for review.
    /// </summary>
    [RelayCommand]
    private async Task MarkForReviewAsync()
    {
        if (CurrentQuestion is null) return;

        var paletteItem = QuestionPalette.FirstOrDefault(p => p.QuestionId == CurrentQuestion.Id);
        if (paletteItem is not null)
        {
            paletteItem.IsMarkedForReview = !paletteItem.IsMarkedForReview;
            UpdatePaletteCounts();
        }

        // Save to local DB
        await SaveAnswerLocallyAsync(isMarkedToggle: true);
    }

    /// <summary>
    /// Initiates the exam submit flow (transition to SUBMIT_CONFIRM state).
    /// </summary>
    [RelayCommand]
    private void RequestSubmit()
    {
        ExamState = ExamState.SubmitConfirm;
        _navigationService.NavigateToSubmitConfirmation();
    }

    // --- Timer Logic ---

    private void StartTimer()
    {
        _examTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(1)
        };
        _examTimer.Tick += OnTimerTick;
        _examTimer.Start();
    }

    private void OnTimerTick(object? sender, EventArgs e)
    {
        if (RemainingTimeSeconds > 0)
        {
            RemainingTimeSeconds--;
            UpdateTimerDisplay();

            // Save remaining time to local DB every 30 seconds
            if (RemainingTimeSeconds % 30 == 0)
            {
                _ = SaveExamStateAsync();
            }
        }
        else
        {
            // Timer expired — auto-submit
            _examTimer?.Stop();
            _heartbeatTimer?.Stop();
            Log.Warning("Exam timer expired — triggering auto-submit");
            ExamState = ExamState.AutoSubmitted;
            _ = TriggerAutoSubmitAsync();
        }
    }

    private void UpdateTimerDisplay()
    {
        var ts = TimeSpan.FromSeconds(RemainingTimeSeconds);
        TimerDisplay = $"{(int)ts.TotalHours:D2}:{ts.Minutes:D2}:{ts.Seconds:D2}";
    }

    // --- Heartbeat Logic (every 30 seconds) ---

    private void StartHeartbeat()
    {
        _heartbeatTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(30)
        };
        _heartbeatTimer.Tick += OnHeartbeatTick;
        _heartbeatTimer.Start();
    }

    private async void OnHeartbeatTick(object? sender, EventArgs e)
    {
        if (!_webSocketService.IsConnected || _authService.AttemptId is null) return;

        try
        {
            await _webSocketService.SendHeartbeatAsync(new HeartbeatPayload
            {
                AttemptId = _authService.AttemptId,
                CurrentQuestionId = CurrentQuestion?.Id ?? string.Empty,
                RemainingTimeSecs = RemainingTimeSeconds,
                Timestamp = DateTime.UtcNow.ToString("O")
            });
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to send heartbeat");
        }
    }

    // --- Auto-Save Pipeline ---

    /// <summary>
    /// Saves the answer locally and queues for server sync.
    /// Follows CLIENT_ARCHITECTURE.md Section 6.1 save pipeline.
    /// </summary>
    private async Task SaveAnswerLocallyAsync(bool isMarkedToggle = false)
    {
        if (CurrentQuestion is null || _authService.AttemptId is null) return;

        var paletteItem = QuestionPalette.FirstOrDefault(p => p.QuestionId == CurrentQuestion.Id);
        if (paletteItem is null) return;

        var answer = new LocalAnswer
        {
            Id = Guid.NewGuid().ToString(),
            AttemptId = _authService.AttemptId,
            QuestionId = CurrentQuestion.Id,
            AnswerDataJson = paletteItem.AnswerDataJson,
            Status = SyncStatus.SavedLocal,
            TimeSpentSecs = paletteItem.TimeSpentSecs,
            IsMarkedForReview = paletteItem.IsMarkedForReview,
            Nonce = HmacSigner.GenerateNonce(),
            CreatedAt = DateTime.UtcNow.ToString("O"),
            UpdatedAt = DateTime.UtcNow.ToString("O")
        };

        // Step 1: Save to local SQLite immediately
        await _localDb.SaveAnswerAsync(answer);

        // Step 2: Send to server if online
        if (IsOnline && _webSocketService.IsConnected && _hmacSigner is not null)
        {
            try
            {
                var timestamp = DateTime.UtcNow.ToString("O");
                var payload = answer.AnswerDataJson ?? string.Empty;
                var signature = _hmacSigner.Sign(payload, answer.Nonce!, timestamp);

                await _webSocketService.SendAnswerSaveAsync(new AnswerSavePayload
                {
                    AttemptId = _authService.AttemptId,
                    QuestionId = CurrentQuestion.Id,
                    AnswerData = string.IsNullOrEmpty(answer.AnswerDataJson)
                        ? null
                        : JsonSerializer.Deserialize<AnswerData>(answer.AnswerDataJson),
                    Status = paletteItem.AnswerStatus.ToString().ToLowerInvariant(),
                    TimeSpentSecs = paletteItem.TimeSpentSecs,
                    Nonce = answer.Nonce!,
                    Timestamp = timestamp,
                    Signature = signature
                });

                await _localDb.UpdateAnswerSyncStatusAsync(CurrentQuestion.Id, SyncStatus.Syncing);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to send answer to server — queued for sync");
                await QueueForSyncAsync(answer);
            }
        }
        else
        {
            // Offline — queue for later sync
            await QueueForSyncAsync(answer);
        }
    }

    private async Task QueueForSyncAsync(LocalAnswer answer)
    {
        if (_hmacSigner is null || answer.Nonce is null) return;

        var timestamp = DateTime.UtcNow.ToString("O");
        var payload = answer.AnswerDataJson ?? string.Empty;
        var signature = _hmacSigner.Sign(payload, answer.Nonce, timestamp);

        await _localDb.AddToSyncQueueAsync(new SyncQueueItem
        {
            Id = Guid.NewGuid().ToString(),
            QuestionId = answer.QuestionId,
            AnswerDataJson = answer.AnswerDataJson ?? string.Empty,
            Nonce = answer.Nonce,
            Timestamp = timestamp,
            Signature = signature,
            RetryCount = 0,
            CreatedAt = DateTime.UtcNow.ToString("O")
        });

        await _localDb.UpdateAnswerSyncStatusAsync(answer.QuestionId, SyncStatus.PendingSync);
    }

    // --- WebSocket Event Handlers ---

    private void OnAnswerSaved(object? sender, AnswerSavedPayload e)
    {
        _ = _localDb.UpdateAnswerSyncStatusAsync(e.QuestionId, SyncStatus.Synced, e.ServerTimestamp);
        var item = QuestionPalette.FirstOrDefault(p => p.QuestionId == e.QuestionId);
        if (item is not null)
        {
            item.IsSynced = true;
        }
    }

    private void OnHeartbeatAck(object? sender, HeartbeatAckPayload e)
    {
        // Correct timer drift if > 5 seconds (per CLIENT_ARCHITECTURE.md Section 7.1)
        if (Math.Abs(e.DriftSecs) > 5)
        {
            Log.Warning("Timer drift detected: {DriftSecs}s — correcting", e.DriftSecs);
            RemainingTimeSeconds = e.RemainingTimeSecs;
            UpdateTimerDisplay();
        }
    }

    private void OnExamPaused(object? sender, ExamPausedPayload e)
    {
        ExamState = ExamState.Paused;
        _examTimer?.Stop();
        Log.Information("Exam paused by admin. Reason: {Reason}", e.Reason);
    }

    private void OnExamResumed(object? sender, ExamResumedPayload e)
    {
        ExamState = ExamState.InProgress;
        RemainingTimeSeconds = e.RemainingTimeSecs;
        UpdateTimerDisplay();
        _examTimer?.Start();
        Log.Information("Exam resumed by admin. Remaining time: {Time}s", e.RemainingTimeSecs);
    }

    private void OnExamTerminated(object? sender, ExamTerminatedPayload e)
    {
        ExamState = ExamState.Terminated;
        _examTimer?.Stop();
        _heartbeatTimer?.Stop();
        Log.Warning("Exam terminated by admin. Reason: {Reason}", e.Reason);
    }

    private void OnSessionAutoSubmitted(object? sender, SessionAutoSubmittedPayload e)
    {
        _examTimer?.Stop();
        _heartbeatTimer?.Stop();
        RemainingTimeSeconds = 0;
        UpdateTimerDisplay();
        ExamState = ExamState.AutoSubmitted;
        Log.Warning("Server auto-submitted exam. AttemptId: {AttemptId}, Reason: {Reason}",
            e.AttemptId, e.Reason);
    }

    private void OnTimeSynced(object? sender, TimeSyncPayload e)
    {
        if (Math.Abs(e.DriftSecs) > 5)
        {
            RemainingTimeSeconds = e.RemainingTimeSecs;
            UpdateTimerDisplay();
        }
    }

    private void OnDisconnected(object? sender, EventArgs e)
    {
        IsOnline = false;
        ConnectionStatus = "Offline";
        if (ExamState == ExamState.InProgress)
        {
            ExamState = ExamState.Offline;
        }
        Log.Warning("WebSocket disconnected — entering offline mode");
    }

    private void OnReconnected(object? sender, EventArgs e)
    {
        IsOnline = true;
        ConnectionStatus = "Connected";
        if (ExamState == ExamState.Offline)
        {
            ExamState = ExamState.InProgress;
        }
        Log.Information("WebSocket reconnected — syncing pending answers");
        _ = SyncPendingAnswersAsync();
    }

    // --- Helper Methods ---

    private void LoadQuestion(int index)
    {
        if (index >= 0 && index < _allQuestions.Count)
        {
            CurrentQuestion = _allQuestions[index];
            var section = Sections.FirstOrDefault(s => s.Id == CurrentQuestion.SectionId);
            CurrentSectionName = section?.Name ?? string.Empty;

            // Notify question type properties changed
            OnPropertyChanged(nameof(IsMcqSingle));
            OnPropertyChanged(nameof(IsMcqMultiple));
            OnPropertyChanged(nameof(IsTextInput));
            OnPropertyChanged(nameof(IsNumerical));
            OnPropertyChanged(nameof(IsTrueFalse));

            // Restore answer state from palette
            var paletteItem = QuestionPalette.FirstOrDefault(p => p.QuestionId == CurrentQuestion.Id);
            if (paletteItem?.AnswerDataJson is not null)
            {
                var answerData = JsonSerializer.Deserialize<AnswerData>(paletteItem.AnswerDataJson);
                TextAnswer = answerData?.TextInput ?? string.Empty;
                NumericalAnswer = answerData?.NumericalAnswer?.ToString() ?? string.Empty;
            }
            else
            {
                TextAnswer = string.Empty;
                NumericalAnswer = string.Empty;
            }

            // Load image if present
            CurrentQuestionImageSource = CurrentQuestion.Content.ImageUrl is not null
                ? new System.Windows.Media.Imaging.BitmapImage(new Uri(CurrentQuestion.Content.ImageUrl))
                : null;

            // Mark question as visited if not already
            if (paletteItem is not null && paletteItem.AnswerStatus == AnswerStatus.NotVisited)
            {
                paletteItem.AnswerStatus = AnswerStatus.Visited;
            }

            UpdatePaletteCounts();
        }
    }

    /// <summary>
    /// Gets the currently selected option IDs for MCQ multiple questions.
    /// Called by ExamView code-behind to maintain checkbox state.
    /// </summary>
    public List<string> GetSelectedOptionIds()
    {
        if (CurrentQuestion is null) return [];
        var paletteItem = QuestionPalette.FirstOrDefault(p => p.QuestionId == CurrentQuestion.Id);
        if (paletteItem?.AnswerDataJson is null) return [];

        var answerData = JsonSerializer.Deserialize<AnswerData>(paletteItem.AnswerDataJson);
        return answerData?.SelectedOptionIds ?? [];
    }

    private void SaveCurrentQuestionState()
    {
        // Track time spent on the current question before navigating away
        if (CurrentQuestion is null) return;
        var item = QuestionPalette.FirstOrDefault(p => p.QuestionId == CurrentQuestion.Id);
        if (item is not null && item.AnswerStatus == AnswerStatus.NotVisited)
        {
            item.AnswerStatus = AnswerStatus.Visited;
        }
    }

    /// <summary>
    /// Triggers auto-submit when timer expires.
    /// As specified in CLIENT_ARCHITECTURE.md Section 5.2 (IN_PROGRESS → AUTO_SUBMITTED).
    /// </summary>
    private async Task TriggerAutoSubmitAsync()
    {
        if (_authService.AttemptId is null) return;

        try
        {
            // Sync all pending answers
            await SyncPendingAnswersAsync();

            // Send submit event
            var nonce = HmacSigner.GenerateNonce();
            var timestamp = DateTime.UtcNow.ToString("O");
            var signature = _hmacSigner?.Sign(_authService.AttemptId, nonce, timestamp) ?? string.Empty;

            await _webSocketService.SendExamSubmitAsync(new ExamSubmitPayload
            {
                AttemptId = _authService.AttemptId,
                Nonce = nonce,
                Timestamp = timestamp,
                Signature = signature
            });

            Log.Information("Auto-submit triggered for attempt {AttemptId}", _authService.AttemptId);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Auto-submit failed — will retry on reconnect");
        }
    }

    /// <summary>
    /// Called from SubmitViewModel when user cancels submission (Go Back).
    /// Transitions: SUBMIT_CONFIRM → IN_PROGRESS
    /// </summary>
    public void ResumeFromSubmitConfirm()
    {
        ExamState = ExamState.InProgress;
        _examTimer?.Start();
    }

    private async Task SaveExamStateAsync()
    {
        if (_authService.AttemptId is null) return;

        await _localDb.SaveExamStateAsync(new LocalExamState
        {
            AttemptId = _authService.AttemptId,
            CurrentQuestionId = CurrentQuestion?.Id,
            CurrentSectionId = CurrentQuestion?.SectionId,
            RemainingTimeSecs = RemainingTimeSeconds,
            StartedAt = _manifest?.IssuedAt ?? DateTime.UtcNow.ToString("O"),
            LastHeartbeatAt = DateTime.UtcNow.ToString("O"),
            IsOnline = IsOnline
        });
    }

    private async Task SyncPendingAnswersAsync()
    {
        var queue = await _localDb.GetSyncQueueAsync();
        if (queue.Count == 0) return;

        Log.Information("Syncing {Count} pending answers", queue.Count);

        foreach (var item in queue)
        {
            try
            {
                await _webSocketService.SendAnswerSaveAsync(new AnswerSavePayload
                {
                    AttemptId = _authService.AttemptId!,
                    QuestionId = item.QuestionId,
                    AnswerData = string.IsNullOrEmpty(item.AnswerDataJson)
                        ? null
                        : JsonSerializer.Deserialize<AnswerData>(item.AnswerDataJson),
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
                Log.Warning(ex, "Failed to sync answer for question {QuestionId}", item.QuestionId);
            }
        }
    }

    private void UpdatePaletteCounts()
    {
        AnsweredCount = QuestionPalette.Count(p => p.AnswerStatus == AnswerStatus.Answered ||
                                                    p.AnswerStatus == AnswerStatus.AnsweredAndMarked);
        MarkedForReviewCount = QuestionPalette.Count(p => p.IsMarkedForReview);
        UnansweredCount = TotalQuestions - AnsweredCount;
    }
}

/// <summary>
/// Represents a question in the navigation palette.
/// </summary>
public partial class QuestionPaletteItem : ObservableObject
{
    [ObservableProperty]
    private string _questionId = string.Empty;

    [ObservableProperty]
    private int _questionNumber;

    [ObservableProperty]
    private AnswerStatus _answerStatus = AnswerStatus.NotVisited;

    [ObservableProperty]
    private bool _isMarkedForReview;

    [ObservableProperty]
    private bool _isSynced;

    [ObservableProperty]
    private int _timeSpentSecs;

    [ObservableProperty]
    private string? _answerDataJson;
}
