using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;

namespace CBT.Shared.Logger;

/// <summary>
/// Shared Serilog configuration used by both ExamClient and ExamLauncher.
/// As specified in CLIENT_ARCHITECTURE.md Section 2.1 and DEV_STANDARDS.md Section 2.8.
/// </summary>
public static class LoggerConfig
{
    private static readonly string LogDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "cbt-exam", "logs");

    /// <summary>
    /// Creates a configured Serilog logger for the specified application component.
    /// </summary>
    /// <param name="applicationName">Name of the application (ExamClient or ExamLauncher)</param>
    /// <param name="minimumLevel">Minimum log level (default: Information)</param>
    public static ILogger CreateLogger(string applicationName, LogEventLevel minimumLevel = LogEventLevel.Information)
    {
        Directory.CreateDirectory(LogDirectory);

        return new LoggerConfiguration()
            .MinimumLevel.Is(minimumLevel)
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .MinimumLevel.Override("System", LogEventLevel.Warning)
            .Enrich.WithProperty("Application", applicationName)
            .Enrich.WithProperty("MachineName", Environment.MachineName)
            .WriteTo.File(
                new CompactJsonFormatter(),
                Path.Combine(LogDirectory, $"{applicationName}-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 30,
                fileSizeLimitBytes: 50 * 1024 * 1024, // 50MB per file
                shared: true)
            .WriteTo.Console(
                outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
            .CreateLogger();
    }

    /// <summary>
    /// Gets the log directory path for crash log collection.
    /// </summary>
    public static string GetLogDirectory() => LogDirectory;
}
