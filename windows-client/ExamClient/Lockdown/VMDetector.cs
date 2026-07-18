using System.Diagnostics;
using System.Management;
using Serilog;

namespace CBT.ExamClient.Lockdown;

/// <summary>
/// Detects if the application is running inside a virtual machine.
/// As specified in CLIENT_ARCHITECTURE.md Section 3.3.
/// If VM detected, the client refuses to start.
/// </summary>
public static class VMDetector
{
    private static readonly string[] VmSignatures =
    [
        "VMware", "VirtualBox", "QEMU", "Xen",
        "Hyper-V", "Parallels", "KVM", "Virtual Machine",
        "Virtual", "VBOX", "VMWARE"
    ];

    /// <summary>
    /// Returns true if the current machine is a virtual machine.
    /// </summary>
    public static bool IsVirtualMachine()
    {
        try
        {
            if (CheckComputerModel()) return true;
            if (CheckBios()) return true;
            if (CheckVmProcesses()) return true;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "VM detection check failed — assuming physical machine");
        }

        return false;
    }

    private static bool CheckComputerModel()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Model FROM Win32_ComputerSystem");
            foreach (var obj in searcher.Get())
            {
                var model = obj["Model"]?.ToString() ?? string.Empty;
                if (VmSignatures.Any(s => model.Contains(s, StringComparison.OrdinalIgnoreCase)))
                {
                    Log.Warning("VM detected via computer model: {Model}", model);
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to check computer model for VM");
        }

        return false;
    }

    private static bool CheckBios()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT SMBIOSBIOSVersion, Manufacturer FROM Win32_BIOS");
            foreach (var obj in searcher.Get())
            {
                var bios = obj["SMBIOSBIOSVersion"]?.ToString() ?? string.Empty;
                var manufacturer = obj["Manufacturer"]?.ToString() ?? string.Empty;

                if (VmSignatures.Any(s =>
                    bios.Contains(s, StringComparison.OrdinalIgnoreCase) ||
                    manufacturer.Contains(s, StringComparison.OrdinalIgnoreCase)))
                {
                    Log.Warning("VM detected via BIOS. BIOS: {Bios}, Manufacturer: {Manufacturer}",
                        bios, manufacturer);
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to check BIOS for VM");
        }

        return false;
    }

    private static bool CheckVmProcesses()
    {
        try
        {
            var vmProcessNames = new[]
            {
                "vmtoolsd", "vmwaretray", "vmwareuser",    // VMware
                "VBoxService", "VBoxTray",                  // VirtualBox
                "qemu-ga",                                  // QEMU
                "xenservice",                               // Xen
                "prl_tools",                                // Parallels
            };

            var processes = Process.GetProcesses();
            foreach (var proc in processes)
            {
                try
                {
                    if (vmProcessNames.Any(vp =>
                        proc.ProcessName.Equals(vp, StringComparison.OrdinalIgnoreCase)))
                    {
                        Log.Warning("VM detected via process: {ProcessName}", proc.ProcessName);
                        return true;
                    }
                }
                catch
                {
                    // Some processes may throw AccessDenied
                }
            }
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to check processes for VM");
        }

        return false;
    }
}
