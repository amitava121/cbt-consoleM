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
import { verifyToken, type TokenPayload } from "../src/services/auth.js";

// --- Hoisted mock state ---
const hoisted = vi.hoisted(() => ({
  userRecord: {
    id: "user-123",
    email: "admin@test.com",
    passwordHash: "$argon2id$mock-hash",
    fullName: "Test Admin",
    role: "super_admin",
    phone: "+1234567890",
    isActive: true,
    institutionId: null,
  },
  institutionRecord: { id: "inst-1", name: "Test Institute" },
  updateResult: { id: "user-123", passwordHash: "new-hash" },
  selectResult: [] as any[],
  updateReturn: [] as any[],
}));

function setUser(user: any) {
  hoisted.userRecord = user;
}

// --- Mocks ---
vi.mock("../src/database/db.js", () => {
  const limitMock = vi.fn(() => Promise.resolve(hoisted.selectResult));
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const updateWhereLimitMock = vi.fn(() => Promise.resolve(hoisted.updateReturn));
  const updateWhereMock = vi.fn(() => ({ limit: updateWhereLimitMock }));
  const updateSetMock = vi.fn(() => ({ where: updateWhereLimitMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock, where: updateWhereMock }));

  return {
    db: {
      select: selectMock,
      update: updateMock,
    },
    closePool: vi.fn().mockResolvedValue(undefined),
    getPoolStats: vi.fn().mockReturnValue({ total: 5, idle: 3, waiting: 0 }),
  };
});

vi.mock("../src/services/auth.js", async () => {
  const actual = await vi.importActual("../src/services/auth.js");
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue("new-mock-hash"),
    verifyPassword: vi.fn().mockResolvedValue(true),
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
  const { default: authRoutes } = await import("../src/modules/auth/routes.js");
  await app.register(authRoutes, { prefix: "/auth" });
  await app.ready();
  return app;
}

// --- Tests ---

describe("Auth routes — POST /auth/change-password", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      payload: { currentPassword: "old", newPassword: "newpass123" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 with invalid body (newPassword too short)", async () => {
    hoisted.selectResult = [hoisted.userRecord];
    const res = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      payload: { currentPassword: "old", newPassword: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when user not found", async () => {
    hoisted.selectResult = [];
    const res = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      payload: { currentPassword: "OldPass123!", newPassword: "NewPass456!" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("successfully changes password with valid credentials", async () => {
    hoisted.selectResult = [hoisted.userRecord];
    hoisted.updateReturn = [{ id: "user-123" }];
    const res = await app.inject({
      method: "POST",
      url: "/auth/change-password",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      payload: { currentPassword: "OldPass123!", newPassword: "NewPass456!" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toContain("Password changed");
  });
});

describe("Auth routes — GET /auth/me", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with invalid token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: "Bearer garbage" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 when user not found", async () => {
    hoisted.selectResult = [];
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns user details with permissions", async () => {
    hoisted.selectResult = [
      {
        id: "user-123",
        email: "admin@test.com",
        fullName: "Test Admin",
        role: "super_admin",
        phone: "+1234567890",
        isActive: true,
        institutionId: null,
      },
    ];
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${makeToken("super_admin")}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBe("user-123");
    expect(body.email).toBe("admin@test.com");
    expect(body.role).toBe("super_admin");
    expect(body.permissions).toEqual(["*"]);
  });

  it("returns institution details when user has one", async () => {
    hoisted.selectResult = [
      {
        id: "user-456",
        email: "examadmin@test.com",
        fullName: "Exam Admin",
        role: "exam_admin",
        phone: null,
        isActive: true,
        institutionId: "inst-1",
      },
    ];
    // The second select call (for institution) should return the institution
    // Since our mock returns the same selectResult for all calls, we set it to institution
    hoisted.selectResult = [
      {
        id: "user-456",
        email: "examadmin@test.com",
        fullName: "Exam Admin",
        role: "exam_admin",
        phone: null,
        isActive: true,
        institutionId: "inst-1",
      },
    ];
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${makeToken("exam_admin", "user-456")}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.role).toBe("exam_admin");
    expect(body.permissions).toContain("exams:read");
    expect(body.permissions).toContain("exams:write");
  });
});
