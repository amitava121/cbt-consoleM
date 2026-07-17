import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import {
    type FastifyPluginAsync,
    type FastifyReply,
    type FastifyRequest,
} from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    attempts,
    candidates,
    examBatchCandidates,
    examBatches,
    examSchedules,
    exams,
} from "../../database/schemas/index.js";

/* ---------- Schemas ---------- */

const createBatchSchema = z.object({
  examId: z.string().uuid(),
  batchId: z.string().uuid().optional().nullable(),
  centerId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  shiftNumber: z.number().int().min(1).default(1),
  scheduledStartAt: z.string().datetime(),
  scheduledEndAt: z.string().datetime(),
  gracePeriodMinutes: z.number().int().min(0).max(120).default(5),
  instructions: z.record(z.unknown()).optional().nullable(),
  settings: z.record(z.unknown()).optional().nullable(),
});

const updateBatchSchema = createBatchSchema.partial();

const assignCandidatesSchema = z.object({
  candidateIds: z.array(z.string().uuid()).min(1),
});

/* ---------- Lifecycle transitions ---------- */

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["scheduled"],
  scheduled: ["published", "draft"],
  published: ["active", "scheduled"],
  active: ["paused", "submission_window", "finished"],
  paused: ["active"],
  submission_window: ["finished"],
  finished: ["results_published"],
  results_published: ["archived"],
  archived: [],
};

function assertTransition(current: string, target: string): boolean {
  return (VALID_TRANSITIONS[current] ?? []).includes(target);
}

/* ---------- Route Plugin ---------- */

const examBatchRoutes: FastifyPluginAsync = async (app) => {
  /* ----- GET /exam-batches — list with pagination + filters ----- */
  app.get("/", async (request, reply) => {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      search?: string;
      examId?: string;
      status?: string;
    };
    const page = Math.max(1, parseInt(query.page ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize ?? "20")),
    );
    const search = query.search?.trim();

    const conditions = [];
    if (search && search.length >= 3)
      conditions.push(ilike(examBatches.name, `%${search}%`));
    if (query.examId) conditions.push(eq(examBatches.examId, query.examId));
    if (query.status)
      conditions.push(eq(examBatches.status, query.status as never));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: examBatches.id,
          examId: examBatches.examId,
          batchId: examBatches.batchId,
          centerId: examBatches.centerId,
          name: examBatches.name,
          status: examBatches.status,
          shiftNumber: examBatches.shiftNumber,
          scheduledStartAt: examBatches.scheduledStartAt,
          scheduledEndAt: examBatches.scheduledEndAt,
          actualStartAt: examBatches.actualStartAt,
          actualEndAt: examBatches.actualEndAt,
          gracePeriodMinutes: examBatches.gracePeriodMinutes,
          createdAt: examBatches.createdAt,
          updatedAt: examBatches.updatedAt,
        })
        .from(examBatches)
        .where(where)
        .orderBy(asc(examBatches.scheduledStartAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(examBatches)
        .where(where),
    ]);

    return reply.send({
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  });

  /* ----- POST /exam-batches — create ----- */
  app.post("/", async (request, reply) => {
    const parsed = createBatchSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const { instructions, settings, ...batchFields } = parsed.data;

    // Verify exam exists
    const [exam] = await db
      .select({ id: exams.id })
      .from(exams)
      .where(eq(exams.id, parsed.data.examId))
      .limit(1);
    if (!exam) return reply.code(404).send({ error: "Exam not found" });

    const [batch] = await db
      .insert(examBatches)
      .values({
        ...batchFields,
        scheduledStartAt: new Date(parsed.data.scheduledStartAt),
        scheduledEndAt: new Date(parsed.data.scheduledEndAt),
        instructionsJson: (instructions as Record<string, unknown>) ?? null,
        settingsJson: (settings as Record<string, unknown>) ?? null,
        createdBy: request.user.sub,
      } as typeof examBatches.$inferInsert)
      .returning();

    return reply.code(201).send(batch);
  });

  /* ----- GET /exam-batches/:id — get details (parallel fetch) ----- */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [batch, schedules, candidateCount] = await Promise.all([
      db
        .select({
          id: examBatches.id,
          examId: examBatches.examId,
          batchId: examBatches.batchId,
          centerId: examBatches.centerId,
          name: examBatches.name,
          status: examBatches.status,
          shiftNumber: examBatches.shiftNumber,
          scheduledStartAt: examBatches.scheduledStartAt,
          scheduledEndAt: examBatches.scheduledEndAt,
          actualStartAt: examBatches.actualStartAt,
          actualEndAt: examBatches.actualEndAt,
          gracePeriodMinutes: examBatches.gracePeriodMinutes,
          instructionsJson: examBatches.instructionsJson,
          settingsJson: examBatches.settingsJson,
          createdBy: examBatches.createdBy,
          createdAt: examBatches.createdAt,
          updatedAt: examBatches.updatedAt,
        })
        .from(examBatches)
        .where(eq(examBatches.id, id))
        .limit(1),
      db
        .select({
          id: examSchedules.id,
          examBatchId: examSchedules.examBatchId,
          startAt: examSchedules.startAt,
          endAt: examSchedules.endAt,
          isActive: examSchedules.isActive,
          createdAt: examSchedules.createdAt,
        })
        .from(examSchedules)
        .where(eq(examSchedules.examBatchId, id))
        .orderBy(asc(examSchedules.startAt)),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(examBatchCandidates)
        .where(eq(examBatchCandidates.examBatchId, id)),
    ]);

    if (!batch) return reply.code(404).send({ error: "Exam batch not found" });

    return reply.send({
      ...batch,
      schedules,
      candidateCount: candidateCount[0]?.count ?? 0,
    });
  });

  /* ----- PUT /exam-batches/:id — update ----- */
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateBatchSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const {
      instructions,
      settings,
      scheduledStartAt,
      scheduledEndAt,
      ...fields
    } = parsed.data;

    const [updated] = await db
      .update(examBatches)
      .set({
        ...fields,
        ...(scheduledStartAt
          ? { scheduledStartAt: new Date(scheduledStartAt) }
          : {}),
        ...(scheduledEndAt ? { scheduledEndAt: new Date(scheduledEndAt) } : {}),
        ...(instructions !== undefined
          ? { instructionsJson: instructions as Record<string, unknown> | null }
          : {}),
        ...(settings !== undefined
          ? { settingsJson: settings as Record<string, unknown> | null }
          : {}),
        updatedAt: new Date(),
      } as Partial<typeof examBatches.$inferInsert>)
      .where(eq(examBatches.id, id))
      .returning();

    if (!updated)
      return reply.code(404).send({ error: "Exam batch not found" });
    return reply.send(updated);
  });

  /* ----- Lifecycle: POST /exam-batches/:id/:action -----
   *
   * Uses an atomic conditional UPDATE inside a transaction to prevent
   * race conditions when two concurrent requests try to transition the
   * same batch. The UPDATE only succeeds if the current status matches
   * what we expect, eliminating the read-then-write TOCTOU window.
   */
  const lifecycleHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
    targetStatus: string,
  ) => {
    const { id } = request.params as { id: string };

    const result = await db.transaction(async (tx) => {
      // Lock the row and read current status atomically
      const [batch] = await tx
        .select({ id: examBatches.id, status: examBatches.status })
        .from(examBatches)
        .where(eq(examBatches.id, id))
        .for("update")
        .limit(1);

      if (!batch)
        return { code: 404 as const, body: { error: "Exam batch not found" } };

      if (!assertTransition(batch.status, targetStatus))
        return {
          code: 409 as const,
          body: {
            error: `Cannot transition from '${batch.status}' to '${targetStatus}'`,
          },
        };

      const updateData: Record<string, unknown> = {
        status: targetStatus,
        updatedAt: new Date(),
      };

      if (targetStatus === "active") updateData.actualStartAt = new Date();
      if (targetStatus === "finished") updateData.actualEndAt = new Date();

      const [updated] = await tx
        .update(examBatches)
        .set(updateData as Partial<typeof examBatches.$inferInsert>)
        .where(eq(examBatches.id, id))
        .returning();

      return { code: 200 as const, body: updated };
    });

    return reply.code(result.code).send(result.body);
  };

  app.post("/:id/publish", async (request, reply) =>
    lifecycleHandler(request, reply, "published"),
  );
  app.post("/:id/activate", async (request, reply) =>
    lifecycleHandler(request, reply, "active"),
  );
  app.post("/:id/pause", async (request, reply) =>
    lifecycleHandler(request, reply, "paused"),
  );
  app.post("/:id/resume", async (request, reply) =>
    lifecycleHandler(request, reply, "active"),
  );
  app.post("/:id/finish", async (request, reply) =>
    lifecycleHandler(request, reply, "finished"),
  );
  app.post("/:id/publish-results", async (request, reply) =>
    lifecycleHandler(request, reply, "results_published"),
  );

  /* ----- POST /exam-batches/:id/candidates — assign candidates -----
   *
   * Parallelizes batch + candidate verification, then wraps the
   * duplicate-check + insert in a transaction to prevent race conditions.
   */
  app.post("/:id/candidates", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = assignCandidatesSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    // Parallel: verify batch exists + verify candidates exist
    const [batch, validCandidates] = await Promise.all([
      db
        .select({ id: examBatches.id })
        .from(examBatches)
        .where(eq(examBatches.id, id))
        .limit(1),
      db
        .select({ id: candidates.id })
        .from(candidates)
        .where(inArray(candidates.id, parsed.data.candidateIds)),
    ]);

    if (!batch) return reply.code(404).send({ error: "Exam batch not found" });

    if (validCandidates.length !== parsed.data.candidateIds.length)
      return reply.code(400).send({ error: "Some candidate IDs are invalid" });

    // Atomic insert with ON CONFLICT DO NOTHING — eliminates race conditions
    // at the database level. No need for a transaction or check-then-insert.
    const inserted = await db
      .insert(examBatchCandidates)
      .values(
        parsed.data.candidateIds.map((candidateId) => ({
          examBatchId: id,
          candidateId,
        })),
      )
      .onConflictDoNothing()
      .returning({ candidateId: examBatchCandidates.candidateId });

    const added = inserted.length;
    const skipped = parsed.data.candidateIds.length - added;

    return reply.code(201).send({
      message: `${added} candidate(s) assigned`,
      added,
      skipped,
    });
  });

  /* ----- GET /exam-batches/:id/candidates — list candidates in batch ----- */
  app.get("/:id/candidates", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select({
        id: examBatchCandidates.id,
        candidateId: examBatchCandidates.candidateId,
        assignedAt: examBatchCandidates.assignedAt,
        rollNumber: candidates.rollNumber,
        admitCardNumber: candidates.admitCardNumber,
        userId: candidates.userId,
        isActive: candidates.isActive,
      })
      .from(examBatchCandidates)
      .innerJoin(candidates, eq(examBatchCandidates.candidateId, candidates.id))
      .where(eq(examBatchCandidates.examBatchId, id))
      .orderBy(asc(examBatchCandidates.assignedAt));

    return reply.send({ data: rows, total: rows.length });
  });

  /* ----- GET /exam-batches/:id/attempts — list attempts in batch ----- */
  app.get("/:id/attempts", async (request, reply) => {
    const { id } = request.params as { id: string };

    const rows = await db
      .select({
        id: attempts.id,
        candidateId: attempts.candidateId,
        deviceId: attempts.deviceId,
        status: attempts.status,
        startedAt: attempts.startedAt,
        submittedAt: attempts.submittedAt,
        remainingTimeSecs: attempts.remainingTimeSecs,
        isReconnected: attempts.isReconnected,
        reconnectedCount: attempts.reconnectedCount,
      })
      .from(attempts)
      .where(eq(attempts.examBatchId, id))
      .orderBy(asc(attempts.createdAt));

    return reply.send({ data: rows, total: rows.length });
  });

  /* ----- GET /exam-batches/:id/monitor — monitoring snapshot -----
   *
   * All three queries run in parallel — if the batch doesn't exist,
   * the counts return 0 and we return 404.
   */
  app.get("/:id/monitor", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [batch, candidateCount, statusCounts] = await Promise.all([
      db
        .select({
          id: examBatches.id,
          name: examBatches.name,
          status: examBatches.status,
          examId: examBatches.examId,
          actualStartAt: examBatches.actualStartAt,
          actualEndAt: examBatches.actualEndAt,
        })
        .from(examBatches)
        .where(eq(examBatches.id, id))
        .limit(1),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(examBatchCandidates)
        .where(eq(examBatchCandidates.examBatchId, id)),
      db
        .select({
          status: attempts.status,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(attempts)
        .where(eq(attempts.examBatchId, id))
        .groupBy(attempts.status),
    ]);

    if (!batch) return reply.code(404).send({ error: "Exam batch not found" });

    const statusBreakdown: Record<string, number> = {};
    for (const s of statusCounts) {
      statusBreakdown[s.status] = s.count;
    }

    return reply.send({
      ...batch,
      totalCandidates: candidateCount[0]?.count ?? 0,
      attemptStatusBreakdown: statusBreakdown,
    });
  });
};

export default examBatchRoutes;
