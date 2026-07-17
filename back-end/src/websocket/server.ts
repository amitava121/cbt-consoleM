import { type FastifyPluginAsync } from "fastify";
import {
    batchSyncAnswers,
    createViolation,
    getAttemptAnswers,
    getRemainingTime,
    logEvent,
    saveAnswer,
    startOrResumeAttempt,
    updateLastQuestionSeen,
} from "../modules/sessions/session-service.js";
import { verifyToken } from "../services/auth.js";
import { eventBuffer, type ClientMessage } from "./messages.js";
import { roomManager, type ClientMetadata } from "./rooms.js";

const WS_TOKEN_QUERY = "token";
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const EVENT_BUFFER_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const websocketPlugin: FastifyPluginAsync = async (app) => {
  await app.register(import("@fastify/websocket"));

  app.get("/ws", { websocket: true }, (socket, req) => {
    const url = new URL(req.raw.url ?? "", "http://localhost");
    const token = url.searchParams.get(WS_TOKEN_QUERY) ?? "";

    let meta: ClientMetadata;
    try {
      const payload = verifyToken(token);
      meta = {
        userId: payload.sub,
        role: payload.role,
        deviceId: payload.deviceId,
        examBatchId: payload.examBatchId,
        attemptId: payload.attemptId,
        lastPongAt: Date.now(),
        connectedAt: Date.now(),
        lastSeqId: 0,
      };
    } catch {
      socket.close(1008, "Invalid token");
      return;
    }

    for (const room of roomManager.getRoomsForSocket(socket, meta)) {
      roomManager.join(room, socket, meta);
    }

    // Send connected confirmation
    roomManager.sendTo(socket, {
      type: "server:connected",
      userId: meta.userId,
      role: meta.role,
      serverTime: Date.now(),
    });

    socket.on("message", async (raw) => {
      let data: ClientMessage;
      try {
        data = JSON.parse(String(raw));
      } catch {
        roomManager.sendTo(socket, {
          type: "server:error",
          message: "Malformed JSON",
        });
        return;
      }

      app.log.debug(
        { wsMessage: data, userId: meta.userId },
        "WebSocket message",
      );

      try {
        await handleMessage(socket, meta, data, app.log);
      } catch (err) {
        app.log.error({ err, userId: meta.userId }, "WS message handler error");
        roomManager.sendTo(socket, {
          type: "server:error",
          message: "Internal server error",
        });
      }
    });

    socket.on("pong", () => {
      roomManager.updateMeta(socket, { lastPongAt: Date.now() });
    });

    socket.on("close", () => {
      // Log disconnection if attempt was active
      if (meta.attemptId) {
        logEvent({
          attemptId: meta.attemptId,
          eventType: "ws_disconnected",
          eventData: { userId: meta.userId },
          severity: "warn",
        }).catch(() => {});
      }
      roomManager.leave(socket);
    });
  });

  // Heartbeat: ping all sockets and terminate unresponsive ones
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const socket of roomManager.allSockets()) {
      const meta = roomManager.getMeta(socket);
      if (!meta) continue;

      if (now - meta.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        app.log.warn(
          { userId: meta.userId, attemptId: meta.attemptId },
          "WebSocket heartbeat timeout; terminating",
        );
        if (meta.attemptId) {
          logEvent({
            attemptId: meta.attemptId,
            eventType: "heartbeat_timeout",
            eventData: { userId: meta.userId, lastPongAt: meta.lastPongAt },
            severity: "error",
          }).catch(() => {});
        }
        socket.terminate();
        roomManager.leave(socket);
        continue;
      }

      if (socket.readyState === 1) {
        socket.ping();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Periodic cleanup of event buffers for finished attempts
  const cleanupTimer = setInterval(() => {
    // Collect all active attempt IDs from connected clients
    const activeAttempts = new Set<string>();
    for (const socket of roomManager.allSockets()) {
      const meta = roomManager.getMeta(socket);
      if (meta?.attemptId) {
        activeAttempts.add(meta.attemptId);
      }
    }
    eventBuffer.cleanup(activeAttempts);
  }, EVENT_BUFFER_CLEANUP_INTERVAL_MS);

  app.addHook("onClose", async () => {
    clearInterval(heartbeatTimer);
    clearInterval(cleanupTimer);
    for (const socket of roomManager.allSockets()) {
      socket.terminate();
      roomManager.leave(socket);
    }
  });
};

async function handleMessage(
  socket: import("ws").WebSocket,
  meta: ClientMetadata,
  data: ClientMessage,
  log: import("fastify").FastifyBaseLogger,
): Promise<void> {
  switch (data.type) {
    case "client:hello": {
      if (data.attemptId !== meta.attemptId) {
        roomManager.sendTo(socket, {
          type: "server:error",
          message: "Attempt ID mismatch with token",
          code: "ATTEMPT_MISMATCH",
        });
        return;
      }

      // Parallel: start/resume attempt + we'll fetch answers after (need session status first)
      const session = await startOrResumeAttempt({
        attemptId: data.attemptId,
      });

      // Fetch answers in parallel with event replay setup
      let replayEvents: Array<{
        seqId: number;
        type: string;
        payload: unknown;
      }> = [];
      const [savedAnswers] = await Promise.all([
        getAttemptAnswers(data.attemptId),
        (async () => {
          if (data.lastEventId !== undefined && data.lastEventId >= 0) {
            const buffered = eventBuffer.getSince(
              data.attemptId,
              data.lastEventId,
            );
            replayEvents = buffered.map((e) => ({
              seqId: e.seqId,
              type: e.type,
              payload: e.payload,
            }));
            meta.lastSeqId = data.lastEventId;
            roomManager.updateMeta(socket, { lastSeqId: data.lastEventId });
          }
        })(),
      ]);

      roomManager.sendTo(socket, {
        type: "session:init",
        attemptId: session.attemptId,
        status: session.status,
        remainingTimeSecs: session.remainingTimeSecs,
        startedAt: session.startedAt,
        submittedAt: session.submittedAt,
        answers: savedAnswers,
        lastQuestionIdSeen: session.lastQuestionIdSeen,
        isReconnected: session.isReconnected,
      });

      if (replayEvents.length > 0) {
        roomManager.sendTo(socket, {
          type: "event:replay",
          events: replayEvents,
        });
      }

      log.info(
        {
          attemptId: data.attemptId,
          userId: meta.userId,
          isReconnected: session.isReconnected,
        },
        "Session initialized via WebSocket",
      );
      break;
    }

    case "answer:save": {
      if (data.attemptId !== meta.attemptId) {
        roomManager.sendTo(socket, {
          type: "server:error",
          message: "Attempt ID mismatch",
          code: "ATTEMPT_MISMATCH",
        });
        return;
      }

      const result = await saveAnswer({
        attemptId: data.attemptId,
        questionId: data.questionId,
        answerData: data.answerData,
        status: data.status,
        timeSpentSecs: data.timeSpentSecs,
        isMarkedForReview: data.isMarkedForReview,
      });

      const seqId = eventBuffer.add(data.attemptId, "answer:ack", {
        questionId: data.questionId,
        status: result.status,
      });

      roomManager.sendTo(socket, {
        type: "answer:ack",
        questionId: data.questionId,
        status: result.status,
        savedAt: Date.now(),
        seqId,
      });
      break;
    }

    case "answer:batch_sync": {
      if (data.attemptId !== meta.attemptId) {
        roomManager.sendTo(socket, {
          type: "server:error",
          message: "Attempt ID mismatch",
          code: "ATTEMPT_MISMATCH",
        });
        return;
      }

      const result = await batchSyncAnswers({
        attemptId: data.attemptId,
        answers: data.answers,
      });

      const seqId = eventBuffer.add(data.attemptId, "answer:batch_ack", {
        savedCount: result.savedCount,
      });

      roomManager.sendTo(socket, {
        type: "answer:batch_ack",
        savedCount: result.savedCount,
        savedAt: Date.now(),
        seqId,
      });
      break;
    }

    case "question:navigate": {
      if (data.attemptId !== meta.attemptId) {
        return;
      }

      await updateLastQuestionSeen(data.attemptId, data.questionId);

      const seqId = eventBuffer.add(data.attemptId, "question:navigate", {
        questionId: data.questionId,
      });

      roomManager.sendTo(socket, {
        type: "answer:ack",
        questionId: data.questionId,
        status: "visited",
        savedAt: Date.now(),
        seqId,
      });
      break;
    }

    case "client:heartbeat": {
      if (data.attemptId !== meta.attemptId) {
        return;
      }

      const { remainingSecs, status } = await getRemainingTime(data.attemptId);

      roomManager.sendTo(socket, {
        type: "session:state_update",
        attemptId: data.attemptId,
        status,
        remainingTimeSecs: remainingSecs,
        serverTime: Date.now(),
      });

      roomManager.updateMeta(socket, { lastPongAt: Date.now() });
      break;
    }

    case "event:log": {
      if (data.attemptId !== meta.attemptId) {
        return;
      }

      await logEvent({
        attemptId: data.attemptId,
        eventType: data.eventType,
        eventData: data.eventData,
        severity: data.severity,
        clientTimestamp: new Date(data.clientTimestamp),
      });

      const seqId = eventBuffer.add(data.attemptId, "event:log", {
        eventType: data.eventType,
      });

      roomManager.sendTo(socket, {
        type: "event:ack",
        eventType: data.eventType,
        savedAt: Date.now(),
        seqId,
      });
      break;
    }

    case "violation:report": {
      if (data.attemptId !== meta.attemptId) {
        return;
      }

      await createViolation({
        attemptId: data.attemptId,
        violationType: data.violationType,
        severity: data.severity,
        description: data.description,
        evidenceUrl: data.evidenceUrl,
      });

      // Notify admin room
      roomManager.broadcast("admin", {
        type: "violation:report",
        attemptId: data.attemptId,
        violationType: data.violationType,
        severity: data.severity,
        serverTime: Date.now(),
      });

      const seqId = eventBuffer.add(data.attemptId, "violation:report", {
        violationType: data.violationType,
        severity: data.severity,
      });

      roomManager.sendTo(socket, {
        type: "violation:ack",
        violationType: data.violationType,
        savedAt: Date.now(),
        seqId,
      });
      break;
    }

    default: {
      roomManager.sendTo(socket, {
        type: "server:error",
        message: `Unknown message type: ${(data as { type: string }).type}`,
      });
    }
  }
}

export default websocketPlugin;
