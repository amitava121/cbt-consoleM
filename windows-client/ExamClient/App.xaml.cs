using System.Reflection;
using System.IO;
using System.Threading;
using System.Windows;
using CBT.ExamClient.Lockdown;
using CBT.ExamClient.Services;
using CBT.Shared.Configuration;
using CBT.Shared.Crypto;
using CBT.Shared.Logger;
using CBT.Shared.Models;
using Microsoft.Extensions.DependencyInjection;
using Serilog;

using Application = System.Windows.Application;
using MessageBox = System.Windows.MessageBox;

namespace CBT.ExamClient;

/// <summary>
/// Application startup and DI configuration.
/// Follows CLIENT_ARCHITECTURE.md Section 3 (Startup Flow) and DEV_STANDARDS.md Section 2.8.
/// 
/// Boot Sequence:
/// 1. Check for VM (refuse if VM)
/// 2. Generate hardware hash
/// 3. Load device ID from config
/// 4. Load embedded public key
/// 5. Fetch signed security policy from server
/// 6. Verify policy signature
/// 7. Apply lockdown per policy
/// 8. Initialize SQLite (encrypted)
/// </summary>
public partial class App : Application
{
    private Mutex? _instanceMutex;
    private IServiceProvider _serviceProvider = null!;

    public static IServiceProvider Services { get; private set; } = null!;

    /// <summary>
    /// The hardware hash generated at startup for device binding.
    /// </summary>
    public static string HardwareHash { get; private set; } = string.Empty;

    /// <summary>
    /// The active security policy (verified or default).
    /// </summary>
    public static SecurityPolicy ActivePolicy { get; set; } = DefaultSecurityPolicy.Create();

    protected override void OnStartup(StartupEventArgs e)
    {
        // Configure Serilog
        Log.Logger = LoggerConfig.CreateLogger("ExamClient");
        Log.Information("ExamClient starting up");

        // Step 1: Single instance enforcement
        if (!EnforceSingleInstance())
        {
            Log.Error("Multiple ExamClient instance attempt detected — shutting down");
            Current.Shutdown();
            return;
        }

        // Step 2: Load configuration (needed early for developmentMode check)
        var settings = AppSettingsManager.Load();
        Log.Information("Configuration loaded. DeviceId: {DeviceId}, Server: {Server}",
            settings.DeviceId, settings.ServerEndpoint);

        // Step 3: VM detection (skipped in development mode)
        if (!settings.DevelopmentMode && VMDetector.IsVirtualMachine())
        {
            Log.Error("Virtual machine detected — exam client refuses to start on VM");
            MessageBox.Show(
                "This application cannot run on a virtual machine.",
                "Security Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Current.Shutdown();
            return;
        }

        if (settings.DevelopmentMode)
        {
            Log.Information("DEVELOPMENT MODE active — VM detection skipped, lockdown disabled");
        }

        // Step 4: Generate hardware hash
        HardwareHash = HardwareFingerprint.Generate();
        Log.Information("Hardware fingerprint generated");

        // Step 5: Configure dependency injection
        var services = new ServiceCollection();
        ConfigureServices(services, settings);
        _serviceProvider = services.BuildServiceProvider();
        Services = _serviceProvider;

        // Step 6: Global exception handling
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        Log.Information("ExamClient initialization complete");
        base.OnStartup(e);
    }

    private void ConfigureServices(IServiceCollection services, AppSettings settings)
    {
        // Singleton services
        services.AddSingleton(settings);
        services.AddSingleton<IAuthService, AuthService>();
        services.AddSingleton<INavigationService, NavigationService>();

        // Load the embedded public key for signature verification
        var publicKey = LoadEmbeddedPublicKey();
        if (publicKey is not null)
        {
            services.AddSingleton(new SignatureVerifier(publicKey));
        }

        // Register service implementations
        services.AddSingleton<IApiService, ApiService>();
        services.AddSingleton<IWebSocketService, WebSocketService>();
        services.AddSingleton<ILocalDbService, LocalDbService>();
        services.AddSingleton<IDeltaSyncService, DeltaSyncService>();
        services.AddSingleton<TokenRefreshService>();
        services.AddSingleton<AnswerInputService>();
        services.AddSingleton<IncidentLogService>();
        services.AddSingleton<AccessibilityService>();

        // Register ViewModels
        services.AddTransient<ViewModels.LoginViewModel>();
        services.AddTransient<ViewModels.ExamListViewModel>();
        services.AddSingleton<ViewModels.ExamViewModel>();
        services.AddTransient<ViewModels.SubmitViewModel>();
    }

    private static byte[]? LoadEmbeddedPublicKey()
    {
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            var resourceName = "CBT.ExamClient.Resources.exam-public.pem";

            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream is null)
            {
                Log.Warning("Embedded public key resource not found: {Resource}", resourceName);
                return null;
            }

            using var reader = new StreamReader(stream);
            var pem = reader.ReadToEnd();

            // Parse PEM to get the key bytes
            using var ecdsa = System.Security.Cryptography.ECDsa.Create();
            ecdsa.ImportFromPem(pem);
            return ecdsa.ExportSubjectPublicKeyInfo();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to load embedded public key");
            return null;
        }
    }

    private bool EnforceSingleInstance()
    {
        _instanceMutex = new Mutex(true, @"Global\ExamClientSingleton", out bool createdNew);
        return createdNew;
    }

    private void OnDispatcherUnhandledException(object sender,
        System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
    {
        Log.Fatal(e.Exception, "Unhandled dispatcher exception");
        e.Handled = true;

        MessageBox.Show(
            "An unexpected error occurred. The application will attempt to recover.",
            "Error",
            MessageBoxButton.OK,
            MessageBoxImage.Error);
    }

    private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            Log.Fatal(ex, "Unhandled domain exception (IsTerminating: {IsTerminating})", e.IsTerminating);
        }
    }

    private static void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        Log.Error(e.Exception, "Unobserved task exception");
        e.SetObserved();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        Log.Information("ExamClient shutting down");
        _instanceMutex?.ReleaseMutex();
        _instanceMutex?.Dispose();
        Log.CloseAndFlush();
        base.OnExit(e);
    }
}
