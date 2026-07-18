using CBT.Shared.Models;
using FluentAssertions;

namespace CBT.ExamClient.Tests.Models;

/// <summary>
/// Tests for security policy models and default policy.
/// Verifies SECURITY_ARCHITECTURE.md Section 18.4 — fail-safe default.
/// </summary>
public class SecurityPolicyTests
{
    [Fact]
    public void DefaultSecurityPolicy_IsMaximumlyRestrictive()
    {
        var policy = DefaultSecurityPolicy.Create();

        policy.Policies.Lockdown.BlockAltTab.Should().BeTrue();
        policy.Policies.Lockdown.BlockAltF4.Should().BeTrue();
        policy.Policies.Lockdown.BlockCtrlAltDel.Should().BeTrue();
        policy.Policies.Lockdown.BlockPrintScreen.Should().BeTrue();
        policy.Policies.Lockdown.BlockRightClick.Should().BeTrue();
        policy.Policies.Lockdown.DisableClipboard.Should().BeTrue();
        policy.Policies.Lockdown.DisableTaskbar.Should().BeTrue();
        policy.Policies.Lockdown.KioskMode.Should().BeTrue();
        policy.Policies.Lockdown.AlwaysOnTop.Should().BeTrue();
    }

    [Fact]
    public void DefaultSecurityPolicy_VmDetectionEnabled()
    {
        var policy = DefaultSecurityPolicy.Create();

        policy.Policies.VmDetection.Enabled.Should().BeTrue();
        policy.Policies.VmDetection.RefuseOnVm.Should().BeTrue();
    }

    [Fact]
    public void DefaultSecurityPolicy_ProcessControl_KillsUnauthorized()
    {
        var policy = DefaultSecurityPolicy.Create();

        policy.Policies.ProcessControl.KillUnauthorized.Should().BeTrue();
        policy.Policies.ProcessControl.AllowedProcesses.Should().Contain("ExamClient.exe");
        policy.Policies.ProcessControl.AllowedProcesses.Should().Contain("ExamLauncher.exe");
    }

    [Fact]
    public void DefaultSecurityPolicy_Monitoring_30sHeartbeat()
    {
        var policy = DefaultSecurityPolicy.Create();

        policy.Policies.Monitoring.HeartbeatIntervalSeconds.Should().Be(30);
        policy.Policies.Monitoring.MaxMissedHeartbeats.Should().Be(3);
    }

    [Fact]
    public void DefaultSecurityPolicy_HasVersionZero()
    {
        var policy = DefaultSecurityPolicy.Create();

        policy.Version.Should().Be(0);
        policy.PolicyId.Should().Be("default");
    }
}
