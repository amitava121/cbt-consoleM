import { and, eq, gt } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
  deviceRegistrations,
  institutions,
  sessionTokens,
  users,
} from "../../database/schemas/index.js";
import {
  generateTokenPair,
  hashPassword,
  verifyPassword,
  verifyToken,
  type TokenPayload,
} from "../../services/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/login",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }
      const body = parsed.data;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, body.email.toLowerCase()))
        .limit(1);

      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return reply.code(403).send({ error: "Account disabled" });
      }

      // Optional device binding
      if (body.deviceId) {
        const [device] = await db
          .select()
          .from(deviceRegistrations)
          .where(eq(deviceRegistrations.deviceId, body.deviceId))
          .limit(1);

        if (!device) {
          return reply.code(403).send({ error: "Device not registered" });
        }

        if (
          device.status === "suspended" ||
          device.status === "decommissioned"
        ) {
          return reply.code(403).send({ error: "Device suspended" });
        }

        // Use the device registration UUID (not the string device_id) for session_tokens
        (body as { _deviceUuid?: string })._deviceUuid = device.id;
      }

      const tokens = generateTokenPair({
        sub: user.id,
        role: user.role,
        deviceId: body.deviceId,
      });

      const accessJti = verifyToken(tokens.accessToken).jti;
      const refreshJti = verifyToken(tokens.refreshToken).jti;

      await db.transaction(async (tx) => {
        const deviceUuid =
          (body as { _deviceUuid?: string })._deviceUuid ?? null;
        await tx.insert(sessionTokens).values([
          {
            userId: user.id,
            tokenJti: accessJti,
            tokenType: "access",
            deviceId: deviceUuid,
            expiresAt: tokens.accessExpiresAt,
          },
          {
            userId: user.id,
            tokenJti: refreshJti,
            tokenType: "refresh",
            deviceId: deviceUuid,
            expiresAt: tokens.refreshExpiresAt,
          },
        ]);

        await tx
          .update(users)
          .set({ lastLoginAt: new Date(), failedLoginCount: 0 })
          .where(eq(users.id, user.id));
      });

      // Response format per API_SPECIFICATION.md Section 3.1
      const expiresInSeconds = Math.floor(
        (tokens.accessExpiresAt.getTime() - Date.now()) / 1000,
      );

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: expiresInSeconds,
        // Keep accessExpiresAt/refreshExpiresAt for admin panel backward compatibility
        accessExpiresAt: tokens.accessExpiresAt.toISOString(),
        refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
      };
    },
  );

  app.post("/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }
    const body = parsed.data;

    let payload: TokenPayload;
    try {
      payload = verifyToken(body.refreshToken);
    } catch {
      return reply.code(401).send({ error: "Invalid refresh token" });
    }

    const [tokenRow] = await db
      .select()
      .from(sessionTokens)
      .where(
        and(
          eq(sessionTokens.tokenJti, payload.jti),
          eq(sessionTokens.tokenType, "refresh"),
          eq(sessionTokens.isRevoked, false),
          gt(sessionTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!tokenRow) {
      return reply
        .code(401)
        .send({ error: "Refresh token revoked or expired" });
    }

    // Revoke old refresh token
    await db
      .update(sessionTokens)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(eq(sessionTokens.id, tokenRow.id));

    const tokens = generateTokenPair({
      sub: payload.sub,
      role: payload.role,
      deviceId: payload.deviceId,
      examBatchId: payload.examBatchId,
      attemptId: payload.attemptId,
    });

    const accessJti = verifyToken(tokens.accessToken).jti;
    const refreshJti = verifyToken(tokens.refreshToken).jti;

    await db.insert(sessionTokens).values([
      {
        userId: payload.sub,
        tokenJti: accessJti,
        tokenType: "access",
        deviceId: tokenRow.deviceId,
        attemptId: tokenRow.attemptId,
        expiresAt: tokens.accessExpiresAt,
      },
      {
        userId: payload.sub,
        tokenJti: refreshJti,
        tokenType: "refresh",
        deviceId: tokenRow.deviceId,
        attemptId: tokenRow.attemptId,
        expiresAt: tokens.refreshExpiresAt,
      },
    ]);

    // Response format per API_SPECIFICATION.md Section 3.2
    const expiresInSeconds = Math.floor(
      (tokens.accessExpiresAt.getTime() - Date.now()) / 1000,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: expiresInSeconds,
      // Keep for admin panel backward compatibility
      accessExpiresAt: tokens.accessExpiresAt.toISOString(),
      refreshExpiresAt: tokens.refreshExpiresAt.toISOString(),
    };
  });

  app.post("/logout", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }

    const accessToken = authHeader.slice(7);
    let payload: TokenPayload;
    try {
      payload = verifyToken(accessToken);
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }

    await db
      .update(sessionTokens)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(eq(sessionTokens.tokenJti, payload.jti));

    return { message: "Logged out" };
  });

  // ─── POST /auth/change-password ───────────────────────────────
  app.post("/change-password", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }

    let payload: TokenPayload;
    try {
      payload = verifyToken(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }

    const changePasswordSchema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(100),
    });

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body" });
    }

    const { currentPassword, newPassword } = parsed.data;

    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid) {
      return reply.code(401).send({ error: "Current password is incorrect" });
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return { message: "Password changed successfully" };
  });

  // ─── GET /auth/me ─────────────────────────────────────────────
  app.get("/me", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }

    let payload: TokenPayload;
    try {
      payload = verifyToken(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        phone: users.phone,
        isActive: users.isActive,
        institutionId: users.institutionId,
      })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    let institution: { id: string; name: string } | null = null;
    if (user.institutionId) {
      const [inst] = await db
        .select({ id: institutions.id, name: institutions.name })
        .from(institutions)
        .where(eq(institutions.id, user.institutionId))
        .limit(1);
      if (inst) institution = inst;
    }

    const permissions = getRolePermissions(user.role);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      isActive: user.isActive,
      institution,
      permissions,
    };
  });
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"],
  exam_admin: [
    "users:read",
    "institutions:read",
    "centers:read",
    "batches:read",
    "subjects:read",
    "topics:read",
    "question-banks:read",
    "questions:read",
    "exams:read",
    "exams:write",
    "exam-batches:read",
    "exam-batches:write",
    "candidates:read",
    "candidates:write",
    "devices:read",
    "sessions:read",
    "sessions:write",
  ],
  proctor: [
    "exam-batches:read",
    "sessions:read",
    "sessions:write",
    "candidates:read",
    "devices:read",
  ],
  question_author: [
    "question-banks:read",
    "question-banks:write",
    "questions:read",
    "questions:write",
    "subjects:read",
    "topics:read",
  ],
  candidate: [
    "candidate:exams:read",
    "candidate:answers:write",
    "candidate:submit",
  ],
};

function getRolePermissions(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export default authRoutes;
