using CBT.Shared.Models;

namespace CBT.ExamClient.Services;

/// <summary>
/// WebSocket client service interface for real-time exam communication.
/// Events as defined in API_SPECIFICATION.md Section 6.
/// Uses System.Net.WebSockets.ClientWebSocket per CLIENT_ARCHITECTURE.md.
/// </summary>
public interface IWebSocketService
{
    /// <summary>
    /// Current connection state.
    /// </summary>
    bool IsConnected { get; }

    /// <summary>
    /// Connects to the WebSocket server with the given access token.
    /// Connection URL: wss://server/ws?token=accessToken
    /// </summary>
    Task ConnectAsync(string serverEndpoint, string accessToken);

    /// <summary>
    /// Disconnects from the WebSocket server.
    /// </summary>
    Task DisconnectAsync();

    /// <summary>
    /// Sends an answer save event.
    /// Event type: answer:save
    /// </summary>
    Task SendAnswerSaveAsync(AnswerSavePayload payload);

    /// <summary>
    /// Sends a batch of answer save events.
    /// Event type: answer:save_batch
    /// </summary>
    Task SendAnswerSaveBatchAsync(List<AnswerSavePayload> answers);

    /// <summary>
    /// Sends a heartbeat event.
    /// Event type: heartbeat
    /// </summary>
    Task SendHeartbeatAsync(HeartbeatPayload payload);

    /// <summary>
    /// Sends an exam submit event.
    /// Event type: exam:submit
    /// </summary>
    Task SendExamSubmitAsync(ExamSubmitPayload payload);

    /// <summary>
    /// Sends a violation report event.
    /// Event type: violation:report
    /// </summary>
    Task SendViolationReportAsync(ViolationReportPayload payload);

    /// <summary>
    /// Sends a delta sync request.
    /// Event type: sync:delta
    /// </summary>
    Task SendDeltaSyncRequestAsync(SyncDeltaRequestPayload payload);

    /// <summary>
    /// Sends a session resume event.
    /// Event type: session:resume
    /// </summary>
    Task SendSessionResumeAsync(string attemptId);

    // --- Events received from server ---

    /// <summary>Raised when connection is established.</summary>
    event EventHandler<ConnectionOpenPayload>? ConnectionOpened;

    /// <summary>Raised when an answer save is confirmed by server.</summary>
    event EventHandler<AnswerSavedPayload>? AnswerSaved;

    /// <summary>Raised when heartbeat is acknowledged.</summary>
    event EventHandler<HeartbeatAckPayload>? HeartbeatAcknowledged;

    /// <summary>Raised when the exam is paused by admin.</summary>
    event EventHandler<ExamPausedPayload>? ExamPaused;

    /// <summary>Raised when the exam is resumed by admin.</summary>
    event EventHandler<ExamResumedPayload>? ExamResumed;

    /// <summary>Raised when the exam is terminated by admin.</summary>
    event EventHandler<ExamTerminatedPayload>? ExamTerminated;

    /// <summary>Raised when session resume data is received (reconnect).</summary>
    event EventHandler<SessionResumePayload>? SessionResumed;

    /// <summary>Raised when a proctor warning is received.</summary>
    event EventHandler<SessionWarningPayload>? WarningReceived;

    /// <summary>Raised when exam submission is confirmed.</summary>
    event EventHandler<ExamSubmittedPayload>? ExamSubmitted;

    /// <summary>Raised when server auto-submits the exam (timer expired).</summary>
    event EventHandler<SessionAutoSubmittedPayload>? SessionAutoSubmitted;

    /// <summary>Raised when server sends time sync correction.</summary>
    event EventHandler<TimeSyncPayload>? TimeSynced;

    /// <summary>Raised when delta sync response is received.</summary>
    event EventHandler<SyncDeltaResponsePayload>? DeltaSyncReceived;

    /// <summary>Raised when the WebSocket connection is lost.</summary>
    event EventHandler? Disconnected;

    /// <summary>Raised when the WebSocket reconnects successfully.</summary>
    event EventHandler? Reconnected;
}
