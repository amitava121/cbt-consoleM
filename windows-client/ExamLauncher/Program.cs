using System.Diagnostics;
using CBT.Shared.Logger;
using Serilog;

namespace CBT.ExamLauncher;

/// <summary>
/// ExamLauncher — Watchdog process for the WPF Exam Client.
/// As specified in CLIENT_ARCHITECTURE.md Section 3.2 and SAD.md Section 4.
/// 
/// Responsibilities:
/// - Starts ExamClient.exe
/// - Monitors the process via WaitForSingleObject
/// - Restarts on crash with backoff (immediate, 2s, 5s, 10s, max 3 attempts)
/// - Prevents multiple instances via named mutex
/// - Collects crash logs (WER reports)
/// </summary>
internal static class Program
{
    private static readonly string ExamClientExeName = "ExamClient.exe";
    private static readonly string CrashLogDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "cbt-exam", "crash_logs");

    private static readonly int[] RestartDelaysMs = [0, 2000, 5000, 10000];
    private const int MaxRestartAttempts = 3;

    private static Mutex? _instanceMutex;
    private static int _restartCount;

    static int Main(string[] args)
    {
        // Configure Serilog
        Log.Logger = LoggerConfig.CreateLogger("ExamLauncher");
        Log.Information("ExamLauncher starting");

        // Enforce single instance
        _instanceMutex = new Mutex(true, @"Global\ExamLauncherSingleton", out bool createdNew);
        if (!createdNew)
        {
            Log.Error("Another ExamLauncher instance is already running — exiting");
            return 1;
        }

        try
        {
            Directory.CreateDirectory(CrashLogDirectory);
            RunWatchdogLoop();
            return 0;
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "ExamLauncher fatal error");
            return 1;
        }
        finally
        {
            _instanceMutex.ReleaseMutex();
            _instanceMutex.Dispose();
            Log.Information("ExamLauncher shutting down");
            Log.CloseAndFlush();
        }
    }

    /// <summary>
    /// Main watchdog loop — starts and monitors the ExamClient process.
    /// Restarts with backoff on crash, up to MaxRestartAttempts.
    /// </summary>
    private static void RunWatchdogLoop()
    {
        _restartCount = 0;

        while (_restartCount <= MaxRestartAttempts)
        {
            var clientPath = FindExamClientPath();
            if (clientPath is null)
            {
                Log.Error("ExamClient.exe not found. Cannot start exam client.");
                Thread.Sleep(5000);
                continue;
            }

            Log.Information("Starting ExamClient (attempt {Attempt}/{Max})",
                _restartCount + 1, MaxRestartAttempts + 1);

            var process = StartExamClient(clientPath);
            if (process is null)
            {
                Log.Error("Failed to start ExamClient process");
                _restartCount++;
                ApplyRestartDelay();
                continue;
            }

            // Monitor the process — blocks until exit
            process.WaitForExit();

            var exitCode = process.ExitCode;
            var exitTime = process.ExitTime;
            process.Dispose();

            Log.Information("ExamClient exited with code {ExitCode} at {ExitTime}",
                exitCode, exitTime);

            // Normal exit (code 0) — don't restart
            if (exitCode == 0)
            {
                Log.Information("ExamClient exited normally — launcher shutting down");
                return;
            }

            // Abnormal exit — collect crash info and restart
            _restartCount++;
            CollectCrashLog(exitCode, exitTime);

            if (_restartCount > MaxRestartAttempts)
            {
                Log.Error("Maximum restart attempts ({Max}) exceeded — giving up",
                    MaxRestartAttempts);
                return;
            }

            ApplyRestartDelay();
        }
    }

    private static Process? StartExamClient(string clientPath)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = clientPath,
                UseShellExecute = false,
                CreateNoWindow = false,
                WorkingDirectory = Path.GetDirectoryName(clientPath)
            };

            return Process.Start(startInfo);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Exception starting ExamClient at {Path}", clientPath);
            return null;
        }
    }

    private static void ApplyRestartDelay()
    {
        var delayIndex = Math.Min(_restartCount - 1, RestartDelaysMs.Length - 1);
        var delay = RestartDelaysMs[delayIndex];

        if (delay > 0)
        {
            Log.Information("Waiting {Delay}ms before restart", delay);
            Thread.Sleep(delay);
        }
    }

    private static void CollectCrashLog(int exitCode, DateTime exitTime)
    {
        try
        {
            var logEntry = $"""
                [CRASH REPORT]
                Time: {exitTime:O}
                ExitCode: {exitCode}
                RestartAttempt: {_restartCount}/{MaxRestartAttempts}
                Machine: {Environment.MachineName}
                OS: {Environment.OSVersion}
                ---
                """;

            var logFile = Path.Combine(CrashLogDirectory,
                $"crash_{exitTime:yyyyMMdd_HHmmss}.log");
            File.AppendAllText(logFile, logEntry);

            Log.Warning("Crash log written to {Path}", logFile);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to write crash log");
        }
    }

    private static string? FindExamClientPath()
    {
        // Look for ExamClient.exe in the same directory as the launcher
        var launcherDir = AppContext.BaseDirectory;
        var candidatePaths = new[]
        {
            Path.Combine(launcherDir, ExamClientExeName),
            Path.Combine(launcherDir, "..", "ExamClient", ExamClientExeName),
            Path.Combine(launcherDir, "..", "ExamClient", "bin", "Release", "net8.0-windows", ExamClientExeName),
            Path.Combine(launcherDir, "..", "ExamClient", "bin", "Debug", "net8.0-windows", ExamClientExeName),
        };

        foreach (var path in candidatePaths)
        {
            var fullPath = Path.GetFullPath(path);
            if (File.Exists(fullPath))
            {
                Log.Debug("Found ExamClient at {Path}", fullPath);
                return fullPath;
            }
        }

        return null;
    }
}
