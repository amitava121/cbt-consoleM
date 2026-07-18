using System.Net.Security;
using System.Net.WebSockets;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using CBT.Shared.Configuration;
using CBT.Shared.Models;
using Serilog;

namespace CBT.ExamClient.Services;

/// <summary>
/// WebSocket client service using System.Net.WebSockets.ClientWebSocket.
/// As specified in CLIENT_ARCHITECTURE.md Section 2.1.
/// Implements reconnection strategy from CLIENT_ARCHITECTURE.md Section 9.
/// </summary>
public sealed class WebSocketService : IWebSocketService, IDisposable
{
    private ClientWebSocket? _ws;
    private CancellationTokenSource? _receiveCts;
    private readonly AppSettings _settings;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    private string? _serverEndpoint;
    private string? _accessToken;
    private int _reconnectAttempt;
    private bool _intentionalDisconnect;

    public bool IsConnected => _ws?.State == WebSocketState.Open;

    // Events
    public event EventHandler<ConnectionOpenPayload>? ConnectionOpened;
    public event EventHandler<AnswerSavedPayload>? AnswerSaved;
    public event EventHandler<HeartbeatAckPayload>? HeartbeatAcknowledged;
    public event EventHandler<ExamPausedPayload>? ExamPaused;
    public event EventHandler<ExamResumedPayload>? ExamResumed;
    public event EventHandler<ExamTerminatedPayload>? ExamTerminated;
    public event EventHandler<SessionResumePayload>? SessionResumed;
    public event EventHandler<SessionWarningPayload>? WarningReceived;
    public event EventHandler<ExamSubmittedPayload>? ExamSubmitted;
    public event EventHandler<TimeSyncPayload>? TimeSynced;
    public event EventHandler<SyncDeltaResponsePayload>? DeltaSyncReceived;
    public event EventHandler? Disconnected;
    public event EventHandler? Reconnected;

    public WebSocketService(AppSettings settings)
    {
        _settings = settings;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };
    }

    public async Task ConnectAsync(string serverEndpoint, string accessToken)
    {
        _serverEndpoint = serverEndpoint;
        _accessToken = accessToken;
        _intentionalDisconnect = false;
        _reconnectAttempt = 0;

        await ConnectInternalAsync();
    }

    private async Task ConnectInternalAsync()
    {
        _ws?.Dispose();
        _ws = new ClientWebSocket();

        // Certificate pinning for WebSocket
        _ws.Options.RemoteCertificateValidationCallback = ValidateCertificate;

        // Connect with token as query parameter (per API_SPECIFICATION.md Section 2.4)
        var wsUrl = _serverEndpoint!
            .Replace("https://", "wss://")
            .Replace("http://", "ws://")
            .TrimEnd('/') + $"/ws?token={_accessToken}";

        try
        {
            _receiveCts = new CancellationTokenSource();
            await _ws.ConnectAsync(new Uri(wsUrl), _receiveCts.Token);

            Log.Information("WebSocket connected to {Endpoint}", _serverEndpoint);
            _reconnectAttempt = 0;

            // Start receiving messages
            _ = Task.Run(() => ReceiveLoopAsync(_receiveCts.Token));
        }
        catch (Exception ex)
        {
            Log.Error(ex, "WebSocket connection failed");
            throw;
        }
    }

    private bool ValidateCertificate(object sender, X509Certificate? cert,
        X509Chain? chain, SslPolicyErrors errors)
    {
        if (errors == SslPolicyErrors.None) return true;

        if (!string.IsNullOrEmpty(_settings.CertificateFingerprint) && cert is not null)
        {
            var fingerprint = cert.GetCertHashString();
            return string.Equals(fingerprint, _settings.CertificateFingerprint,
                StringComparison.OrdinalIgnoreCase);
        }

        return errors == SslPolicyErrors.RemoteCertificateChainErrors;
    }

    public async Task DisconnectAsync()
    {
        _intentionalDisconnect = true;
        _receiveCts?.Cancel();

        if (_ws?.State == WebSocketState.Open)
        {
            try
            {
                await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client disconnect",
                    CancellationToken.None);
            }
            catch { }
        }

        Log.Information("WebSocket disconnected intentionally");
    }

    // --- Send Methods ---

    public async Task SendAnswerSaveAsync(AnswerSavePayload payload)
    {
        await SendEventAsync("answer:save", payload);
    }

    public async Task SendAnswerSaveBatchAsync(List<AnswerSavePayload> answers)
    {
        await SendEventAsync("answer:save_batch", new { answers });
    }

    public async Task SendHeartbeatAsync(HeartbeatPayload payload)
    {
        await SendEventAsync("heartbeat", payload);
    }

    public async Task SendExamSubmitAsync(ExamSubmitPayload payload)
    {
        await SendEventAsync("exam:submit", payload);
    }

    public async Task SendViolationReportAsync(ViolationReportPayload payload)
    {
        await SendEventAsync("violation:report", payload);
    }

    public async Task SendDeltaSyncRequestAsync(SyncDeltaRequestPayload payload)
    {
        await SendEventAsync("sync:delta", payload);
    }

    public async Task SendSessionResumeAsync(string attemptId)
    {
        await SendEventAsync("session:resume", new { attemptId });
    }

    private async Task SendEventAsync<T>(string type, T data)
    {
        if (_ws?.State != WebSocketState.Open)
        {
            Log.Warning("Cannot send WebSocket event {Type} — not connected", type);
            throw new InvalidOperationException("WebSocket is not connected");
        }

        var message = new WsMessage<T>
        {
            Type = type,
            Data = data,
            Id = Guid.NewGuid().ToString(),
            Timestamp = DateTime.UtcNow.ToString("O")
        };

        var json = JsonSerializer.Serialize(message, _jsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);

        // SemaphoreSlim ensures no concurrent sends corrupt WebSocket frames
        await _sendLock.WaitAsync();
        try
        {
            await _ws.SendAsync(new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text, true, CancellationToken.None);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    // --- Receive Loop ---

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var buffer = new byte[8192];
        var messageBuffer = new StringBuilder();

        try
        {
            while (!ct.IsCancellationRequested && _ws?.State == WebSocketState.Open)
            {
                var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    Log.Information("WebSocket server sent close frame: {Status} {Description}",
                        result.CloseStatus, result.CloseStatusDescription);
                    break;
                }

                messageBuffer.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));

                if (result.EndOfMessage)
                {
                    var json = messageBuffer.ToString();
                    messageBuffer.Clear();
                    ProcessMessage(json);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on disconnect
        }
        catch (WebSocketException ex)
        {
            Log.Warning(ex, "WebSocket receive error");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Unexpected error in WebSocket receive loop");
        }

        // Connection lost — trigger reconnect if not intentional
        if (!_intentionalDisconnect)
        {
            Disconnected?.Invoke(this, EventArgs.Empty);
            _ = Task.Run(() => ReconnectAsync());
        }
    }

    private void ProcessMessage(string json)
    {
        try
        {
            var message = JsonSerializer.Deserialize<WsMessage>(json, _jsonOptions);
            if (message is null) return;

            switch (message.Type)
            {
                case "connection:open":
                    var connPayload = Deserialize<ConnectionOpenPayload>(message.Data);
                    if (connPayload is not null) ConnectionOpened?.Invoke(this, connPayload);
                    break;

                case "answer:saved":
                    var savedPayload = Deserialize<AnswerSavedPayload>(message.Data);
                    if (savedPayload is not null) AnswerSaved?.Invoke(this, savedPayload);
                    break;

                case "heartbeat:ack":
                    var hbPayload = Deserialize<HeartbeatAckPayload>(message.Data);
                    if (hbPayload is not null) HeartbeatAcknowledged?.Invoke(this, hbPayload);
                    break;

                case "exam:paused":
                    var pausedPayload = Deserialize<ExamPausedPayload>(message.Data);
                    if (pausedPayload is not null) ExamPaused?.Invoke(this, pausedPayload);
                    break;

                case "exam:resumed":
                    var resumedPayload = Deserialize<ExamResumedPayload>(message.Data);
                    if (resumedPayload is not null) ExamResumed?.Invoke(this, resumedPayload);
                    break;

                case "exam:terminated":
                    var termPayload = Deserialize<ExamTerminatedPayload>(message.Data);
                    if (termPayload is not null) ExamTerminated?.Invoke(this, termPayload);
                    break;

                case "session:resume":
                    var resumePayload = Deserialize<SessionResumePayload>(message.Data);
                    if (resumePayload is not null) SessionResumed?.Invoke(this, resumePayload);
                    break;

                case "session:warning":
                    var warnPayload = Deserialize<SessionWarningPayload>(message.Data);
                    if (warnPayload is not null) WarningReceived?.Invoke(this, warnPayload);
                    break;

                case "exam:submitted":
                    var submitPayload = Deserialize<ExamSubmittedPayload>(message.Data);
                    if (submitPayload is not null) ExamSubmitted?.Invoke(this, submitPayload);
                    break;

                case "session:time_sync":
                    var syncPayload = Deserialize<TimeSyncPayload>(message.Data);
                    if (syncPayload is not null) TimeSynced?.Invoke(this, syncPayload);
                    break;

                case "sync:delta":
                    var deltaPayload = Deserialize<SyncDeltaResponsePayload>(message.Data);
                    if (deltaPayload is not null) DeltaSyncReceived?.Invoke(this, deltaPayload);
                    break;

                default:
                    Log.Debug("Unknown WebSocket event type: {Type}", message.Type);
                    break;
            }
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Error processing WebSocket message");
        }
    }

    private T? Deserialize<T>(JsonElement? element)
    {
        if (element is null) return default;
        return JsonSerializer.Deserialize<T>(element.Value.GetRawText(), _jsonOptions);
    }

    // --- Reconnection Strategy (CLIENT_ARCHITECTURE.md Section 9.1) ---

    private async Task ReconnectAsync()
    {
        while (!_intentionalDisconnect)
        {
            _reconnectAttempt++;

            // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, max 30s
            var baseDelay = Math.Min(30, Math.Pow(2, Math.Min(_reconnectAttempt - 1, 4)));
            var jitter = baseDelay * 0.2 * (Random.Shared.NextDouble() * 2 - 1); // ±20%
            var delay = TimeSpan.FromSeconds(baseDelay + jitter);

            Log.Information("WebSocket reconnect attempt {Attempt} in {Delay:F1}s",
                _reconnectAttempt, delay.TotalSeconds);

            await Task.Delay(delay);

            if (_intentionalDisconnect) break;

            try
            {
                await ConnectInternalAsync();

                if (IsConnected)
                {
                    Log.Information("WebSocket reconnected successfully after {Attempts} attempts",
                        _reconnectAttempt);
                    Reconnected?.Invoke(this, EventArgs.Empty);
                    return;
                }
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Reconnect attempt {Attempt} failed", _reconnectAttempt);
            }
        }
    }

    public void Dispose()
    {
        _intentionalDisconnect = true;
        _receiveCts?.Cancel();
        _receiveCts?.Dispose();
        _ws?.Dispose();
        _sendLock.Dispose();
    }
}
