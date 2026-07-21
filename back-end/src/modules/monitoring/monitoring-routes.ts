import { and, count, desc, eq } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    eventLogs,
    proctoringEvents,
    violationReports,
} from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";
import { pauseAttempt, terminateAttempt } from "../sessions/session-service.js";

const listViolationsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  examBatchId: z.string().uuid().optional(),
  severity: z.string().optional(),
  isResolved: z.coerce.boolean().optional(),
});

const createViolationSchema = z.object({
  attemptId: z.string().uuid(),
  violationType: z.enum([
    "tab_switch",
    "window_blur",
    "process_violation",
    "clipboard_access",
    "screenshot_attempt",
    "vm_detected",
    "multiple_faces",
    "gaze_away",
    "browser_devtools",
    "time_manipulation",
  ]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().min(1).max(1000),
  evidenceUrl: z.string().url().optional(),
});

const resolveViolationSchema = z.object({
  isResolved: z.boolean(),
});

const proctorActionSchema = z.object({
  action: z.enum(["warn", "pause", "terminate", "message", "dismiss"]),
  reason: z.string().min(1).max(500),
});

const monitoringRoutes: FastifyPluginAsync = async (app) => {
  app.addHook(
    "preHandler",
    requireRole("super_admin", "exam_admin", "proctor"),
  );

  app.get("/violations", async (request, reply) => {
    const parsed = listViolationsSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { page, pageSize, severity, isResolved } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (severity) {
      conditions.push(
        eq(
          violationReports.severity,
          severity as "low" | "medium" | "high" | "critical",
        ),
      );
    }
    if (isResolved !== undefined) {
      conditions.push(eq(violationReports.isResolved, isResolved));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [violationList, totalResult] = await Promise.all([
      where
        ? db
            .select({
              id: violationReports.id,
              attemptId: violationReports.attemptId,
              violationType: violationReports.violationType,
              severity: violationReports.severity,
              description: violationReports.description,
              evidenceUrl: violationReports.evidenceUrl,
              proctorAction: violationReports.proctorAction,
              isResolved: violationReports.isResolved,
              resolvedAt: violationReports.resolvedAt,
              createdAt: violationReports.createdAt,
            })
            .from(violationReports)
            .where(where)
            .orderBy(desc(violationReports.createdAt))
            .limit(pageSize)
            .offset(offset)
        : db
            .select({
              id: violationReports.id,
              attemptId: violationReports.attemptId,
              violationType: violationReports.violationType,
              severity: violationReports.severity,
              description: violationReports.description,
              evidenceUrl: violationReports.evidenceUrl,
              proctorAction: violationReports.proctorAction,
              isResolved: violationReports.isResolved,
              resolvedAt: violationReports.resolvedAt,
              createdAt: violationReports.createdAt,
            })
            .from(violationReports)
            .orderBy(desc(violationReports.createdAt))
            .limit(pageSize)
            .offset(offset),
      where
        ? db.select({ total: count() }).from(violationReports).where(where)
        : db.select({ total: count() }).from(violationReports),
    ]);

    return reply.send({
      success: true,
      violations: violationList,
      pagination: {
        page,
        pageSize,
        total: totalResult[0]?.total ?? 0,
        totalPages: Math.ceil((totalResult[0]?.total ?? 0) / pageSize),
      },
    });
  });

  app.post("/violations", async (request, reply) => {
    const parsed = createViolationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const [violation] = await db
      .insert(violationReports)
      .values({
        attemptId: parsed.data.attemptId,
        violationType: parsed.data.violationType,
        severity: parsed.data.severity,
        description: parsed.data.description,
        evidenceUrl: parsed.data.evidenceUrl,
      })
      .returning();

    return reply.code(201).send({ success: true, violation });
  });

  app.patch("/violations/:id/resolve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = resolveViolationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const [updated] = await db
      .update(violationReports)
      .set({
        isResolved: parsed.data.isResolved,
        resolvedAt: parsed.data.isResolved ? new Date() : null,
        resolvedBy: request.user.sub,
      })
      .where(eq(violationReports.id, id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: "Violation not found" });
    }

    return reply.send({ success: true, violation: updated });
  });

  app.post("/proctor/:attemptId/action", async (request, reply) => {
    const { attemptId } = request.params as { attemptId: string };
    const parsed = proctorActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { action, reason } = parsed.data;
    const proctorId = request.user.sub;

    await db.insert(proctoringEvents).values({
      attemptId,
      eventType: `proctor_${action}`,
      eventDataJson: { reason, proctorId },
    });

    switch (action) {
      case "pause":
        await pauseAttempt(attemptId, reason);
        break;
      case "terminate":
        await terminateAttempt(attemptId, proctorId, reason);
        break;
      case "warn":
        await db.insert(eventLogs).values({
          attemptId,
          eventType: "proctor_warning",
          eventDataJson: { reason, proctorId: request.user.sub },
          severity: "warn",
        });
        break;
      case "dismiss":
      case "message":
        break;
    }

    return reply.send({ success: true, action, reason });
  });

  app.get("/proctor/:attemptId/events", async (request, reply) => {
    const { attemptId } = request.params as { attemptId: string };

    const events = await db
      .select()
      .from(proctoringEvents)
      .where(eq(proctoringEvents.attemptId, attemptId))
      .orderBy(desc(proctoringEvents.createdAt))
      .limit(50);

    return reply.send({ success: true, events });
  });

  app.get("/violations/stats", async (_request, reply) => {
    const allViolations = await db
      .select({
        severity: violationReports.severity,
        isResolved: violationReports.isResolved,
      })
      .from(violationReports);

    const stats = {
      total: allViolations.length,
      bySeverity: {
        low: allViolations.filter((v) => v.severity === "low").length,
        medium: allViolations.filter((v) => v.severity === "medium").length,
        high: allViolations.filter((v) => v.severity === "high").length,
        critical: allViolations.filter((v) => v.severity === "critical").length,
      },
      unresolved: allViolations.filter((v) => !v.isResolved).length,
    };

    return reply.send({ success: true, stats });
  });
};

export default monitoringRoutes;
