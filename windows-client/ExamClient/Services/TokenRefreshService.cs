using CBT.ExamClient.ViewModels;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// Automatic JWT token refresh service.
/// As specified in SECURITY_ARCHITECTURE.md Section 3.4 (JWT Lifecycle).
/// 
/// - Access token expires in 15 minutes
/// - This service refreshes the token 60 seconds before expiry
/// - Uses the refresh token (24h lifetime) to get a new access token
/// - If refresh token is also expired: forces re-login
/// 
/// Token refresh scenarios (CLIENT_ARCHITECTURE.md Section 9.2):
/// - Access token expires while online: auto-refresh in background
/// - Access token expires while offline: continue offline, refresh on reconnect
/// - Refresh token expired: force re-login, show login screen
/// </summary>
public sealed class TokenRefreshService : IDisposable
{
    private readonly IApiService _apiService;
    private readonly IAuthService _authService;
    private readonly INavigationService _navigationService;
    private System.Threading.Timer? _refreshTimer;
    private bool _isRefreshing;

    /// <summary>
    /// Raised when the refresh token is expired and re-login is required.
    /// </summary>
    public event EventHandler? ReLoginRequired;

    public TokenRefreshService(
        IApiService apiService,
        IAuthService authService,
        INavigationService navigationService)
    {
        _apiService = apiService;
        _authService = authService;
        _navigationService = navigationService;
    }

    /// <summary>
    /// Starts the automatic token refresh timer.
    /// Checks every 30 seconds whether the token needs refreshing.
    /// </summary>
    public void Start()
    {
        _refreshTimer = new System.Threading.Timer(CheckAndRefreshAsync, null,
            TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
        Log.Information("Token refresh service started");
    }

    /// <summary>
    /// Stops the token refresh timer.
    /// </summary>
    public void Stop()
    {
        _refreshTimer?.Dispose();
        _refreshTimer = null;
        Log.Information("Token refresh service stopped");
    }

    /// <summary>
    /// Forces an immediate token refresh (e.g., after reconnect when offline token expired).
    /// </summary>
    public async Task<bool> ForceRefreshAsync()
    {
        return await RefreshTokenAsync();
    }

    private async void CheckAndRefreshAsync(object? state)
    {
        if (_isRefreshing) return;
        if (!_authService.IsAuthenticated) return;

        // Check if token will expire within 60 seconds
        if (_authService.TokenExpiresAt is null) return;

        var timeUntilExpiry = _authService.TokenExpiresAt.Value - DateTime.UtcNow;
        if (timeUntilExpiry.TotalSeconds > 60) return;

        Log.Information("Access token expiring in {Seconds}s — refreshing", (int)timeUntilExpiry.TotalSeconds);
        await RefreshTokenAsync();
    }

    private async Task<bool> RefreshTokenAsync()
    {
        if (_isRefreshing) return false;
        _isRefreshing = true;

        try
        {
            var refreshToken = _authService.RefreshToken;
            if (string.IsNullOrEmpty(refreshToken))
            {
                Log.Warning("No refresh token available — re-login required");
                ReLoginRequired?.Invoke(this, EventArgs.Empty);
                return false;
            }

            var response = await _apiService.RefreshTokenAsync(refreshToken);
            _authService.UpdateAccessToken(response.AccessToken, response.ExpiresIn);

            Log.Information("Access token refreshed. New expiry in {ExpiresIn}s", response.ExpiresIn);
            return true;
        }
        catch (ApiException ex) when (ex.ErrorCode == "TOKEN_EXPIRED" || ex.ErrorCode == "TOKEN_REVOKED")
        {
            Log.Warning("Refresh token expired/revoked — re-login required");
            ReLoginRequired?.Invoke(this, EventArgs.Empty);
            return false;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Token refresh failed — will retry on next interval");
            return false;
        }
        finally
        {
            _isRefreshing = false;
        }
    }

    public void Dispose()
    {
        Stop();
    }
}
