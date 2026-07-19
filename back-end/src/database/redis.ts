import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on("error", (err) => {
  console.error("[redis] Connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[redis] Connected");
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
