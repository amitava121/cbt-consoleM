using CBT.ExamClient.Services;
using CBT.Shared.Configuration;
using CBT.Shared.Models;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Serilog;

namespace CBT.ExamClient.ViewModels;

/// <summary>
/// ViewModel for the Login screen.
/// As specified in CLIENT_ARCHITECTURE.md Section 4.1.
/// Handles candidate authentication with email, password, and device validation.
/// </summary>
public partial class LoginViewModel : ObservableObject
{
    private readonly IApiService _apiService;
    private readonly IAuthService _authService;
    private readonly INavigationService _navigationService;
    private readonly AppSettings _settings;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(LoginCommand))]
    private string _email = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(LoginCommand))]
    private string _password = string.Empty;

    [ObservableProperty]
    private string _errorMessage = string.Empty;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private bool _isServerReachable;

    [ObservableProperty]
    private string _statusMessage = "Checking server connection...";

    public LoginViewModel(IApiService apiService, IAuthService authService, INavigationService navigationService, AppSettings settings)
    {
        _apiService = apiService;
        _authService = authService;
        _navigationService = navigationService;
        _settings = settings;

        // Pre-fill email from last session (crash recovery hint)
        Email = settings.LastEmail;
    }

    /// <summary>
    /// Checks server connectivity on view load.
    /// </summary>
    [RelayCommand]
    private async Task CheckServerAsync()
    {
        try
        {
            IsServerReachable = await _apiService.CheckHealthAsync();
            StatusMessage = IsServerReachable
                ? "Server connected"
                : "Waiting for server... (auto-retry every 5s)";
        }
        catch
        {
            IsServerReachable = false;
            StatusMessage = "Server unreachable — retrying...";
        }
    }

    /// <summary>
    /// Authenticates the candidate.
    /// POST /api/v1/auth/login with { email, password, deviceId }
    /// </summary>
    [RelayCommand(CanExecute = nameof(CanLogin))]
    private async Task LoginAsync()
    {
        ErrorMessage = string.Empty;
        IsLoading = true;

        try
        {
            var response = await _apiService.LoginAsync(Email, Password, _settings.DeviceId);

            // Store tokens in memory only (never disk)
            _authService.SetTokens(response.AccessToken, response.RefreshToken, response.ExpiresIn);
            _authService.SetUser(response.User);

            // Save last email for crash recovery (no credentials stored)
            _settings.LastEmail = Email;
            AppSettingsManager.Save(_settings);

            Log.Information("Login successful for user {UserId} ({Email})",
                response.User.Id, response.User.Email);

            // Navigate to exam list
            _navigationService.NavigateToExamList();
        }
        catch (ApiException ex) when (ex.ErrorCode == "UNAUTHORIZED")
        {
            ErrorMessage = "Invalid email or password.";
            Log.Warning("Login failed: invalid credentials for {Email}", Email);
        }
        catch (ApiException ex) when (ex.ErrorCode == "DEVICE_NOT_REGISTERED")
        {
            ErrorMessage = "This device is not registered. Contact the exam administrator.";
            Log.Warning("Login failed: device not registered. DeviceId: {DeviceId}", _settings.DeviceId);
        }
        catch (ApiException ex) when (ex.ErrorCode == "LOCKED_OUT")
        {
            ErrorMessage = "Account locked due to too many failed attempts. Try again later.";
            Log.Warning("Login failed: account locked for {Email}", Email);
        }
        catch (Exception ex)
        {
            ErrorMessage = "Unable to connect to the server. Please try again.";
            Log.Error(ex, "Login failed with unexpected error");
        }
        finally
        {
            IsLoading = false;
        }
    }

    private bool CanLogin() =>
        !string.IsNullOrWhiteSpace(Email) &&
        !string.IsNullOrWhiteSpace(Password) &&
        !IsLoading;
}

/// <summary>
/// Custom exception for API errors.
/// </summary>
public class ApiException : Exception
{
    public string ErrorCode { get; }
    public int StatusCode { get; }

    public ApiException(string errorCode, string message, int statusCode = 0)
        : base(message)
    {
        ErrorCode = errorCode;
        StatusCode = statusCode;
    }
}
