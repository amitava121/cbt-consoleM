/**
 * WebSocket message protocol types for exam session management.
 * All messages follow a typed envelope with `type` discriminator.
 */

// ─── Client → Server messages ───────────────────────────────────

export interface ClientHello {
  type: "client:hello";
  attemptId: string;
  deviceFingerprint?: string;
  lastEventId?: number;
}

export interface AnswerSaveMessage {
  type: "answer:save";
  attemptId: string;
  questionId: string;
  answerData: unknown;
  status:
    | "not_visited"
    | "visited"
    | "answered"
    | "marked_for_review"
    | "answered_and_marked";
  timeSpentSecs: number;
  isMarkedForReview: boolean;
  clientTimestamp: number;
  idempotencyKey: string;
}

export interface AnswerBatchSyncMessage {
  type: "answer:batch_sync";
  attemptId: string;
  answers: Array<{
    questionId: string;
    answerData: unknown;
    status:
      | "not_visited"
      | "visited"
      | "answered"
      | "marked_for_review"
      | "answered_and_marked";
    timeSpentSecs: number;
    isMarkedForReview: boolean;
  }>;
  clientTimestamp: number;
  idempotencyKey: string;
}

export interface QuestionNavigationMessage {
  type: "question:navigate";
  attemptId: string;
  questionId: string;
  clientTimestamp: number;
}

export interface HeartbeatMessage {
  type: "client:heartbeat";
  attemptId: string;
  clientTimestamp: number;
}

export interface EventLogMessage {
  type: "event:log";
  attemptId: string;
  eventType: string;
  eventData: unknown;
  severity: "info" | "warn" | "error";
  clientTimestamp: number;
}

export interface ViolationReportMessage {
  type: "violation:report";
  attemptId: string;
  violationType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidenceUrl?: string;
  clientTimestamp: number;
}

export type ClientMessage =
  | ClientHello
  | AnswerSaveMessage
  | AnswerBatchSyncMessage
  | QuestionNavigationMessage
  | HeartbeatMessage
  | EventLogMessage
  | ViolationReportMessage;

// ─── Server → Client messages ───────────────────────────────────

export interface ServerConnected {
  type: "server:connected";
  userId: string;
  role: string;
  serverTime: number;
}

export interface SessionInitMessage {
  type: "session:init";
  attemptId: string;
  status: string;
  remainingTimeSecs: number;
  startedAt: number | null;
  submittedAt: number | null;
  answers: Record<
    string,
    {
      answerData: unknown;
      status: string;
      timeSpentSecs: number;
      isMarkedForReview: boolean;
    }
  >;
  lastQuestionIdSeen: string | null;
  isReconnected: boolean;
}

export interface SessionStateUpdate {
  type: "session:state_update";
  attemptId: string;
  status: string;
  remainingTimeSecs: number;
  serverTime: number;
}

export interface AnswerAckMessage {
  type: "answer:ack";
  questionId: string;
  status: string;
  savedAt: number;
  seqId: number;
}

export interface AnswerBatchAckMessage {
  type: "answer:batch_ack";
  savedCount: number;
  savedAt: number;
  seqId: number;
}

export interface AnswerErrorMessage {
  type: "answer:error";
  questionId: string;
  message: string;
}

export interface SessionPausedMessage {
  type: "session:paused";
  attemptId: string;
  reason: string;
  serverTime: number;
}

export interface SessionResumedMessage {
  type: "session:resumed";
  attemptId: string;
  remainingTimeSecs: number;
  serverTime: number;
}

export interface SessionFinishedMessage {
  type: "session:finished";
  attemptId: string;
  finishReason:
    | "submitted"
    | "auto_submitted"
    | "force_submitted"
    | "terminated"
    | "time_expired";
  serverTime: number;
}

export interface ErrorMessage {
  type: "server:error";
  message: string;
  code?: string;
}

export interface EventReplayMessage {
  type: "event:replay";
  events: Array<{ seqId: number; type: string; payload: unknown }>;
}

export interface AdminBroadcastMessage {
  type: "admin:broadcast";
  room: string;
  message: string;
  serverTime: number;
}

export interface ProctorActionMessage {
  type: "proctor:action";
  attemptId: string;
  action: "warn" | "pause" | "terminate" | "message" | "dismiss";
  message?: string;
  serverTime: number;
}

export interface EventAckMessage {
  type: "event:ack";
  eventType: string;
  savedAt: number;
  seqId: number;
}

export interface ViolationAckMessage {
  type: "violation:ack";
  violationType: string;
  savedAt: number;
  seqId: number;
}

export type ServerMessage =
  | ServerConnected
  | SessionInitMessage
  | SessionStateUpdate
  | AnswerAckMessage
  | AnswerBatchAckMessage
  | AnswerErrorMessage
  | SessionPausedMessage
  | SessionResumedMessage
  | SessionFinishedMessage
  | ErrorMessage
  | EventReplayMessage
  | AdminBroadcastMessage
  | ProctorActionMessage
  | EventAckMessage
  | ViolationAckMessage;

// ─── Event buffer for reconnection replay ───────────────────────

export interface BufferedEvent {
  seqId: number;
  type: string;
  payload: unknown;
  timestamp: number;
}

/**
 * Per-attempt event buffer for reconnection replay.
 * Bounded to MAX_EVENTS events with TTL eviction.
 */
export class EventBuffer {
  private buffer = new Map<string, BufferedEvent[]>();
  private nextSeqId = new Map<string, number>();
  private static readonly MAX_EVENTS = 200;
  private static readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  add(attemptId: string, type: string, payload: unknown): number {
    const seqId = (this.nextSeqId.get(attemptId) ?? 0) + 1;
    this.nextSeqId.set(attemptId, seqId);

    if (!this.buffer.has(attemptId)) {
      this.buffer.set(attemptId, []);
    }

    const events = this.buffer.get(attemptId)!;
    events.push({ seqId, type, payload, timestamp: Date.now() });

    // Evict old events beyond MAX_EVENTS or TTL
    const cutoff = Date.now() - EventBuffer.TTL_MS;
    while (
      events.length > EventBuffer.MAX_EVENTS ||
      (events.length > 0 && events[0].timestamp < cutoff)
    ) {
      events.shift();
    }

    return seqId;
  }

  getSince(attemptId: string, lastSeqId: number): BufferedEvent[] {
    const events = this.buffer.get(attemptId);
    if (!events) return [];
    return events.filter((e) => e.seqId > lastSeqId);
  }

  clear(attemptId: string) {
    this.buffer.delete(attemptId);
    this.nextSeqId.delete(attemptId);
  }

  /** Clean up all buffers for finished attempts. Call periodically. */
  cleanup(activeAttemptIds: Set<string>) {
    for (const key of this.buffer.keys()) {
      if (!activeAttemptIds.has(key)) {
        this.buffer.delete(key);
        this.nextSeqId.delete(key);
      }
    }
  }
}

export const eventBuffer = new EventBuffer();
