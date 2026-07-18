using System.Text.Json.Serialization;

namespace CBT.Shared.Models;

/// <summary>
/// WebSocket message envelope as defined in API_SPECIFICATION.md Section 7.5.
/// </summary>
public sealed class WsMessage<T>
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("data")]
    public T? Data { get; set; }

    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;
}

/// <summary>
/// Non-generic WebSocket message for deserialization when type is unknown.
/// </summary>
public sealed class WsMessage
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("data")]
    public System.Text.Json.JsonElement? Data { get; set; }

    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;

    [JsonPropertyName("error")]
    public WsError? Error { get; set; }
}

public sealed class WsError
{
    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;
}

// --- Candidate -> Server event payloads ---

public sealed class AnswerSavePayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("questionId")]
    public string QuestionId { get; set; } = string.Empty;

    [JsonPropertyName("answerData")]
    public AnswerData? AnswerData { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("timeSpentSecs")]
    public int TimeSpentSecs { get; set; }

    [JsonPropertyName("nonce")]
    public string Nonce { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;

    [JsonPropertyName("signature")]
    public string Signature { get; set; } = string.Empty;
}

public sealed class HeartbeatPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("currentQuestionId")]
    public string CurrentQuestionId { get; set; } = string.Empty;

    [JsonPropertyName("remainingTimeSecs")]
    public int RemainingTimeSecs { get; set; }

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;
}

public sealed class ExamSubmitPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("nonce")]
    public string Nonce { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;

    [JsonPropertyName("signature")]
    public string Signature { get; set; } = string.Empty;
}

public sealed class ViolationReportPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("violationType")]
    public string ViolationType { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = string.Empty;
}

// --- Server -> Client event payloads ---

public sealed class ConnectionOpenPayload
{
    [JsonPropertyName("connectionId")]
    public string ConnectionId { get; set; } = string.Empty;

    [JsonPropertyName("serverTime")]
    public string ServerTime { get; set; } = string.Empty;

    [JsonPropertyName("heartbeatInterval")]
    public int HeartbeatInterval { get; set; }
}

public sealed class AnswerSavedPayload
{
    [JsonPropertyName("questionId")]
    public string QuestionId { get; set; } = string.Empty;

    [JsonPropertyName("serverTimestamp")]
    public string ServerTimestamp { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}

public sealed class HeartbeatAckPayload
{
    [JsonPropertyName("serverTime")]
    public string ServerTime { get; set; } = string.Empty;

    [JsonPropertyName("remainingTimeSecs")]
    public int RemainingTimeSecs { get; set; }

    [JsonPropertyName("driftSecs")]
    public int DriftSecs { get; set; }
}

public sealed class ExamPausedPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;

    [JsonPropertyName("pausedAt")]
    public string PausedAt { get; set; } = string.Empty;
}

public sealed class ExamResumedPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("remainingTimeSecs")]
    public int RemainingTimeSecs { get; set; }

    [JsonPropertyName("resumedAt")]
    public string ResumedAt { get; set; } = string.Empty;
}

public sealed class ExamTerminatedPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string Reason { get; set; } = string.Empty;

    [JsonPropertyName("terminatedAt")]
    public string TerminatedAt { get; set; } = string.Empty;
}

public sealed class SessionResumePayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("remainingTimeSecs")]
    public int RemainingTimeSecs { get; set; }

    [JsonPropertyName("lastQuestionId")]
    public string LastQuestionId { get; set; } = string.Empty;

    [JsonPropertyName("unsyncedCount")]
    public int UnsyncedCount { get; set; }
}

public sealed class SessionWarningPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; set; } = string.Empty;

    [JsonPropertyName("fromProctor")]
    public bool FromProctor { get; set; }
}

public sealed class ExamSubmittedPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("submittedAt")]
    public string SubmittedAt { get; set; } = string.Empty;
}

public sealed class TimeSyncPayload
{
    [JsonPropertyName("serverTime")]
    public string ServerTime { get; set; } = string.Empty;

    [JsonPropertyName("remainingTimeSecs")]
    public int RemainingTimeSecs { get; set; }

    [JsonPropertyName("driftSecs")]
    public int DriftSecs { get; set; }
}

public sealed class SyncDeltaRequestPayload
{
    [JsonPropertyName("attemptId")]
    public string AttemptId { get; set; } = string.Empty;
}

public sealed class SyncDeltaResponsePayload
{
    [JsonPropertyName("answers")]
    public List<ServerAnswerState> Answers { get; set; } = [];
}

public sealed class ServerAnswerState
{
    [JsonPropertyName("questionId")]
    public string QuestionId { get; set; } = string.Empty;

    [JsonPropertyName("updatedAt")]
    public string UpdatedAt { get; set; } = string.Empty;
}
