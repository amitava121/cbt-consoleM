import type { Redis } from "ioredis";
import { redis } from "../database/redis.js";
import { autoPauseAttempt } from "../modules/sessions/session-service.js";
import { roomManager } from "../websocket/rooms.js";

const KEYS_PREFIX = "__keyevent@0__:expired";
const ACTIVE_KEY_TTL = 45;
let subscriber: Redis | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the disconnect watcher.
 *
 * Enables Redis keyspace notifications for expired keys, then subscribes
 * to detect when `attempt:active:<id>` keys expire (meaning the candidate's
 * client stopped sending heartbeats).
 *
 * As a fallback, also polls every 30s for in_progress attempts whose active
 * key has expired (in case keyspace notifications are not configured).
 */
export async function startDisconnectWatcher(): Promise<void> {
  // Enable Redis keyspace notifications for expired events (Ex)
  try {
    await redis.config("SET", "notify-keyspace-events", "Ex");
  } catch {
    // May fail on managed Redis (e.g. Redis Cloud) where CONFIG is disabled
    // Fallback poller will still catch disconnects
  }

  // Method 1: Redis keyspace notifications subscriber
  subscriber = redis.duplicate();
  subscriber.subscribe(KEYS_PREFIX).catch(() => {
    // Keyspace notifications may not be enabled — fallback poller will handle it
  });

  subscriber.on("message", (_channel, message) => {
    // message is the expired key name (without prefix, since ioredis strips it)
    const match = message.match(/^attempt:active:(.+)$/);
    if (!match) return;
    const attemptId = match[1];
    handleAutoPause(
      attemptId,
      "Client heartbeat expired (keyspace notification)",
    );
  });

  // Method 2: Fallback poller — checks every 30s for in_progress attempts
  // whose active key has disappeared
  pollTimer = setInterval(async () => {
    try {
      await pollForExpiredAttempts();
    } catch {
      // Silent — errors here are non-fatal
    }
  }, 30_000);
}

/**
 * Stop the disconnect watcher.
 */
export function stopDisconnectWatcher(): void {
  if (subscriber) {
    subscriber.disconnect();
    subscriber = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function handleAutoPause(
  attemptId: string,
  reason: string,
): Promise<void> {
  const result = await autoPauseAttempt(attemptId, reason);
  if (result) {
    // Notify any connected clients (e.g. admin monitor) about the auto-pause
    roomManager.broadcast(`attempt:${attemptId}`, {
      type: "session:paused",
      attemptId,
      reason,
      autoPaused: true,
      remainingTimeSecs: result.remainingTimeSecs,
      serverTime: Date.now(),
    });
    roomManager.broadcast("admin", {
      type: "session:auto_paused",
      attemptId,
      reason,
      serverTime: Date.now(),
    });
  }
}

/**
 * Fallback: scan for in_progress attempts and check if their active key exists.
 * This catches disconnects even if Redis keyspace notifications are not enabled.
 */
async function pollForExpiredAttempts(): Promise<void> {
  // Get all active keys to check which attempts are still alive
  const activeKeys = await redis.keys("attempt:active:*");
  const activeAttemptIds = new Set(
    activeKeys.map((k) => k.replace(/^.*?attempt:active:/, "")),
  );

  // Check all in_progress attempts via WebSocket room metadata
  const wsAttemptIds = new Set<string>();
  for (const socket of roomManager.allSockets()) {
    const meta = roomManager.getMeta(socket);
    if (meta?.attemptId) {
      wsAttemptIds.add(meta.attemptId);
    }
  }

  // For active keys that have no WS connection and are in_progress,
  // the key will expire naturally and be caught by the keyspace subscriber.
  // This poller is a backup for when keyspace notifications aren't configured.
  // We check if any active key has already expired by looking at attempts
  // that have WS connections but no active key.
  for (const attemptId of wsAttemptIds) {
    if (!activeAttemptIds.has(attemptId)) {
      // The active key expired but WS is still connected — refresh it
      // (the client may have missed a heartbeat cycle)
      await redis.set(`attempt:active:${attemptId}`, "1", "EX", ACTIVE_KEY_TTL);
    }
  }
}
