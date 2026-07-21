using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using CBT.ExamClient.Crypto;
using CBT.ExamClient.Lockdown;
using CBT.ExamClient.Services;
using CBT.Shared.Configuration;
using CBT.Shared.Crypto;
using CBT.Shared.Models;
using Microsoft.Extensions.DependencyInjection;
using Serilog;

namespace CBT.ExamClient;

/// <summary>
/// Main kiosk-mode window.
/// Implements the complete startup flow from CLIENT_ARCHITECTURE.md Section 3.1:
/// 1. Show splash + health check
/// 2. Fetch signed security policy from server
/// 3. Verify policy signature (Ed25519)
/// 4. Apply lockdown per verified policy
/// 5. Check for crash recovery (active exam state in local DB)
/// 6. Navigate to Login or Recovery
/// </summary>
public partial class MainWindow : Window
{
    private KeyboardHook? _keyboardHook;
    private ProcessMonitor? _processMonitor;
    private ClipboardMonitor? _clipboardMonitor;
    private readonly INavigationService _navigationService;

    public MainWindow()
    {
        InitializeComponent();

        _navigationService = App.Services.GetRequiredService<INavigationService>();
        _navigationService.MainFrame = MainFrame;

        // Apply kiosk window properties only in production mode
        var settings = App.Services.GetRequiredService<AppSettings>();
        if (!settings.DevelopmentMode)
        {
            WindowStyle = WindowStyle.None;
            WindowState = WindowState.Maximized;
            Topmost = true;
            ResizeMode = ResizeMode.NoResize;
        }
        else
        {
            Serilog.Log.Information("DEVELOPMENT MODE — kiosk lockdown DISABLED");
        }

        Loaded += OnLoadedAsync;
        Closing += OnClosing;
    }

    /// <summary>
    /// Complete startup flow as defined in CLIENT_ARCHITECTURE.md Section 3.1.
    /// Steps 5-8 of the boot sequence (after VM check, hardware hash, config load done in App.xaml.cs).
    /// </summary>
    private async void OnLoadedAsync(object sender, RoutedEventArgs e)
    {
        try
        {
            // Step 1: Fetch signed security policy from server
            await FetchAndApplySecurityPolicyAsync();

            // Step 2: Apply lockdown per verified policy
            InstallLockdown();

            // Step 3: Check server connectivity
            var apiService = App.Services.GetRequiredService<IApiService>();
            var serverReachable = await apiService.CheckHealthAsync();

            if (!serverReachable)
            {
                Log.Warning("Server unreachable at startup — will retry from login screen");
            }

            // Step 3b: Self-register device + start heartbeat (best-effort, non-blocking)
            try
            {
                var heartbeatService = App.Services.GetRequiredService<DeviceHeartbeatService>();
                _ = heartbeatService.StartAsync();
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Device heartbeat service failed to start — non-critical");
            }

            // Step 4: Check for crash recovery (CLIENT_ARCHITECTURE.md Section 8.1)
            var shouldRecover = await CheckCrashRecoveryAsync();

            if (shouldRecover)
            {
                _navigationService.NavigateToRecovery();
            }
            else
            {
                _navigationService.NavigateToLogin();
            }

            Log.Information("MainWindow startup flow complete");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Error during MainWindow startup — falling back to login");
            _navigationService.NavigateToLogin();
        }
    }

    /// <summary>
    /// Fetches the signed security policy from the server and verifies it.
    /// As specified in CLIENT_ARCHITECTURE.md Section 3.1 steps 5-6.
    /// Falls back to hardcoded default (most restrictive) if verification fails.
    /// </summary>
    private async Task FetchAndApplySecurityPolicyAsync()
    {
        try
        {
            var apiService = App.Services.GetRequiredService<IApiService>();
            var signedPolicy = await apiService.GetSecurityPolicyAsync();

            var signatureVerifier = App.Services.GetService<SignatureVerifier>();
            var policyVerifier = new PolicyVerifier(signatureVerifier);
            var verifiedPolicy = policyVerifier.VerifyAndGetPolicy(signedPolicy);

            App.ActivePolicy = verifiedPolicy;
            Log.Information("Security policy applied. Version: {Version}, PolicyId: {PolicyId}",
                verifiedPolicy.Version, verifiedPolicy.PolicyId);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to fetch security policy — using fail-safe default");
            App.ActivePolicy = DefaultSecurityPolicy.Create();
        }
    }

    /// <summary>
    /// Checks for an active exam state in the local database (crash recovery).
    /// As specified in CLIENT_ARCHITECTURE.md Section 8.1.
    /// </summary>
    private async Task<bool> CheckCrashRecoveryAsync()
    {
        try
        {
            var manifestPath = AppSettingsManager.GetManifestCachePath();
            if (!System.IO.File.Exists(manifestPath))
            {
                return false;
            }

            var settings = App.Services.GetRequiredService<AppSettings>();
            if (string.IsNullOrEmpty(settings.LastEmail))
            {
                return false;
            }

            Log.Information("Potential crash recovery detected — manifest cache exists");
            return await Task.FromResult(true);
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Crash recovery check failed — no recovery needed");
            return false;
        }
    }

    /// <summary>
    /// Installs lockdown enforcement based on the verified security policy.
    /// Skipped entirely in Development Mode.
    /// </summary>
    private void InstallLockdown()
    {
        var settings = App.Services.GetRequiredService<AppSettings>();
        if (settings.DevelopmentMode)
        {
            Log.Information("Development mode — ALL lockdown features DISABLED");
            return;
        }

        var policy = App.ActivePolicy;

        // Install keyboard hook (WH_KEYBOARD_LL)
        if (policy.Policies.Lockdown.BlockAltF4 ||
            policy.Policies.Lockdown.BlockAltTab ||
            policy.Policies.Lockdown.BlockPrintScreen)
        {
            _keyboardHook = new KeyboardHook(policy.Policies.Lockdown);
            _keyboardHook.Install();
            Log.Information("Keyboard lockdown hook installed");
        }

        // Start process monitor
        _processMonitor = new ProcessMonitor(policy.Policies.ProcessControl);
        _processMonitor.UnauthorizedProcessDetected += OnUnauthorizedProcess;
        _processMonitor.Start();

        // Start clipboard monitoring
        if (policy.Policies.Lockdown.DisableClipboard)
        {
            _clipboardMonitor = new ClipboardMonitor();
            _clipboardMonitor.ClipboardViolationDetected += OnClipboardViolation;
            _clipboardMonitor.Start(this);
        }

        // Start token refresh service
        var tokenRefreshService = App.Services.GetRequiredService<TokenRefreshService>();
        tokenRefreshService.ReLoginRequired += OnReLoginRequired;
        tokenRefreshService.Start();

        // Disable right-click
        if (policy.Policies.Lockdown.BlockRightClick)
        {
            PreviewMouseRightButtonDown += (_, args) =>
            {
                args.Handled = true;
                Log.Warning("Right-click blocked by lockdown policy");
            };
        }

        // Force focus on window deactivation (blur detection)
        Deactivated += OnDeactivated;
    }

    private void OnUnauthorizedProcess(object? sender, string processName)
    {
        var webSocketService = App.Services.GetService<IWebSocketService>();
        var authService = App.Services.GetService<IAuthService>();

        if (webSocketService?.IsConnected == true && authService?.AttemptId is not null)
        {
            _ = webSocketService.SendViolationReportAsync(new ViolationReportPayload
            {
                AttemptId = authService.AttemptId,
                ViolationType = "UNAUTHORIZED_PROCESS",
                Description = $"Unauthorized process detected: {processName}",
                Timestamp = DateTime.UtcNow.ToString("O")
            });
        }
    }

    private void OnClipboardViolation(object? sender, EventArgs e)
    {
        var webSocketService = App.Services.GetService<IWebSocketService>();
        var authService = App.Services.GetService<IAuthService>();

        if (webSocketService?.IsConnected == true && authService?.AttemptId is not null)
        {
            _ = webSocketService.SendViolationReportAsync(new ViolationReportPayload
            {
                AttemptId = authService.AttemptId,
                ViolationType = "CLIPBOARD_ACCESS",
                Description = "Clipboard access attempt detected and blocked",
                Timestamp = DateTime.UtcNow.ToString("O")
            });
        }
    }

    private void OnReLoginRequired(object? sender, EventArgs e)
    {
        Log.Warning("Token refresh failed — forcing re-login");
        Dispatcher.Invoke(() =>
        {
            var authService = App.Services.GetRequiredService<IAuthService>();
            authService.Clear();
            _navigationService.NavigateToLogin();
        });
    }

    private void OnDeactivated(object? sender, EventArgs e)
    {
        // Skip focus enforcement in development mode
        var settings = App.Services.GetRequiredService<AppSettings>();
        if (settings.DevelopmentMode) return;

        Log.Warning("Window deactivated (blur detected) — re-enforcing kiosk mode");
        Activate();
        Topmost = true;
        WindowState = WindowState.Maximized;
        Focus();

        // Report blur violation
        var webSocketService = App.Services.GetService<IWebSocketService>();
        var authService = App.Services.GetService<IAuthService>();

        if (webSocketService?.IsConnected == true && authService?.AttemptId is not null)
        {
            _ = webSocketService.SendViolationReportAsync(new ViolationReportPayload
            {
                AttemptId = authService.AttemptId,
                ViolationType = "WINDOW_BLUR",
                Description = "Window lost focus (tab switch or blur detected)",
                Timestamp = DateTime.UtcNow.ToString("O")
            });
        }
    }

    private void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        // Allow close freely in development mode
        var settings = App.Services.GetRequiredService<AppSettings>();
        if (settings.DevelopmentMode) return;

        if (!_allowClose)
        {
            e.Cancel = true;
            Log.Warning("Window close attempt blocked — exam in progress");
        }
    }

    private bool _allowClose;

    public void AllowClose()
    {
        _allowClose = true;
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        var hwnd = new WindowInteropHelper(this).Handle;
        var source = HwndSource.FromHwnd(hwnd);
        source?.AddHook(WndProc);
    }

    private IntPtr WndProc(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled)
    {
        const int WM_ACTIVATE = 0x0006;
        if (msg == WM_ACTIVATE && wParam.ToInt64() == 0)
        {
            SetForegroundWindow(hwnd);
        }
        return IntPtr.Zero;
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    public void Cleanup()
    {
        _keyboardHook?.Dispose();
        _processMonitor?.Dispose();
        _clipboardMonitor?.Dispose();
        App.Services.GetService<TokenRefreshService>()?.Dispose();
        App.Services.GetService<DeviceHeartbeatService>()?.Dispose();
    }
}
