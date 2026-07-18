using System.Text.Json.Serialization;

namespace CBT.Shared.Models;

/// <summary>
/// Signed security policy as defined in SECURITY_ARCHITECTURE.md Section 18.
/// Defines lockdown rules, allowed processes, and monitoring settings.
/// </summary>
public sealed class SecurityPolicy
{
    [JsonPropertyName("policyId")]
    public string PolicyId { get; set; } = string.Empty;

    [JsonPropertyName("version")]
    public int Version { get; set; }

    [JsonPropertyName("issuedAt")]
    public string IssuedAt { get; set; } = string.Empty;

    [JsonPropertyName("policies")]
    public PolicySettings Policies { get; set; } = new();
}

public sealed class PolicySettings
{
    [JsonPropertyName("lockdown")]
    public LockdownPolicy Lockdown { get; set; } = new();

    [JsonPropertyName("processControl")]
    public ProcessControlPolicy ProcessControl { get; set; } = new();

    [JsonPropertyName("network")]
    public NetworkPolicy Network { get; set; } = new();

    [JsonPropertyName("vmDetection")]
    public VmDetectionPolicy VmDetection { get; set; } = new();

    [JsonPropertyName("monitoring")]
    public MonitoringPolicy Monitoring { get; set; } = new();
}

public sealed class LockdownPolicy
{
    [JsonPropertyName("blockAltTab")]
    public bool BlockAltTab { get; set; } = true;

    [JsonPropertyName("blockAltF4")]
    public bool BlockAltF4 { get; set; } = true;

    [JsonPropertyName("blockCtrlAltDel")]
    public bool BlockCtrlAltDel { get; set; } = true;

    [JsonPropertyName("blockPrintScreen")]
    public bool BlockPrintScreen { get; set; } = true;

    [JsonPropertyName("blockRightClick")]
    public bool BlockRightClick { get; set; } = true;

    [JsonPropertyName("disableClipboard")]
    public bool DisableClipboard { get; set; } = true;

    [JsonPropertyName("disableTaskbar")]
    public bool DisableTaskbar { get; set; } = true;

    [JsonPropertyName("kioskMode")]
    public bool KioskMode { get; set; } = true;

    [JsonPropertyName("alwaysOnTop")]
    public bool AlwaysOnTop { get; set; } = true;
}

public sealed class ProcessControlPolicy
{
    [JsonPropertyName("allowedProcesses")]
    public List<string> AllowedProcesses { get; set; } = ["ExamClient.exe", "ExamLauncher.exe"];

    [JsonPropertyName("killUnauthorized")]
    public bool KillUnauthorized { get; set; } = true;
}

public sealed class NetworkPolicy
{
    [JsonPropertyName("allowedEndpoint")]
    public string AllowedEndpoint { get; set; } = string.Empty;

    [JsonPropertyName("blockAllOtherTraffic")]
    public bool BlockAllOtherTraffic { get; set; } = true;
}

public sealed class VmDetectionPolicy
{
    [JsonPropertyName("enabled")]
    public bool Enabled { get; set; } = true;

    [JsonPropertyName("refuseOnVM")]
    public bool RefuseOnVm { get; set; } = true;
}

public sealed class MonitoringPolicy
{
    [JsonPropertyName("heartbeatIntervalSeconds")]
    public int HeartbeatIntervalSeconds { get; set; } = 30;

    [JsonPropertyName("maxMissedHeartbeats")]
    public int MaxMissedHeartbeats { get; set; } = 3;
}

/// <summary>
/// Signed policy wrapper (policy JSON + Ed25519 signature).
/// </summary>
public sealed class SignedSecurityPolicy
{
    [JsonPropertyName("policy")]
    public SecurityPolicy Policy { get; set; } = new();

    [JsonPropertyName("signature")]
    public string Signature { get; set; } = string.Empty;
}

/// <summary>
/// Default hardcoded security policy (most restrictive).
/// Used as fail-safe if policy verification fails.
/// As specified in SECURITY_ARCHITECTURE.md Section 18.4.
/// </summary>
public static class DefaultSecurityPolicy
{
    public static SecurityPolicy Create() => new()
    {
        PolicyId = "default",
        Version = 0,
        IssuedAt = DateTime.UtcNow.ToString("O"),
        Policies = new PolicySettings
        {
            Lockdown = new LockdownPolicy
            {
                BlockAltTab = true,
                BlockAltF4 = true,
                BlockCtrlAltDel = true,
                BlockPrintScreen = true,
                BlockRightClick = true,
                DisableClipboard = true,
                DisableTaskbar = true,
                KioskMode = true,
                AlwaysOnTop = true
            },
            ProcessControl = new ProcessControlPolicy
            {
                AllowedProcesses = ["ExamClient.exe", "ExamLauncher.exe"],
                KillUnauthorized = true
            },
            Network = new NetworkPolicy
            {
                AllowedEndpoint = string.Empty,
                BlockAllOtherTraffic = true
            },
            VmDetection = new VmDetectionPolicy
            {
                Enabled = true,
                RefuseOnVm = true
            },
            Monitoring = new MonitoringPolicy
            {
                HeartbeatIntervalSeconds = 30,
                MaxMissedHeartbeats = 3
            }
        }
    };
}
