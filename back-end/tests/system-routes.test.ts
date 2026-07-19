import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// --- Set env vars before importing app code ---
process.env.JWT_SECRET = "test-secret-at-least-32-characters-long!!";
process.env.DATABASE_URL = "postgresql://fake:fake@localhost:5432/fake";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

import { env } from "../src/config/env.js";
import "../src/middleware/auth.js";
import { type TokenPayload } from "../src/services/auth.js";

// --- Hoisted mock state ---
const hoisted = vi.hoisted(() => ({
  auditLogs: [
    {
      id: "log-1",
      userId: "user-123",
      action: "create",
      resourceType: "exam",
      resourceId: "exam-1",
      ipAddress: "192.168.1.1",
      timestamp: new Date("2026-01-15T10:00:00Z"),
      userFullName: "Test Admin",
      userEmail: "admin@test.com",
    },
  ],
  auditLogCount: [{ count: 1 }],
  settings: [
    {
      id: "set-1",
      key: "max_exam_duration",
      value: "180",
      valueType: "integer",
      description: "Maximum exam duration in minutes",
      isEditable: true,
      updatedBy: null,
      updatedAt: new Date("2026-01-10T00:00:00Z"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  settingsCount: [{ count: 1 }],
  policies: [
    {
      id: "pol-1",
      policyName: "default_lockout",
      description: "Default account lockout policy",
      settingsJson: { maxAttempts: 5, lockoutMinutes: 15 },
      isActive: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ],
  policiesCount: [{ count: 1 }],
  updateReturn: [] as any[],
}));

// --- Mocks ---
vi.mock("../src/database/db.js", () => {
  // Chainable mock builder
  function chain(finalValue: any) {
    const obj: any = {};
    const handler: ProxyHandler<any> = {
      get(_target, prop) {
        if (prop === "then" || prop === "catch" || prop === "finally") {
          return undefined;
        }
        return new Proxy(() => obj, handler);
      },
      apply() {
        return Promise.resolve(finalValue);
      },
    };
    return new Proxy(obj, handler);
  }

  return {
    db: {
      select: vi.fn(() => chain(hoisted.auditLogs)),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(hoisted.updateReturn)),
            limit: vi.fn(() => Promise.resolve(hoisted.updateReturn)),
          })),
        })),
      })),
      execute: vi.fn(() => Promise.resolve([{ "?column?": 1 }])),
    },
    closePool: vi.fn().mockResolvedValue(undefined),
    getPoolStats: vi.fn().mockReturnValue({ total: 10, idle: 5, waiting: 1 }),
  };
});

// --- Helpers ---
function makeToken(role: string, sub = "user-123"): string {
  const payload: Omit<TokenPayload, "jti"> = { sub, role };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "1h",
    jwtid: "test-jti",
  });
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const { default: systemRoutes } = await import(
    "../src/modules/system/system-routes.js"
  );

  // Auth middleware
  app.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }
    try {
      const { verifyToken } = await import("../src/services/auth.js");
      request.user = verifyToken(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }
  });

  await app.register(systemRoutes);
  await app.ready();
  return app;
}

// --- Tests ---

describe("System routes — audit logs", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /audit-logs returns paginated results", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audit-logs?page=1&pageSize=10",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.total).toBeDefined();
    expect(body.page).toBe(1);
  });

  it("GET /audit-logs returns 403 for non-super_admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audit-logs",
      headers: { authorization: `Bearer ${makeToken("exam_admin")}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("GET /audit-logs/export returns JSON by default", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audit-logs/export",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
  });

  it("GET /audit-logs/export returns CSV when format=csv", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/audit-logs/export?format=csv",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("id,timestamp");
  });
});

describe("System routes — system settings", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /system-settings returns paginated settings", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/system-settings",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
  });

  it("PUT /system-settings/:key returns 404 when setting not found", async () => {
    hoisted.updateReturn = [];
    const res = await app.inject({
      method: "PUT",
      url: "/system-settings/nonexistent_key",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      payload: { value: "new_value" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /system-settings/:key updates setting successfully", async () => {
    hoisted.updateReturn = [
      {
        id: "set-1",
        key: "max_exam_duration",
        value: "240",
        valueType: "integer",
      },
    ];
    const res = await app.inject({
      method: "PUT",
      url: "/system-settings/max_exam_duration",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      payload: { value: "240", description: "Updated max duration" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.value).toBe("240");
  });
});

describe("System routes — security policies", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /security-policies returns paginated policies", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/security-policies",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
  });

  it("PUT /security-policies/:id returns 404 when not found", async () => {
    hoisted.updateReturn = [];
    const res = await app.inject({
      method: "PUT",
      url: "/security-policies/nonexistent-id",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      payload: {
        settingsJson: { maxAttempts: 3 },
        isActive: true,
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /security-policies/:id updates policy successfully", async () => {
    hoisted.updateReturn = [
      {
        id: "pol-1",
        policyName: "default_lockout",
        settingsJson: { maxAttempts: 3 },
        isActive: true,
      },
    ];
    const res = await app.inject({
      method: "PUT",
      url: "/security-policies/pol-1",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      payload: {
        settingsJson: { maxAttempts: 3 },
        isActive: true,
      },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("System routes — health/detailed", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health/detailed returns health info", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health/detailed",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeDefined();
    expect(body.database).toBeDefined();
    expect(body.memory).toBeDefined();
    expect(body.process).toBeDefined();
  });

  it("GET /health/detailed returns 403 for non-super_admin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health/detailed",
      headers: { authorization: `Bearer ${makeToken("proctor")}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
