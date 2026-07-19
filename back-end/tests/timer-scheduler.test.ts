import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Set env vars before importing app code ---
process.env.JWT_SECRET = "test-secret-at-least-32-characters-long!!";
process.env.DATABASE_URL = "postgresql://fake:fake@localhost:5432/fake";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

// --- Hoisted shared state (available inside vi.mock factories) ---
const hoisted = vi.hoisted(() => {
  const RedisMock = require("ioredis-mock").default;
  return {
    mockRedis: new RedisMock(),
    autoSubmitAttemptMock: vi.fn(),
    broadcastMock: vi.fn(),
    selectResult: [] as any[],
  };
});

function setDbResult(rows: any[]) {
  hoisted.selectResult.length = 0;
  hoisted.selectResult.push(...rows);
}

// --- Mocks (hoisted by vitest) ---

vi.mock("../src/database/redis.js", () => ({
  redis: hoisted.mockRedis,
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/database/db.js", () => {
  const limitMock = vi.fn(() => Promise.resolve(hoisted.selectResult));
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return {
    db: { select: selectMock },
    closePool: vi.fn().mockResolvedValue(undefined),
    getPoolStats: vi.fn().mockReturnValue({ total: 0, idle: 0, waiting: 0 }),
  };
});

vi.mock("../src/modules/sessions/session-service.js", () => ({
  autoSubmitAttempt: hoisted.autoSubmitAttemptMock,
}));

vi.mock("../src/websocket/rooms.js", () => ({
  roomManager: {
    broadcast: hoisted.broadcastMock,
    getRoomSockets: vi.fn().mockReturnValue([]),
    getRoomSize: vi.fn().mockReturnValue(0),
  },
}));

// --- Import after mocks are set up ---
import {
  scheduleAutoSubmit,
  cancelAutoSubmit,
  promoterTick,
  fallbackTick,
  startTimerScheduler,
  stopTimerScheduler,
} from "../src/services/timer-scheduler.js";

const ZSET_KEY = "timer:autosubmit";
const mockRedis = hoisted.mockRedis;
const autoSubmitAttemptMock = hoisted.autoSubmitAttemptMock;
const broadcastMock = hoisted.broadcastMock;

function makeMember(attemptId: string, candidateId: string): string {
  return JSON.stringify({ attemptId, candidateId });
}

// --- Tests ---

describe("Timer Scheduler (M2.10) — Redis ZSET", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await mockRedis.flushall();
    hoisted.selectResult.length = 0;
  });

  afterEach(() => {
    stopTimerScheduler();
  });

  describe("scheduleAutoSubmit()", () => {
    it("adds a job to the Redis ZSET with the correct score", async () => {
      const expiry = Date.now() + 180 * 1000;
      await scheduleAutoSubmit("att-1", "cand-1", expiry);

      const score = await mockRedis.zscore(ZSET_KEY, makeMember("att-1", "cand-1"));
      expect(Number(score)).toBe(expiry);
    });

    it("can schedule multiple attempts", async () => {
      const now = Date.now();
      await scheduleAutoSubmit("att-1", "cand-1", now + 1000);
      await scheduleAutoSubmit("att-2", "cand-2", now + 2000);
      await scheduleAutoSubmit("att-3", "cand-3", now + 3000);

      expect(await mockRedis.zcard(ZSET_KEY)).toBe(3);
    });

    it("overwrites if same member is re-scheduled", async () => {
      const now = Date.now();
      await scheduleAutoSubmit("att-1", "cand-1", now + 1000);
      await scheduleAutoSubmit("att-1", "cand-1", now + 5000);

      expect(await mockRedis.zcard(ZSET_KEY)).toBe(1);
      const score = await mockRedis.zscore(ZSET_KEY, makeMember("att-1", "cand-1"));
      expect(Number(score)).toBe(now + 5000);
    });
  });

  describe("cancelAutoSubmit()", () => {
    it("removes a scheduled job from the ZSET", async () => {
      await scheduleAutoSubmit("att-1", "cand-1", Date.now() + 5000);
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(1);

      await cancelAutoSubmit("att-1");
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(0);
    });

    it("is a no-op if the attempt was never scheduled", async () => {
      await cancelAutoSubmit("nonexistent-att");
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(0);
    });

    it("only removes the matching attempt, not others", async () => {
      const now = Date.now();
      await scheduleAutoSubmit("att-1", "cand-1", now + 5000);
      await scheduleAutoSubmit("att-2", "cand-2", now + 5000);

      await cancelAutoSubmit("att-1");
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(1);

      const remaining = await mockRedis.zrange(ZSET_KEY, 0, -1);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toContain("att-2");
    });
  });

  describe("promoterTick()", () => {
    it("does nothing when ZSET is empty", async () => {
      await promoterTick();
      expect(autoSubmitAttemptMock).not.toHaveBeenCalled();
      expect(broadcastMock).not.toHaveBeenCalled();
    });

    it("does nothing when no jobs are due", async () => {
      await scheduleAutoSubmit("att-1", "cand-1", Date.now() + 60_000);

      await promoterTick();

      expect(autoSubmitAttemptMock).not.toHaveBeenCalled();
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(1);
    });

    it("auto-submits a due job when attempt is in_progress", async () => {
      await scheduleAutoSubmit("att-1", "cand-1", Date.now() - 1000);
      setDbResult([{ status: "in_progress" }]);

      await promoterTick();

      expect(autoSubmitAttemptMock).toHaveBeenCalledTimes(1);
      expect(autoSubmitAttemptMock).toHaveBeenCalledWith("att-1", "time_expired");

      expect(broadcastMock).toHaveBeenCalledTimes(2);
      expect(broadcastMock).toHaveBeenCalledWith(
        "attempt:att-1",
        expect.objectContaining({
          type: "session:auto_submitted",
          attemptId: "att-1",
          candidateId: "cand-1",
          reason: "time_expired",
        }),
      );
      expect(broadcastMock).toHaveBeenCalledWith(
        "user:cand-1",
        expect.objectContaining({
          type: "session:auto_submitted",
          attemptId: "att-1",
        }),
      );

      expect(await mockRedis.zcard(ZSET_KEY)).toBe(0);
    });

    it("skips a due job when attempt is already submitted", async () => {
      await scheduleAutoSubmit("att-1", "cand-1", Date.now() - 1000);
      setDbResult([{ status: "submitted" }]);

      await promoterTick();

      expect(autoSubmitAttemptMock).not.toHaveBeenCalled();
      expect(broadcastMock).not.toHaveBeenCalled();
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(0);
    });

    it("skips a due job when attempt is not found in DB", async () => {
      await scheduleAutoSubmit("att-ghost", "cand-1", Date.now() - 1000);
      setDbResult([]);

      await promoterTick();

      expect(autoSubmitAttemptMock).not.toHaveBeenCalled();
      expect(broadcastMock).not.toHaveBeenCalled();
    });

    it("processes multiple due jobs concurrently", async () => {
      const past = Date.now() - 1000;
      await scheduleAutoSubmit("att-1", "cand-1", past);
      await scheduleAutoSubmit("att-2", "cand-2", past);
      await scheduleAutoSubmit("att-3", "cand-3", past);
      setDbResult([{ status: "in_progress" }]);

      await promoterTick();

      expect(autoSubmitAttemptMock).toHaveBeenCalledTimes(3);
      const callArgs = autoSubmitAttemptMock.mock.calls.map((c) => c[0]);
      expect(callArgs).toContain("att-1");
      expect(callArgs).toContain("att-2");
      expect(callArgs).toContain("att-3");
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(0);
    });

    it("does not process future jobs even when some are due", async () => {
      await scheduleAutoSubmit("att-due", "cand-1", Date.now() - 1000);
      await scheduleAutoSubmit("att-future", "cand-2", Date.now() + 60_000);
      setDbResult([{ status: "in_progress" }]);

      await promoterTick();

      expect(autoSubmitAttemptMock).toHaveBeenCalledTimes(1);
      expect(autoSubmitAttemptMock).toHaveBeenCalledWith("att-due", "time_expired");
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(1);
    });
  });

  describe("fallbackTick()", () => {
    it("does nothing when DB returns no expired attempts", async () => {
      setDbResult([]);
      await fallbackTick();
      expect(autoSubmitAttemptMock).not.toHaveBeenCalled();
    });

    it("auto-submits expired attempts found via DB scan", async () => {
      setDbResult([{ id: "att-1", candidateId: "cand-1", status: "in_progress" }]);
      await fallbackTick();
      expect(autoSubmitAttemptMock).toHaveBeenCalledTimes(1);
      expect(autoSubmitAttemptMock).toHaveBeenCalledWith("att-1", "time_expired");
    });

    it("skips attempts that are no longer in_progress", async () => {
      setDbResult([{ id: "att-1", candidateId: "cand-1", status: "submitted" }]);
      await fallbackTick();
      expect(autoSubmitAttemptMock).not.toHaveBeenCalled();
    });
  });

  describe("startTimerScheduler() / stopTimerScheduler()", () => {
    it("starts and stops without error", () => {
      expect(() => startTimerScheduler()).not.toThrow();
      expect(() => stopTimerScheduler()).not.toThrow();
    });

    it("warns when started twice without stopping", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      startTimerScheduler();
      startTimerScheduler();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Already running"));
      stopTimerScheduler();
      warnSpy.mockRestore();
    });

    it("stop is safe to call when not running", () => {
      expect(() => stopTimerScheduler()).not.toThrow();
    });
  });

  describe("Integration: schedule → expire → promote", () => {
    it("full lifecycle: schedule, promote (no-op), wait, promote (auto-submit)", async () => {
      const shortFuture = Date.now() + 100;
      await scheduleAutoSubmit("att-lifecycle", "cand-1", shortFuture);
      setDbResult([{ status: "in_progress" }]);

      await promoterTick();
      expect(autoSubmitAttemptMock).not.toHaveBeenCalled();
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 150));

      await promoterTick();
      expect(autoSubmitAttemptMock).toHaveBeenCalledTimes(1);
      expect(autoSubmitAttemptMock).toHaveBeenCalledWith("att-lifecycle", "time_expired");
      expect(await mockRedis.zcard(ZSET_KEY)).toBe(0);
    });
  });
});
