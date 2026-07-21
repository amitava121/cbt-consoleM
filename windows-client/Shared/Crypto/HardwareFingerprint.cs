using System.Security.Cryptography;
using System.Text;

namespace CBT.Shared.Crypto;

/// <summary>
/// Generates a hardware fingerprint for device validation.
/// As specified in SECURITY_ARCHITECTURE.md Section 5.2.
/// hash = SHA256(cpu_id + mac_address + disk_serial + machine_uuid + os_serial)
/// </summary>
public static class HardwareFingerprint
{
    /// <summary>
    /// Generates the hardware hash used for device binding and SQLite key derivation.
    /// </summary>
    public static string Generate()
    {
        var components = new StringBuilder();

        components.Append(GetWmiValue("Win32_Processor", "ProcessorId"));
        components.Append(GetPrimaryMacAddress());
        components.Append(GetWmiValue("Win32_DiskDrive", "SerialNumber"));
        components.Append(GetWmiValue("Win32_ComputerSystemProduct", "UUID"));
        components.Append(GetWmiValue("Win32_OperatingSystem", "SerialNumber"));

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(components.ToString()));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string GetWmiValue(string wmiClass, string property)
    {
        try
        {
            using var searcher = new System.Management.ManagementObjectSearcher(
                $"SELECT {property} FROM {wmiClass}");
            foreach (var obj in searcher.Get())
            {
                var value = obj[property]?.ToString();
                if (!string.IsNullOrWhiteSpace(value))
                    return value.Trim();
            }
        }
        catch
        {
            // WMI query failed — return empty string for this component
        }

        return string.Empty;
    }

    public static string GetPrimaryMacAddress()
    {
        try
        {
            var interfaces = System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces();
            foreach (var ni in interfaces)
            {
                if (ni.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Ethernet &&
                    ni.OperationalStatus == System.Net.NetworkInformation.OperationalStatus.Up)
                {
                    return ni.GetPhysicalAddress().ToString();
                }
            }

            // Fallback: use first available interface with a MAC
            foreach (var ni in interfaces)
            {
                var mac = ni.GetPhysicalAddress().ToString();
                if (!string.IsNullOrEmpty(mac) && mac != "000000000000")
                    return mac;
            }
        }
        catch
        {
            // Network interface query failed
        }

        return string.Empty;
    }
}
