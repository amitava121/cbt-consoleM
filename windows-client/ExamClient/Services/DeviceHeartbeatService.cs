using System.Net;
using System.Net.Sockets;
using System.Windows.Threading;
using CBT.Shared.Configuration;
using CBT.Shared.Crypto;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// Background service that self-registers the device on startup
/// and sends periodic heartbeats so the admin panel shows the device as Online.
/// </summary>
public sealed class DeviceHeartbeatService : IDisposable
{
    private readonly IApiService _apiService;
    private readonly AppSettings _settings;
    private DispatcherTimer? _heartbeatTimer;
    private bool _registered;

    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(30);

    public DeviceHeartbeatService(IApiService apiService, AppSettings settings)
    {
        _apiService = apiService;
        _settings = settings;
    }

    /// <summary>
    /// Self-registers with the server and starts the heartbeat timer.
    /// Safe to call — failures are logged but do not crash the app.
    /// </summary>
    public async Task StartAsync()
    {
        var deviceId = _settings.DeviceId;
        if (string.IsNullOrEmpty(deviceId))
        {
            Log.Warning("DeviceHeartbeatService: no DeviceId in config — skipping self-register");
            return;
        }

        var macAddress = FormatMacAddress(HardwareFingerprint.GetPrimaryMacAddress());
        var hardwareHash = App.HardwareHash;
        var deviceName = Environment.MachineName;
        var localIp = GetLocalIpAddress();

        try
        {
            var response = await _apiService.SelfRegisterAsync(
                deviceId, deviceName, macAddress, hardwareHash, localIp);

            Log.Information("Device self-registered: {DeviceId} — {Message}",
                response.DeviceId, response.Message);
            _registered = true;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Device self-registration failed — will retry on heartbeat");
        }

        // Start heartbeat timer regardless of registration success
        _heartbeatTimer = new DispatcherTimer
        {
            Interval = HeartbeatInterval
        };
        _heartbeatTimer.Tick += async (_, _) => await SendHeartbeatAsync();
        _heartbeatTimer.Start();

        // Send an immediate heartbeat
        await SendHeartbeatAsync();
    }

    private async Task SendHeartbeatAsync()
    {
        if (string.IsNullOrEmpty(_settings.DeviceId))
            return;

        // If not registered yet, try self-register first
        if (!_registered)
        {
            try
            {
                var macAddress = FormatMacAddress(HardwareFingerprint.GetPrimaryMacAddress());
                var hardwareHash = App.HardwareHash;
                var deviceName = Environment.MachineName;
                var localIp = GetLocalIpAddress();

                await _apiService.SelfRegisterAsync(
                    _settings.DeviceId, deviceName, macAddress, hardwareHash, localIp);
                _registered = true;
                Log.Information("Device self-registered on heartbeat retry");
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Self-register retry failed");
                return;
            }
        }

        try
        {
            await _apiService.SendHeartbeatAsync(_settings.DeviceId, GetLocalIpAddress());
            Log.Debug("Heartbeat sent for {DeviceId}", _settings.DeviceId);
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Heartbeat failed for {DeviceId}", _settings.DeviceId);
        }
    }

    /// <summary>
    /// Gets the local IPv4 address of the primary network interface.
    /// </summary>
    private static string? GetLocalIpAddress()
    {
        try
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            foreach (var ip in host.AddressList)
            {
                if (ip.AddressFamily == AddressFamily.InterNetwork)
                    return ip.ToString();
            }
        }
        catch
        {
            // Ignore
        }
        return null;
    }

    /// <summary>
    /// Formats a raw MAC address string (e.g. "001122334455") to "00:11:22:33:44:55".
    /// </summary>
    private static string FormatMacAddress(string raw)
    {
        if (string.IsNullOrEmpty(raw))
            return "00:00:00:00:00:00";

        var clean = raw.Replace(":", "").Replace("-", "");
        if (clean.Length != 12)
            return raw;

        return string.Join(":", Enumerable.Range(0, 6)
            .Select(i => clean.Substring(i * 2, 2)));
    }

    public void Dispose()
    {
        _heartbeatTimer?.Stop();
        _heartbeatTimer = null;
    }
}
