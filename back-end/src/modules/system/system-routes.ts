import { desc, eq, ilike, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db, getPoolStats } from "../../database/db.js";
import {
    auditLogs,
    securityPolicies,
    systemSettings,
    users,
} from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const updateSettingSchema = z.object({
  value: z.string().min(1),
  description: z.string().optional(),
});

const updatePolicySchema = z.object({
  description: z.string().optional(),
  settingsJson: z.record(z.unknown()),
  isActive: z.boolean().optional(),
});

const systemRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("super_admin"));

  /* ----- GET /audit-logs — list with pagination + filters ----- */
  app.get("/audit-logs", async (request, reply) => {
    const parsed = auditLogQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid query parameters" });

    const { page, pageSize, userId, action, resourceType, startDate, endDate } =
      parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (action) conditions.push(eq(auditLogs.action, action as never));
    if (resourceType) conditions.push(eq(auditLogs.resourceType, resourceType));
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime()))
        conditions.push(sql`${auditLogs.timestamp} >= ${start}`);
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime()))
        conditions.push(sql`${auditLogs.timestamp} <= ${end}`);
    }

    const where =
      conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

    const [rows, countResult] = await Promise.all([
      where
        ? db
            .select({
              id: auditLogs.id,
              userId: auditLogs.userId,
              action: auditLogs.action,
              resourceType: auditLogs.resourceType,
              resourceId: auditLogs.resourceId,
              ipAddress: auditLogs.ipAddress,
              timestamp: auditLogs.timestamp,
              userFullName: users.fullName,
              userEmail: users.email,
            })
            .from(auditLogs)
            .leftJoin(users, eq(auditLogs.userId, users.id))
            .where(where)
            .orderBy(desc(auditLogs.timestamp))
            .limit(pageSize)
            .offset(offset)
        : db
            .select({
              id: auditLogs.id,
              userId: auditLogs.userId,
              action: auditLogs.action,
              resourceType: auditLogs.resourceType,
              resourceId: auditLogs.resourceId,
              ipAddress: auditLogs.ipAddress,
              timestamp: auditLogs.timestamp,
              userFullName: users.fullName,
              userEmail: users.email,
            })
            .from(auditLogs)
            .leftJoin(users, eq(auditLogs.userId, users.id))
            .orderBy(desc(auditLogs.timestamp))
            .limit(pageSize)
            .offset(offset),
      where
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(auditLogs)
            .where(where)
        : db.select({ count: sql<number>`count(*)::int` }).from(auditLogs),
    ]);

    return reply.send({
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  });

  /* ----- GET /audit-logs/export — export as JSON (CSV can be added later) ----- */
  app.get("/audit-logs/export", async (request, reply) => {
    const query = request.query as { format?: string };
    const format = query.format ?? "json";

    const rows = await db
      .select({
        id: auditLogs.id,
        userId: auditLogs.userId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        oldValueJson: auditLogs.oldValueJson,
        newValueJson: auditLogs.newValueJson,
        ipAddress: auditLogs.ipAddress,
        userAgent: auditLogs.userAgent,
        timestamp: auditLogs.timestamp,
        currentHash: auditLogs.currentHash,
        userFullName: users.fullName,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .orderBy(desc(auditLogs.timestamp))
      .limit(1000);

    if (format === "csv") {
      const header =
        "id,timestamp,userFullName,userEmail,action,resourceType,resourceId,ipAddress\n";
      const csvRows = rows
        .map(
          (r) =>
            `${r.id},${r.timestamp.toISOString()},${r.userFullName ?? ""},${r.userEmail ?? ""},${r.action},${r.resourceType},${r.resourceId ?? ""},${r.ipAddress ?? ""}`,
        )
        .join("\n");
      reply.header("Content-Type", "text/csv");
      reply.header(
        "Content-Disposition",
        `attachment; filename="audit-logs-${Date.now()}.csv"`,
      );
      return reply.send(header + csvRows);
    }

    reply.header("Content-Type", "application/json");
    reply.header(
      "Content-Disposition",
      `attachment; filename="audit-logs-${Date.now()}.json"`,
    );
    return reply.send(rows);
  });

  /* ----- GET /system-settings — list all settings ----- */
  app.get("/system-settings", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid query parameters" });
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const where =
      search && search.length >= 1
        ? ilike(systemSettings.key, `%${search}%`)
        : undefined;

    const [rows, countResult] = await Promise.all([
      where
        ? db
            .select()
            .from(systemSettings)
            .where(where)
            .orderBy(desc(systemSettings.updatedAt))
            .limit(pageSize)
            .offset(offset)
        : db
            .select()
            .from(systemSettings)
            .orderBy(desc(systemSettings.updatedAt))
            .limit(pageSize)
            .offset(offset),
      where
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(systemSettings)
            .where(where)
        : db.select({ count: sql<number>`count(*)::int` }).from(systemSettings),
    ]);

    return reply.send({
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  });

  /* ----- PUT /system-settings/:key — update a setting ----- */
  app.put("/system-settings/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const parsed = updateSettingSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [updated] = await db
      .update(systemSettings)
      .set({
        value: parsed.data.value,
        description: parsed.data.description,
        updatedBy: request.user.sub,
        updatedAt: new Date(),
      })
      .where(eq(systemSettings.key, key))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Setting not found" });

    return reply.send(updated);
  });

  /* ----- GET /security-policies — list all policies ----- */
  app.get("/security-policies", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid query parameters" });
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const where =
      search && search.length >= 1
        ? ilike(securityPolicies.policyName, `%${search}%`)
        : undefined;

    const [rows, countResult] = await Promise.all([
      where
        ? db
            .select()
            .from(securityPolicies)
            .where(where)
            .orderBy(desc(securityPolicies.updatedAt))
            .limit(pageSize)
            .offset(offset)
        : db
            .select()
            .from(securityPolicies)
            .orderBy(desc(securityPolicies.updatedAt))
            .limit(pageSize)
            .offset(offset),
      where
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(securityPolicies)
            .where(where)
        : db
            .select({ count: sql<number>`count(*)::int` })
            .from(securityPolicies),
    ]);

    return reply.send({
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  });

  /* ----- PUT /security-policies/:id — update a policy ----- */
  app.put("/security-policies/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updatePolicySchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [updated] = await db
      .update(securityPolicies)
      .set({
        description: parsed.data.description,
        settingsJson: parsed.data.settingsJson,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(securityPolicies.id, id))
      .returning();

    if (!updated)
      return reply.code(404).send({ error: "Security policy not found" });

    return reply.send(updated);
  });

  /* ----- GET /health/detailed — detailed health check ----- */
  app.get("/health/detailed", async (_request, reply) => {
    const poolStats = getPoolStats();

    // Test DB connectivity
    let dbStatus: "ok" | "error" = "ok";
    let dbLatencyMs: number | null = null;
    try {
      const start = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = "error";
    }

    // Get process metrics
    const memUsage = process.memoryUsage();
    const uptimeSecs = Math.floor(process.uptime());

    return reply.send({
      status: dbStatus === "ok" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptime: uptimeSecs,
      environment: process.env.NODE_ENV ?? "development",
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
        pool: poolStats,
      },
      memory: {
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        externalMB: Math.round(memUsage.external / 1024 / 1024),
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
      },
    });
  });
};

export default systemRoutes;
