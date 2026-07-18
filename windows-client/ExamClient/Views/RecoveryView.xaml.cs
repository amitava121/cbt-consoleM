using System.Windows;
using System.Windows.Controls;
using CBT.ExamClient.Services;
using CBT.Shared.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Serilog;

namespace CBT.ExamClient.Views;

/// <summary>
/// Recovery view — shown when crash recovery is detected.
/// As specified in CLIENT_ARCHITECTURE.md Section 8.1.
/// Flow: Re-login → Reconnect WS → Send session:resume → Delta sync → Resume exam
/// </summary>
public partial class RecoveryView : Page
{
    public RecoveryView()
    {
        InitializeComponent();

        // Pre-fill email from last session
        var settings = App.Services.GetRequiredService<AppSettings>();
        RecoveryEmailBox.Text = settings.LastEmail;
    }

    private async void OnResumeClick(object sender, RoutedEventArgs e)
    {
        var email = RecoveryEmailBox.Text;
        var password = RecoveryPasswordBox.Password;

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            return;
        }

        try
        {
            var apiService = App.Services.GetRequiredService<IApiService>();
            var authService = App.Services.GetRequiredService<IAuthService>();
            var settings = App.Services.GetRequiredService<AppSettings>();
            var navigationService = App.Services.GetRequiredService<INavigationService>();

            // Step 1: Re-login (CLIENT_ARCHITECTURE.md Section 8.1 step 3)
            var loginResponse = await apiService.LoginAsync(email, password, settings.DeviceId);
            authService.SetTokens(loginResponse.AccessToken, loginResponse.RefreshToken, loginResponse.ExpiresIn);
            authService.SetUser(loginResponse.User);

            Log.Information("Recovery login successful for {Email}", email);

            // For now, navigate to exam list (full recovery flow will be completed
            // when DeltaSyncService is implemented in a later milestone)
            navigationService.NavigateToExamList();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Recovery login failed");
            System.Windows.MessageBox.Show(
                "Login failed. Please check your credentials and try again.",
                "Recovery Error",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }
}
