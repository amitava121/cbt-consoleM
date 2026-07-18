using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// Records exam incident events for audit purposes.
/// As specified in SAD.md Section 11.7 — Exam Incident Log.
/// 
/// Events logged:
/// - Network lost/restored
/// - Client restarted
/// - PC restarted
/// - Candidate paused/resumed
/// - Device transfer
/// - Crash detected
/// - Offline mode entered/exited
/// - Manual reconciliation
/// - Recovery package imported
/// </summary>
public sealed class IncidentLogService
{
    private readonly ILocalDbService _localDb;
    private readonly IWebSocketService _webSocketService;
    private readonly IAuthService _authService;

    public IncidentLogService(
        ILocalDbService localDb,
        IWebSocketService webSocketService,
        IAuthService authService)
    {
        _localDb = localDb;
        _webSocketService = webSocketService;
        _authService = authService;
    }

    /// <summary>
    /// Logs an incident event locally and reports to server if connected.
    /// </summary>
    public async Task LogIncidentAsync(IncidentType type, string? description = null)
    {
        var incident = new IncidentEntry
        {
            Type = type,
            Description = description ?? GetDefaultDescription(type),
            Timestamp = DateTime.UtcNow.ToString("O"),
            AttemptId = _authService.AttemptId ?? string.Empty
        };

        Log.Information("Incident logged: {Type} — {Description}", type, incident.Description);

        // Report to server as violation if connected
        if (_webSocketService.IsConnected && _authService.AttemptId is not null)
        {
            try
            {
                await _webSocketService.SendViolationReportAsync(new CBT.Shared.Models.ViolationReportPayload
                {
                    AttemptId = _authService.AttemptId,
                    ViolationType = type.ToString(),
                    Description = incident.Description,
                    Timestamp = incident.Timestamp
                });
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to report incident to server — logged locally only");
            }
        }
    }

    private static string GetDefaultDescription(IncidentType type) => type switch
    {
        IncidentType.NetworkLost => "Client detected network disconnection",
        IncidentType.NetworkRestored => "Client network connection restored",
        IncidentType.ClientRestarted => "ExamLauncher restarted the exam client",
        IncidentType.PcRestarted => "Windows reboot detected — client recovered",
        IncidentType.CandidatePaused => "Exam paused by administrator",
        IncidentType.CandidateResumed => "Exam resumed by administrator",
        IncidentType.DeviceTransfer => "Candidate logged in on different device",
        IncidentType.CrashDetected => "ExamLauncher detected client crash",
        IncidentType.OfflineModeEntered => "Client entered offline mode",
        IncidentType.OfflineModeExited => "Client exited offline mode — back online",
        IncidentType.WindowBlur => "Window lost focus (possible tab switch)",
        IncidentType.UnauthorizedProcess => "Unauthorized process detected",
        IncidentType.ClipboardAccess => "Clipboard access attempt blocked",
        IncidentType.KeyboardViolation => "Blocked keyboard shortcut attempted",
        _ => "Unknown incident"
    };
}

/// <summary>
/// Types of exam incidents for audit logging.
/// As specified in SAD.md Section 11.7.
/// </summary>
public enum IncidentType
{
    NetworkLost,
    NetworkRestored,
    ClientRestarted,
    PcRestarted,
    CandidatePaused,
    CandidateResumed,
    DeviceTransfer,
    CrashDetected,
    OfflineModeEntered,
    OfflineModeExited,
    WindowBlur,
    UnauthorizedProcess,
    ClipboardAccess,
    KeyboardViolation
}

/// <summary>
/// Single incident entry.
/// </summary>
public sealed class IncidentEntry
{
    public IncidentType Type { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
    public string AttemptId { get; set; } = string.Empty;
}
