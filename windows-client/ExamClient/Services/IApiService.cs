using CBT.Shared.Models;

namespace CBT.ExamClient.Services;

/// <summary>
/// REST API client interface for server communication.
/// Endpoints as defined in API_SPECIFICATION.md Sections 3 and 5.
/// </summary>
public interface IApiService
{
    /// <summary>
    /// Authenticates the candidate with email, password, and device ID.
    /// POST /api/v1/auth/login
    /// </summary>
    Task<LoginResponseData> LoginAsync(string email, string password, string deviceId);

    /// <summary>
    /// Refreshes the access token using the refresh token.
    /// POST /api/v1/auth/refresh
    /// </summary>
    Task<RefreshTokenResponseData> RefreshTokenAsync(string refreshToken);

    /// <summary>
    /// Checks server health/connectivity.
    /// GET /api/v1/health
    /// </summary>
    Task<bool> CheckHealthAsync();

    /// <summary>
    /// Gets the list of exams assigned to the candidate.
    /// GET /api/v1/candidate/exams
    /// </summary>
    Task<List<CandidateExamInfo>> GetAssignedExamsAsync();

    /// <summary>
    /// Gets exam metadata (sections, instructions).
    /// GET /api/v1/candidate/exams/:batchId
    /// </summary>
    Task<CandidateExamInfo> GetExamMetadataAsync(string batchId);

    /// <summary>
    /// Gets exam questions.
    /// GET /api/v1/candidate/exams/:batchId/questions
    /// </summary>
    Task<List<Question>> GetExamQuestionsAsync(string batchId);

    /// <summary>
    /// Starts an exam attempt.
    /// POST /api/v1/candidate/exams/:batchId/start
    /// </summary>
    Task<ExamStartResponseData> StartExamAsync(string batchId, string deviceId);

    /// <summary>
    /// Submits the exam via REST (fallback if WebSocket unavailable).
    /// POST /api/v1/candidate/exams/:batchId/submit
    /// </summary>
    Task<bool> SubmitExamAsync(string batchId, string attemptId, string nonce, string signature);

    /// <summary>
    /// Gets the signed exam manifest.
    /// GET /api/v1/candidate/exams/:batchId/manifest (custom endpoint for manifest fetch)
    /// </summary>
    Task<SignedManifest> GetSignedManifestAsync(string batchId);

    /// <summary>
    /// Gets the signed security policy.
    /// GET /api/v1/security-policies/current
    /// </summary>
    Task<SignedSecurityPolicy> GetSecurityPolicyAsync();

    /// <summary>
    /// Gets the attempt status (for crash recovery).
    /// GET /api/v1/candidate/attempts/:attemptId/status
    /// </summary>
    Task<AttemptStatusResponse> GetAttemptStatusAsync(string attemptId);

    /// <summary>
    /// Gets saved answers from server (for crash recovery delta sync).
    /// GET /api/v1/candidate/attempts/:attemptId/answers
    /// </summary>
    Task<List<ServerAnswerState>> GetSavedAnswersAsync(string attemptId);

    /// <summary>
    /// Self-registers this device with the server (no auth required).
    /// POST /api/v1/devices/self-register
    /// </summary>
    Task<SelfRegisterResponse> SelfRegisterAsync(string deviceId, string deviceName, string macAddress, string hardwareHash, string? ipAddress = null);

    /// <summary>
    /// Sends a heartbeat ping to the server (no auth required).
    /// POST /api/v1/devices/heartbeat
    /// </summary>
    Task<HeartbeatResponse> SendHeartbeatAsync(string deviceId, string? ipAddress = null);
}

/// <summary>
/// Attempt status response for crash recovery.
/// </summary>
public sealed class AttemptStatusResponse
{
    public string AttemptId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int RemainingTimeSeconds { get; set; }
    public string? LastQuestionId { get; set; }
}

public sealed class SelfRegisterResponse
{
    public string Id { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}

public sealed class HeartbeatResponse
{
    public string DeviceId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? LastSeenAt { get; set; }
    public string ServerTime { get; set; } = string.Empty;
}
