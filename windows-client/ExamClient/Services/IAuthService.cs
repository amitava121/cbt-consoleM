namespace CBT.ExamClient.Services;

/// <summary>
/// Authentication service for managing JWT tokens in memory.
/// As specified in CLIENT_ARCHITECTURE.md Section 4.3:
/// - Tokens are stored in-memory only (never written to disk)
/// - Tokens survive View navigation but not app restart
/// - On restart: re-login required
/// </summary>
public interface IAuthService
{
    /// <summary>
    /// Gets the current access token (or null if not authenticated).
    /// </summary>
    string? AccessToken { get; }

    /// <summary>
    /// Gets the current refresh token (or null if not authenticated).
    /// </summary>
    string? RefreshToken { get; }

    /// <summary>
    /// Whether the user is currently authenticated.
    /// </summary>
    bool IsAuthenticated { get; }

    /// <summary>
    /// Gets the current user info.
    /// </summary>
    CBT.Shared.Models.UserInfo? CurrentUser { get; }

    /// <summary>
    /// Gets the current attempt ID (set after exam start).
    /// </summary>
    string? AttemptId { get; }

    /// <summary>
    /// Gets the current exam batch ID.
    /// </summary>
    string? ExamBatchId { get; }

    /// <summary>
    /// Stores tokens after successful login.
    /// </summary>
    void SetTokens(string accessToken, string refreshToken, int expiresIn);

    /// <summary>
    /// Updates the access token after refresh.
    /// </summary>
    void UpdateAccessToken(string accessToken, int expiresIn);

    /// <summary>
    /// Sets the active exam session info.
    /// </summary>
    void SetExamSession(string attemptId, string examBatchId);

    /// <summary>
    /// Sets the current user info.
    /// </summary>
    void SetUser(CBT.Shared.Models.UserInfo user);

    /// <summary>
    /// Clears all authentication state (logout).
    /// </summary>
    void Clear();

    /// <summary>
    /// Whether the access token is expired or about to expire.
    /// </summary>
    bool IsTokenExpired();

    /// <summary>
    /// Gets the token expiry time.
    /// </summary>
    DateTime? TokenExpiresAt { get; }
}
