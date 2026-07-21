import { eq, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { db } from "../../database/db.js";
import { deviceRegistrations } from "../../database/schemas/index.js";

/* ---------- Zod Schemas ---------- */

const selfRegisterSchema = z.object({
  deviceId: z.string().min(1).max(255),
  deviceName: z.string().max(255).optional(),
  macAddress: z
    .string()
    .min(1)
    .max(17)
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, "Invalid MAC address"),
  hardwareHash: z.string().min(1).max(255),
  ipAddress: z.string().max(45).optional(),
  clientVersion: z.string().max(50).optional(),
});

const heartbeatSchema = z.object({
  deviceId: z.string().min(1).max(255),
  status: z.enum(["idle", "ready", "in_exam", "offline"]).optional(),
  ipAddress: z.string().max(45).optional(),
});

/* ---------- Public Route Plugin (no auth required) ---------- */

const devicePublicRoutes: FastifyPluginAsync = async (app) => {
  /* ----- GET /devices/discover — server discovery for LAN clients ----- */
  app.get("/discover", async (request, reply) => {
    return reply.send({
      serverName: "cbe-console",
      version: "1.0.0",
      apiUrl: `http://${request.hostname}`,
      port: env.PORT,
      endpoints: {
        selfRegister: "/api/v1/devices/self-register",
        heartbeat: "/api/v1/devices/heartbeat",
        login: "/api/auth/login",
      },
      timestamp: new Date().toISOString(),
    });
  });

  /* ----- POST /devices/self-register — LAN client self-registration ----- */
  app.post("/self-register", async (request, reply) => {
    const parsed = selfRegisterSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const {
      deviceId,
      deviceName,
      macAddress,
      hardwareHash,
      ipAddress,
      clientVersion,
    } = parsed.data;

    // Upsert: insert or update if deviceId already exists
    const [existing] = await db
      .select()
      .from(deviceRegistrations)
      .where(eq(deviceRegistrations.deviceId, deviceId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(deviceRegistrations)
        .set({
          deviceName: deviceName ?? existing.deviceName,
          macAddress,
          hardwareHash,
          ipAddress: ipAddress ?? request.ip,
          clientVersion: clientVersion ?? existing.clientVersion,
          lastSeenAt: new Date(),
          status: existing.status === "suspended" ? "suspended" : "active",
          updatedAt: new Date(),
        })
        .where(eq(deviceRegistrations.id, existing.id))
        .returning();

      return reply.send({
        id: updated.id,
        deviceId: updated.deviceId,
        status: updated.status,
        message: "Device updated successfully",
      });
    }

    // New device — use first admin user as registrar
    const adminResult = await db.execute(sql`
      SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1
    `);

    const adminId = (adminResult.rows[0] as { id: string } | undefined)?.id;
    if (!adminId) {
      return reply
        .code(500)
        .send({ error: "No admin user found for device registration" });
    }

    const [device] = await db
      .insert(deviceRegistrations)
      .values({
        deviceId,
        deviceName: deviceName ?? null,
        macAddress,
        hardwareHash,
        ipAddress: ipAddress ?? request.ip,
        clientVersion: clientVersion ?? null,
        registeredBy: adminId,
        lastSeenAt: new Date(),
        status: "active",
      })
      .returning();

    return reply.code(201).send({
      id: device.id,
      deviceId: device.deviceId,
      status: device.status,
      message: "Device registered successfully",
    });
  });

  /* ----- POST /devices/heartbeat — client presence ping ----- */
  /* If device was deleted but client is still running, auto-re-register */
  app.post("/heartbeat", async (request, reply) => {
    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const { deviceId, ipAddress } = parsed.data;

    const [device] = await db
      .update(deviceRegistrations)
      .set({
        lastSeenAt: new Date(),
        ipAddress: ipAddress ?? request.ip,
        updatedAt: new Date(),
      })
      .where(eq(deviceRegistrations.deviceId, deviceId))
      .returning({
        id: deviceRegistrations.id,
        deviceId: deviceRegistrations.deviceId,
        status: deviceRegistrations.status,
        lastSeenAt: deviceRegistrations.lastSeenAt,
      });

    if (device) {
      return reply.send({
        deviceId: device.deviceId,
        status: device.status,
        lastSeenAt: device.lastSeenAt,
        serverTime: new Date().toISOString(),
      });
    }

    // Device not found — was likely deleted. Auto-re-register if client provides enough info.
    // The client must include macAddress + hardwareHash in the heartbeat for auto-re-registration.
    const body = request.body as Record<string, unknown>;
    const macAddress = body.macAddress as string | undefined;
    const hardwareHash = body.hardwareHash as string | undefined;
    const deviceName = body.deviceName as string | undefined;
    const clientVersion = body.clientVersion as string | undefined;

    if (!macAddress || !hardwareHash) {
      return reply.code(404).send({
        error: "Device not registered",
        message: "Include macAddress and hardwareHash to auto-re-register",
      });
    }

    // Auto-re-register
    const adminResult = await db.execute(sql`
      SELECT id FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1
    `);
    const adminId = (adminResult.rows[0] as { id: string } | undefined)?.id;
    if (!adminId) {
      return reply
        .code(500)
        .send({ error: "No admin user found for device registration" });
    }

    const [reRegistered] = await db
      .insert(deviceRegistrations)
      .values({
        deviceId,
        deviceName: deviceName ?? null,
        macAddress,
        hardwareHash,
        ipAddress: ipAddress ?? request.ip,
        clientVersion: clientVersion ?? null,
        registeredBy: adminId,
        lastSeenAt: new Date(),
        status: "active",
      })
      .returning({
        id: deviceRegistrations.id,
        deviceId: deviceRegistrations.deviceId,
        status: deviceRegistrations.status,
        lastSeenAt: deviceRegistrations.lastSeenAt,
      });

    return reply.code(201).send({
      deviceId: reRegistered.deviceId,
      status: reRegistered.status,
      lastSeenAt: reRegistered.lastSeenAt,
      serverTime: new Date().toISOString(),
      message: "Device auto-re-registered (was previously deleted)",
    });
  });
};

export default devicePublicRoutes;
