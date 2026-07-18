using System.Collections.ObjectModel;
using CBT.ExamClient.Crypto;
using CBT.ExamClient.Services;
using CBT.Shared.Configuration;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Serilog;

namespace CBT.ExamClient.ViewModels;

/// <summary>
/// ViewModel for the Exam List screen (post-login).
/// Displays assigned exams and allows the candidate to start an exam.
/// 
/// Document: CLIENT_ARCHITECTURE.md Section 4.1 (Login Flow — steps after login success)
/// Document: API_SPECIFICATION.md Section 5.1 (GET /api/v1/candidate/exams)
/// 
/// Flow:
/// 1. Fetch assigned exams from server
/// 2. Display exam list with instructions
/// 3. Candidate selects an exam and clicks "Start Exam"
/// 4. Fetch signed manifest → verify → fetch questions → initialize state machine
/// </summary>
public partial class ExamListViewModel : ObservableObject
{
    private readonly IApiService _apiService;
    private readonly IAuthService _authService;
    private readonly ILocalDbService _localDb;
    private readonly IWebSocketService _webSocketService;
    private readonly INavigationService _navigationService;
    private readonly AppSettings _settings;
    private readonly SignatureVerifier? _signatureVerifier;

    [ObservableProperty]
    private ObservableCollection<CandidateExamInfo> _assignedExams = [];

    [ObservableProperty]
    private CandidateExamInfo? _selectedExam;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private bool _isStartingExam;

    [ObservableProperty]
    private string _statusMessage = "Loading exams...";

    [ObservableProperty]
    private string _errorMessage = string.Empty;

    [ObservableProperty]
    private string _candidateName = string.Empty;

    public ExamListViewModel(
        IApiService apiService,
        IAuthService authService,
        ILocalDbService localDb,
        IWebSocketService webSocketService,
        INavigationService navigationService,
        AppSettings settings,
        SignatureVerifier? signatureVerifier = null)
    {
        _apiService = apiService;
        _authService = authService;
        _localDb = localDb;
        _webSocketService = webSocketService;
        _navigationService = navigationService;
        _settings = settings;
        _signatureVerifier = signatureVerifier;

        CandidateName = _authService.CurrentUser?.FullName ?? "Candidate";
    }

    /// <summary>
    /// Loads assigned exams from the server.
    /// Called when the view is loaded.
    /// API: GET /api/v1/candidate/exams
    /// </summary>
    [RelayCommand]
    private async Task LoadExamsAsync()
    {
        IsLoading = true;
        ErrorMessage = string.Empty;
        StatusMessage = "Loading assigned exams...";

        try
        {
            var exams = await _apiService.GetAssignedExamsAsync();
            AssignedExams = new ObservableCollection<CandidateExamInfo>(exams);
            StatusMessage = exams.Count > 0
                ? $"{exams.Count} exam(s) available"
                : "No exams assigned.";

            Log.Information("Loaded {Count} assigned exams", exams.Count);
        }
        catch (ApiException ex)
        {
            ErrorMessage = $"Failed to load exams: {ex.Message}";
            Log.Error(ex, "Failed to load assigned exams");
        }
        catch (Exception ex)
        {
            ErrorMessage = "Unable to connect to server. Please try again.";
            Log.Error(ex, "Unexpected error loading exams");
        }
        finally
        {
            IsLoading = false;
        }
    }

    /// <summary>
    /// Starts the selected exam.
    /// Follows CLIENT_ARCHITECTURE.md Section 4.2 (Signed Manifest Verification).
    /// 
    /// Flow:
    /// 1. Fetch signed manifest
    /// 2. Verify Ed25519 signature
    /// 3. Verify manifest not expired
    /// 4. Verify server certificate fingerprint
    /// 5. Start exam attempt on server (POST /api/v1/candidate/exams/:batchId/start)
    /// 6. Connect WebSocket
    /// 7. Initialize local database
    /// 8. Derive HMAC session key
    /// 9. Fetch questions
    /// 10. Navigate to ExamView
    /// </summary>
    [RelayCommand]
    private async Task StartExamAsync(CandidateExamInfo? exam)
    {
        if (exam is null) return;
        SelectedExam = exam;

        IsStartingExam = true;
        ErrorMessage = string.Empty;
        StatusMessage = "Starting exam...";

        try
        {
            var batchId = SelectedExam.ExamBatchId;

            // Step 1: Fetch signed manifest
            StatusMessage = "Verifying exam manifest...";
            Log.Information("Fetching signed manifest for batch {BatchId}", batchId);
            var signedManifest = await _apiService.GetSignedManifestAsync(batchId);

            // Step 2-4: Verify manifest (Ed25519 signature, expiry, cert fingerprint)
            var verifier = new ManifestVerifier(_signatureVerifier);
            var verificationResult = verifier.Verify(signedManifest, _settings.CertificateFingerprint, _settings.DevelopmentMode);

            if (!verificationResult.IsValid)
            {
                ErrorMessage = $"Exam manifest verification failed: {verificationResult.Error}";
                Log.Error("Manifest verification failed: {Error}", verificationResult.Error);
                return;
            }

            Log.Information("Manifest verified successfully for exam {ExamId}", verificationResult.Manifest!.ExamId);

            // Step 5: Start exam attempt on server
            StatusMessage = "Creating exam attempt...";
            var startResponse = await _apiService.StartExamAsync(batchId, _settings.DeviceId);
            _authService.SetExamSession(startResponse.AttemptId, startResponse.ExamBatchId);

            Log.Information("Exam attempt created: {AttemptId}", startResponse.AttemptId);

            // Step 6: Connect WebSocket
            StatusMessage = "Connecting to exam server...";
            await _webSocketService.ConnectAsync(_settings.ServerEndpoint, _authService.AccessToken!);

            // Step 7: Initialize local encrypted database
            StatusMessage = "Initializing secure storage...";
            await _localDb.InitializeAsync(startResponse.AttemptId, App.HardwareHash);

            // Step 8: Derive HMAC session key for answer signing
            var hmacSigner = HmacSigner.DeriveFromToken(_authService.AccessToken!, startResponse.AttemptId);

            // Step 9: Fetch questions
            StatusMessage = "Downloading exam questions...";
            var questions = await _apiService.GetExamQuestionsAsync(batchId);

            Log.Information("Downloaded {Count} questions for exam", questions.Count);

            // Step 10: Cache manifest locally for offline resilience
            await CacheManifestAsync(verificationResult.Manifest);

            // Step 11: Save initial exam state to local DB
            await _localDb.SaveExamStateAsync(new LocalExamState
            {
                AttemptId = startResponse.AttemptId,
                CurrentQuestionId = questions.FirstOrDefault()?.Id,
                CurrentSectionId = questions.FirstOrDefault()?.SectionId,
                RemainingTimeSecs = startResponse.RemainingTimeSeconds,
                StartedAt = startResponse.StartedAt,
                LastHeartbeatAt = DateTime.UtcNow.ToString("O"),
                IsOnline = true
            });

            // Step 12: Initialize ExamViewModel with loaded data and navigate
            StatusMessage = "Starting exam...";
            var examVm = App.Services.GetService(typeof(ExamViewModel)) as ExamViewModel;
            if (examVm is not null)
            {
                examVm.InitializeExam(
                    verificationResult.Manifest,
                    questions,
                    startResponse,
                    hmacSigner);
            }

            _navigationService.NavigateToExam();
            Log.Information("Exam session initialized and navigated to exam view");
        }
        catch (ApiException ex) when (ex.ErrorCode == "EXAM_NOT_ACTIVE")
        {
            ErrorMessage = "This exam is not currently active. Please wait for the scheduled time.";
            Log.Warning("Exam start failed: batch not active");
        }
        catch (ApiException ex) when (ex.ErrorCode == "ATTEMPT_ALREADY_SUBMITTED")
        {
            ErrorMessage = "You have already submitted this exam.";
            Log.Warning("Exam start failed: already submitted");
        }
        catch (ApiException ex) when (ex.ErrorCode == "DEVICE_NOT_REGISTERED")
        {
            ErrorMessage = "This device is not registered for this exam.";
            Log.Warning("Exam start failed: device not registered");
        }
        catch (Exception ex)
        {
            ErrorMessage = $"Failed to start exam: {ex.Message}";
            Log.Error(ex, "Unexpected error starting exam");
        }
        finally
        {
            IsStartingExam = false;
        }
    }

    private async Task CacheManifestAsync(ExamManifest manifest)
    {
        try
        {
            var json = System.Text.Json.JsonSerializer.Serialize(manifest,
                new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
            var path = AppSettingsManager.GetManifestCachePath();
            await System.IO.File.WriteAllTextAsync(path, json);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to cache manifest locally — non-critical");
        }
    }
}
