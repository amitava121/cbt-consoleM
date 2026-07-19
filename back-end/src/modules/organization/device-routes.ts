import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import { centers, deviceRegistrations } from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";

/* ---------- Zod Schemas ---------- */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  centerId: z.string().uuid().optional(),
  status: z
    .enum(["registered", "active", "suspended", "decommissioned"])
    .optional(),
});

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1).max(255),
  deviceName: z.string().max(255).optional(),
  macAddress: z
    .string()
    .min(1)
    .max(17)
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/, "Invalid MAC address"),
  hardwareHash: z.string().min(1).max(255),
  ipAddress: z.string().max(45).optional(),
  centerId: z.string().uuid().optional().nullable(),
});

const updateDeviceSchema = z.object({
  deviceName: z.string().max(255).optional(),
  ipAddress: z.string().max(45).optional(),
  centerId: z.string().uuid().optional().nullable(),
});

/* ---------- Route Plugin ---------- */

const deviceRoutes: FastifyPluginAsync = async (app) => {
  /* ----- GET /devices — list with pagination + filters ----- */
  app.get(
    "/",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success)
        return reply.code(400).send({ error: "Invalid query parameters" });

      const { page, pageSize, search, centerId, status } = parsed.data;
      const offset = (page - 1) * pageSize;

      const conditions = [];
      if (search && search.length >= 3) {
        conditions.push(
          ilike(
            sql`(${deviceRegistrations.deviceId} || ' ' || COALESCE(${deviceRegistrations.deviceName}, '') || ' ' || ${deviceRegistrations.macAddress})`,
            `%${search}%`,
          ),
        );
      }
      if (centerId) conditions.push(eq(deviceRegistrations.centerId, centerId));
      if (status) conditions.push(eq(deviceRegistrations.status, status));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countResult] = await Promise.all([
        db
          .select({
            id: deviceRegistrations.id,
            deviceId: deviceRegistrations.deviceId,
            deviceName: deviceRegistrations.deviceName,
            macAddress: deviceRegistrations.macAddress,
            hardwareHash: deviceRegistrations.hardwareHash,
            ipAddress: deviceRegistrations.ipAddress,
            centerId: deviceRegistrations.centerId,
            status: deviceRegistrations.status,
            registeredBy: deviceRegistrations.registeredBy,
            lastSeenAt: deviceRegistrations.lastSeenAt,
            createdAt: deviceRegistrations.createdAt,
            updatedAt: deviceRegistrations.updatedAt,
            centerName: centers.name,
          })
          .from(deviceRegistrations)
          .leftJoin(centers, eq(deviceRegistrations.centerId, centers.id))
          .where(where)
          .orderBy(asc(deviceRegistrations.createdAt))
          .limit(pageSize)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(deviceRegistrations)
          .where(where),
      ]);

      return reply.send({
        data: rows,
        total: countResult[0]?.count ?? 0,
        page,
        pageSize,
      });
    },
  );

  /* ----- POST /devices — register a new device ----- */
  app.post(
    "/",
    { preHandler: requireRole("super_admin") },
    async (request, reply) => {
      const parsed = registerDeviceSchema.safeParse(request.body);
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
        centerId,
      } = parsed.data;

      // Atomic insert with ON CONFLICT DO NOTHING — race-safe
      const [device] = await db
        .insert(deviceRegistrations)
        .values({
          deviceId,
          deviceName: deviceName ?? null,
          macAddress,
          hardwareHash,
          ipAddress: ipAddress ?? null,
          centerId: centerId ?? null,
          registeredBy: request.user.sub,
        })
        .onConflictDoNothing()
        .returning();

      if (!device)
        return reply.code(409).send({
          error: "Device ID already registered",
        });

      return reply.code(201).send(device);
    },
  );

  /* ----- GET /devices/:id — get details ----- */
  app.get(
    "/:id",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [row] = await db
        .select({
          id: deviceRegistrations.id,
          deviceId: deviceRegistrations.deviceId,
          deviceName: deviceRegistrations.deviceName,
          macAddress: deviceRegistrations.macAddress,
          hardwareHash: deviceRegistrations.hardwareHash,
          ipAddress: deviceRegistrations.ipAddress,
          centerId: deviceRegistrations.centerId,
          status: deviceRegistrations.status,
          registeredBy: deviceRegistrations.registeredBy,
          lastSeenAt: deviceRegistrations.lastSeenAt,
          createdAt: deviceRegistrations.createdAt,
          updatedAt: deviceRegistrations.updatedAt,
          centerName: centers.name,
        })
        .from(deviceRegistrations)
        .leftJoin(centers, eq(deviceRegistrations.centerId, centers.id))
        .where(eq(deviceRegistrations.id, id))
        .limit(1);

      if (!row) return reply.code(404).send({ error: "Device not found" });

      return reply.send(row);
    },
  );

  /* ----- PUT /devices/:id — update device ----- */
  app.put(
    "/:id",
    { preHandler: requireRole("super_admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateDeviceSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        });

      const { deviceName, ipAddress, centerId } = parsed.data;

      // Single query: update and return with joined center name using a subquery approach
      const [updated] = await db
        .update(deviceRegistrations)
        .set({
          ...(deviceName !== undefined ? { deviceName } : {}),
          ...(ipAddress !== undefined ? { ipAddress } : {}),
          ...(centerId !== undefined ? { centerId: centerId ?? null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(deviceRegistrations.id, id))
        .returning();

      if (!updated) return reply.code(404).send({ error: "Device not found" });

      // Fetch joined view (single query, avoids separate re-fetch after returning)
      const [row] = await db
        .select({
          id: deviceRegistrations.id,
          deviceId: deviceRegistrations.deviceId,
          deviceName: deviceRegistrations.deviceName,
          macAddress: deviceRegistrations.macAddress,
          hardwareHash: deviceRegistrations.hardwareHash,
          ipAddress: deviceRegistrations.ipAddress,
          centerId: deviceRegistrations.centerId,
          status: deviceRegistrations.status,
          registeredBy: deviceRegistrations.registeredBy,
          lastSeenAt: deviceRegistrations.lastSeenAt,
          createdAt: deviceRegistrations.createdAt,
          updatedAt: deviceRegistrations.updatedAt,
          centerName: centers.name,
        })
        .from(deviceRegistrations)
        .leftJoin(centers, eq(deviceRegistrations.centerId, centers.id))
        .where(eq(deviceRegistrations.id, id))
        .limit(1);

      return reply.send(row);
    },
  );

  /* ----- POST /devices/:id/suspend — suspend device ----- */
  app.post(
    "/:id/suspend",
    { preHandler: requireRole("super_admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [updated] = await db
        .update(deviceRegistrations)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(deviceRegistrations.id, id))
        .returning({
          id: deviceRegistrations.id,
          status: deviceRegistrations.status,
        });

      if (!updated) return reply.code(404).send({ error: "Device not found" });

      return reply.send(updated);
    },
  );

  /* ----- POST /devices/:id/activate — activate device ----- */
  app.post(
    "/:id/activate",
    { preHandler: requireRole("super_admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [updated] = await db
        .update(deviceRegistrations)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(deviceRegistrations.id, id))
        .returning({
          id: deviceRegistrations.id,
          status: deviceRegistrations.status,
        });

      if (!updated) return reply.code(404).send({ error: "Device not found" });

      return reply.send(updated);
    },
  );
};

export default deviceRoutes;
