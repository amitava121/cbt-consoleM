import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// --- Set env vars before importing app code ---
process.env.JWT_SECRET = "test-secret-at-least-32-characters-long!!";
process.env.DATABASE_URL = "postgresql://fake:fake@localhost:5432/fake";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

import { env } from "../src/config/env.js";
import "../src/middleware/auth.js"; // Side-effect: augments FastifyRequest with .user
import { requireRole } from "../src/middleware/rbac.js";
import { verifyToken, type TokenPayload } from "../src/services/auth.js";

// --- Helpers ---

function makeToken(role: string, sub = "user-123"): string {
  const payload: Omit<TokenPayload, "jti"> = { sub, role };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: "1h",
    jwtid: "test-jti",
  });
}

function makeApp(): FastifyInstance {
  const app = Fastify({ logger: false });

  // Auth middleware — mirrors the real onRequest hook in index.ts
  app.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }
    try {
      request.user = verifyToken(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }
  });

  // Test routes covering different RBAC patterns
  app.get(
    "/admin-only",
    { preHandler: requireRole("super_admin") },
    async () => ({ ok: true }),
  );
  app.get(
    "/exam-admin",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async () => ({ ok: true }),
  );
  app.get(
    "/proctor",
    { preHandler: requireRole("super_admin", "exam_admin", "proctor") },
    async () => ({ ok: true }),
  );
  app.get(
    "/candidate-only",
    { preHandler: requireRole("candidate") },
    async () => ({ ok: true }),
  );
  app.get(
    "/author",
    { preHandler: requireRole("super_admin", "exam_admin", "question_author") },
    async () => ({ ok: true }),
  );

  // Plugin-level hook (like exam-routes.ts)
  app.register(async (scoped) => {
    scoped.addHook("preHandler", requireRole("super_admin", "exam_admin"));
    scoped.get("/scoped/all", async () => ({ ok: true }));
  });

  return app;
}

// --- Tests ---

describe("RBAC middleware — requireRole()", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("401 — no token", () => {
    it("rejects request without Authorization header", async () => {
      const res = await app.inject({ method: "GET", url: "/admin-only" });
      expect(res.statusCode).toBe(401);
    });

    it("rejects request with malformed Authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin-only",
        headers: { authorization: "Bearer garbage" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("403 — wrong role", () => {
    it("rejects candidate accessing admin-only route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin-only",
        headers: { authorization: `Bearer ${makeToken("candidate")}` },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Insufficient permissions");
    });

    it("rejects proctor accessing exam_admin-only route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/exam-admin",
        headers: { authorization: `Bearer ${makeToken("proctor")}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects question_author accessing proctor route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/proctor",
        headers: { authorization: `Bearer ${makeToken("question_author")}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects super_admin accessing candidate-only route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/candidate-only",
        headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects exam_admin accessing candidate-only route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/candidate-only",
        headers: { authorization: `Bearer ${makeToken("exam_admin")}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("200 — correct role", () => {
    it("allows super_admin on admin-only route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin-only",
        headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).ok).toBe(true);
    });

    it("allows exam_admin on exam-admin route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/exam-admin",
        headers: { authorization: `Bearer ${makeToken("exam_admin")}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows super_admin on exam-admin route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/exam-admin",
        headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows proctor on proctor route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/proctor",
        headers: { authorization: `Bearer ${makeToken("proctor")}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows candidate on candidate-only route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/candidate-only",
        headers: { authorization: `Bearer ${makeToken("candidate")}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows question_author on author route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/author",
        headers: { authorization: `Bearer ${makeToken("question_author")}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("plugin-level preHandler hook", () => {
    it("allows super_admin on scoped route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/scoped/all",
        headers: { authorization: `Bearer ${makeToken("super_admin")}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("allows exam_admin on scoped route", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/scoped/all",
        headers: { authorization: `Bearer ${makeToken("exam_admin")}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("rejects proctor on scoped route (admin-only)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/scoped/all",
        headers: { authorization: `Bearer ${makeToken("proctor")}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("rejects candidate on scoped route (admin-only)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/scoped/all",
        headers: { authorization: `Bearer ${makeToken("candidate")}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("JWT token validation", () => {
    it("rejects expired token", async () => {
      const expiredToken = jwt.sign(
        { sub: "user-123", role: "super_admin" },
        env.JWT_SECRET,
        { expiresIn: "-1s", jwtid: "expired" },
      );
      const res = await app.inject({
        method: "GET",
        url: "/admin-only",
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it("rejects token signed with wrong secret", async () => {
      const wrongSecretToken = jwt.sign(
        { sub: "user-123", role: "super_admin" },
        "wrong-secret",
        { expiresIn: "1h", jwtid: "wrong" },
      );
      const res = await app.inject({
        method: "GET",
        url: "/admin-only",
        headers: { authorization: `Bearer ${wrongSecretToken}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
