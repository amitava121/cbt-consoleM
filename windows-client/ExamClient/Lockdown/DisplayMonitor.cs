using System.Windows;
using System.Windows.Forms;
using Serilog;

namespace CBT.ExamClient.Lockdown;

/// <summary>
/// Enforces single monitor usage and detects screen recording software.
/// As specified in CLIENT_ARCHITECTURE.md Section 10.1:
/// - "Single monitor check — SystemParameters.MonitorCount / Screen.AllScreens"
/// - "Screen recording — Check for recording software, log + warn candidate"
/// </summary>
public static class DisplayMonitor
{
    private static readonly string[] RecordingProcesses =
    [
        "obs64", "obs32", "obs",           // OBS Studio
        "streamlabs",                       // Streamlabs
        "camtasia",                         // Camtasia
        "bandicam",                         // Bandicam
        "fraps",                            // Fraps
        "xsplit",                           // XSplit
        "action",                           // Mirillis Action!
        "screenrec",                        // ScreenRec
        "sharex",                           // ShareX
        "snagit",                           // Snagit
        "loom",                             // Loom
        "screencastify",                    // Screencastify
        "nvidia share", "nvcontainer",      // NVIDIA ShadowPlay
        "gamebar", "gamebarpresencewriter", // Xbox Game Bar
    ];

    /// <summary>
    /// Checks if multiple monitors are connected.
    /// Returns true if more than one display is detected.
    /// </summary>
    public static bool HasMultipleMonitors()
    {
        var monitorCount = Screen.AllScreens.Length;
        if (monitorCount > 1)
        {
            Log.Warning("Multiple monitors detected: {Count} displays", monitorCount);
            return true;
        }
        return false;
    }

    /// <summary>
    /// Gets the number of connected monitors.
    /// </summary>
    public static int GetMonitorCount() => Screen.AllScreens.Length;

    /// <summary>
    /// Checks for running screen recording software.
    /// Returns the list of detected recording process names.
    /// </summary>
    public static List<string> DetectScreenRecordingSoftware()
    {
        var detected = new List<string>();

        try
        {
            var processes = System.Diagnostics.Process.GetProcesses();
            foreach (var proc in processes)
            {
                try
                {
                    var name = proc.ProcessName.ToLowerInvariant();
                    if (RecordingProcesses.Any(rp => name.Contains(rp)))
                    {
                        detected.Add(proc.ProcessName);
                        Log.Warning("Screen recording software detected: {ProcessName} (PID: {PID})",
                            proc.ProcessName, proc.Id);
                    }
                }
                catch
                {
                    // Access denied for some processes
                }
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to scan for screen recording software");
        }

        return detected;
    }

    /// <summary>
    /// Performs all display security checks.
    /// Returns a summary of issues found.
    /// </summary>
    public static DisplaySecurityResult CheckDisplaySecurity()
    {
        return new DisplaySecurityResult
        {
            HasMultipleMonitors = HasMultipleMonitors(),
            MonitorCount = GetMonitorCount(),
            DetectedRecordingSoftware = DetectScreenRecordingSoftware()
        };
    }
}

/// <summary>
/// Result of display security checks.
/// </summary>
public sealed class DisplaySecurityResult
{
    public bool HasMultipleMonitors { get; set; }
    public int MonitorCount { get; set; }
    public List<string> DetectedRecordingSoftware { get; set; } = [];
    public bool HasRecordingSoftware => DetectedRecordingSoftware.Count > 0;
    public bool IsSecure => !HasMultipleMonitors && !HasRecordingSoftware;
}
