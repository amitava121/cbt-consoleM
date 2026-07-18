using CBT.Shared.Models;

namespace CBT.ExamClient.Services;

/// <summary>
/// In-memory authentication service singleton.
/// Tokens are never persisted to disk for security.
/// As specified in CLIENT_ARCHITECTURE.md Section 4.3.
/// </summary>
public sealed class AuthService : IAuthService
{
    private string? _accessToken;
    private string? _refreshToken;
    private DateTime? _tokenExpiresAt;
    private UserInfo? _currentUser;
    private string? _attemptId;
    private string? _examBatchId;

    public string? AccessToken => _accessToken;
    public string? RefreshToken => _refreshToken;
    public bool IsAuthenticated => !string.IsNullOrEmpty(_accessToken) && !IsTokenExpired();
    public UserInfo? CurrentUser => _currentUser;
    public string? AttemptId => _attemptId;
    public string? ExamBatchId => _examBatchId;
    public DateTime? TokenExpiresAt => _tokenExpiresAt;

    public void SetTokens(string accessToken, string refreshToken, int expiresIn)
    {
        _accessToken = accessToken;
        _refreshToken = refreshToken;
        _tokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn - 30); // 30s buffer before actual expiry
    }

    public void UpdateAccessToken(string accessToken, int expiresIn)
    {
        _accessToken = accessToken;
        _tokenExpiresAt = DateTime.UtcNow.AddSeconds(expiresIn - 30);
    }

    public void SetExamSession(string attemptId, string examBatchId)
    {
        _attemptId = attemptId;
        _examBatchId = examBatchId;
    }

    public void SetUser(UserInfo user)
    {
        _currentUser = user;
    }

    public void Clear()
    {
        _accessToken = null;
        _refreshToken = null;
        _tokenExpiresAt = null;
        _currentUser = null;
        _attemptId = null;
        _examBatchId = null;
    }

    public bool IsTokenExpired()
    {
        if (_tokenExpiresAt is null) return true;
        return DateTime.UtcNow >= _tokenExpiresAt.Value;
    }
}
