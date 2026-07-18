using System.Diagnostics;
using System.IO;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Lockdown;

/// <summary>
/// Monitors running processes for unauthorized applications.
/// As specified in CLIENT_ARCHITECTURE.md Section 10.1 and SECURITY_ARCHITECTURE.md Section 11.1.
/// </summary>
public sealed class ProcessMonitor : IDisposable
{
    private readonly ProcessControlPolicy _policy;
    private System.Threading.Timer? _timer;
    private bool _isRunning;

    /// <summary>
    /// Raised when an unauthorized process is detected.
    /// </summary>
    public event EventHandler<string>? UnauthorizedProcessDetected;

    public ProcessMonitor(ProcessControlPolicy policy)
    {
        _policy = policy;
    }

    /// <summary>
    /// Starts periodic process monitoring (every 10 seconds).
    /// </summary>
    public void Start()
    {
        if (_isRunning) return;
        _isRunning = true;
        _timer = new System.Threading.Timer(CheckProcesses, null, TimeSpan.Zero, TimeSpan.FromSeconds(10));
        Log.Information("Process monitor started");
    }

    /// <summary>
    /// Stops process monitoring.
    /// </summary>
    public void Stop()
    {
        _isRunning = false;
        _timer?.Dispose();
        _timer = null;
        Log.Information("Process monitor stopped");
    }

    private void CheckProcesses(object? state)
    {
        try
        {
            var processes = Process.GetProcesses();
            var allowedLower = _policy.AllowedProcesses
                .Select(p => Path.GetFileNameWithoutExtension(p).ToLowerInvariant())
                .ToHashSet();

            // Also allow critical Windows processes
            allowedLower.Add("system");
            allowedLower.Add("idle");
            allowedLower.Add("svchost");
            allowedLower.Add("csrss");
            allowedLower.Add("lsass");
            allowedLower.Add("winlogon");
            allowedLower.Add("dwm");
            allowedLower.Add("explorer"); // May be hidden by GPO
            allowedLower.Add("conhost");
            allowedLower.Add("smss");
            allowedLower.Add("services");
            allowedLower.Add("wininit");
            allowedLower.Add("fontdrvhost");
            allowedLower.Add("sihost");
            allowedLower.Add("taskhostw");
            allowedLower.Add("runtimebroker");
            allowedLower.Add("searchhost");
            allowedLower.Add("startmenuexperiencehost");
            allowedLower.Add("shellexperiencehost");
            allowedLower.Add("textinputhost");
            allowedLower.Add("securityhealthservice");
            allowedLower.Add("securityhealthsystray");
            allowedLower.Add("sgrmbroker");
            allowedLower.Add("audiodg");
            allowedLower.Add("ctfmon");
            allowedLower.Add("dllhost");
            allowedLower.Add("dashost");
            allowedLower.Add("registry");

            foreach (var proc in processes)
            {
                try
                {
                    var name = proc.ProcessName.ToLowerInvariant();
                    if (!allowedLower.Contains(name) && !IsSystemProcess(proc))
                    {
                        Log.Warning("Unauthorized process detected: {ProcessName} (PID: {PID})",
                            proc.ProcessName, proc.Id);
                        UnauthorizedProcessDetected?.Invoke(this, proc.ProcessName);
                    }
                }
                catch
                {
                    // Access denied for some system processes — skip
                }
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Error during process monitoring");
        }
    }

    private static bool IsSystemProcess(Process proc)
    {
        try
        {
            // System processes typically have session ID 0
            return proc.SessionId == 0;
        }
        catch
        {
            return true; // Assume system if we can't check
        }
    }

    public void Dispose()
    {
        Stop();
    }
}
