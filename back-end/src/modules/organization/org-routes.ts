import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import { batches, institutions } from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";

/* ---------- Zod Schemas ---------- */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  institutionId: z.string().uuid().optional(),
});

const createInstitutionSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  address: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
});

const updateInstitutionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  address: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
});

const createBatchSchema = z.object({
  institutionId: z.string().uuid(),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
});

const updateBatchSchema = z.object({
  institutionId: z.string().uuid().optional(),
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
});

/* ---------- Institutions Routes ---------- */

const institutionsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("super_admin"));

  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const where =
      search && search.length >= 3
        ? ilike(institutions.name, `%${search}%`)
        : undefined;

    const baseQuery = db
      .select()
      .from(institutions)
      .orderBy(desc(institutions.createdAt))
      .limit(pageSize)
      .offset(offset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(institutions);

    const [rows, [{ count }]] = await Promise.all([
      where ? baseQuery.where(where) : baseQuery,
      where ? countQuery.where(where) : countQuery,
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.post("/", async (request, reply) => {
    const parsed = createInstitutionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [existing] = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.code, parsed.data.code))
      .limit(1);
    if (existing)
      return reply.code(409).send({ error: "Institution code already exists" });

    const [institution] = await db
      .insert(institutions)
      .values(parsed.data)
      .returning();
    return reply.code(201).send(institution);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateInstitutionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [updated] = await db
      .update(institutions)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(institutions.id, id))
      .returning();
    if (!updated)
      return reply.code(404).send({ error: "Institution not found" });
    return updated;
  });

  app.delete("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      await db.transaction(async (tx) => {
        // 1. Delete attempt-dependent data for exam batches belonging to this institution's batches
        await tx.execute(
          sql`DELETE FROM answer_snapshots WHERE answer_id IN (SELECT a.id FROM answers a JOIN attempts at ON a.attempt_id = at.id JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM answers WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM event_logs WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM violation_reports WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM proctoring_events WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM scores WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM scorecards WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM certificates WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM session_tokens WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );

        // 2. Delete attempts for exam batches of this institution's batches
        await tx.execute(
          sql`DELETE FROM attempts WHERE exam_batch_id IN (SELECT eb.id FROM exam_batches eb JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );

        // 3. Delete exam_batch_candidates, proctoring_configs, analytics_snapshots
        await tx.execute(
          sql`DELETE FROM exam_batch_candidates WHERE exam_batch_id IN (SELECT eb.id FROM exam_batches eb JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM proctoring_configs WHERE exam_batch_id IN (SELECT eb.id FROM exam_batches eb JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM analytics_snapshots WHERE exam_batch_id IN (SELECT eb.id FROM exam_batches eb JOIN batches b ON eb.batch_id = b.id WHERE b.institution_id = ${id})`,
        );

        // 4. Delete exam_batches
        await tx.execute(
          sql`DELETE FROM exam_batches WHERE batch_id IN (SELECT id FROM batches WHERE institution_id = ${id})`,
        );

        // 5. Delete candidate-dependent data (by candidate for this institution's batches)
        await tx.execute(
          sql`DELETE FROM scorecards WHERE candidate_id IN (SELECT c.id FROM candidates c JOIN batches b ON c.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM certificates WHERE candidate_id IN (SELECT c.id FROM candidates c JOIN batches b ON c.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM exam_batch_candidates WHERE candidate_id IN (SELECT c.id FROM candidates c JOIN batches b ON c.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM attempts WHERE candidate_id IN (SELECT c.id FROM candidates c JOIN batches b ON c.batch_id = b.id WHERE b.institution_id = ${id})`,
        );

        // 6. Delete session_tokens and audit_logs for candidate users
        await tx.execute(
          sql`DELETE FROM session_tokens WHERE user_id IN (SELECT c.user_id FROM candidates c JOIN batches b ON c.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM audit_logs WHERE user_id IN (SELECT c.user_id FROM candidates c JOIN batches b ON c.batch_id = b.id WHERE b.institution_id = ${id})`,
        );

        // 7. Delete candidate users and candidates
        await tx.execute(
          sql`DELETE FROM users WHERE id IN (SELECT c.user_id FROM candidates c JOIN batches b ON c.batch_id = b.id WHERE b.institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM candidates WHERE batch_id IN (SELECT id FROM batches WHERE institution_id = ${id})`,
        );

        // 8. Delete session_tokens and audit_logs for institution users
        await tx.execute(
          sql`DELETE FROM session_tokens WHERE user_id IN (SELECT id FROM users WHERE institution_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM users WHERE institution_id = ${id})`,
        );

        // 9. Delete institution users
        await tx.execute(sql`DELETE FROM users WHERE institution_id = ${id}`);

        // 10. Delete batches
        await tx.execute(sql`DELETE FROM batches WHERE institution_id = ${id}`);

        // 11. Delete the institution
        const [deleted] = await tx
          .delete(institutions)
          .where(eq(institutions.id, id))
          .returning({ id: institutions.id });
        if (!deleted) throw new Error("Institution not found");
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Institution not found")
        return reply.code(404).send({ error: "Institution not found" });
      throw err;
    }

    return { message: "Institution and all related data deleted" };
  });
};

/* ---------- Batches Routes ---------- */

const batchesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("super_admin", "exam_admin"));

  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search, institutionId } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search && search.length >= 3)
      conditions.push(ilike(batches.name, `%${search}%`));
    if (institutionId)
      conditions.push(eq(batches.institutionId, institutionId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select({
        id: batches.id,
        institutionId: batches.institutionId,
        name: batches.name,
        code: batches.code,
        createdAt: batches.createdAt,
        updatedAt: batches.updatedAt,
        institutionName: institutions.name,
      })
      .from(batches)
      .leftJoin(institutions, eq(batches.institutionId, institutions.id))
      .orderBy(desc(batches.createdAt))
      .limit(pageSize)
      .offset(offset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(batches);

    const [rows, [{ count }]] = await Promise.all([
      where ? baseQuery.where(where) : baseQuery,
      where ? countQuery.where(where) : countQuery,
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.post("/", async (request, reply) => {
    const parsed = createBatchSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [existing] = await db
      .select({ id: batches.id })
      .from(batches)
      .where(eq(batches.code, parsed.data.code))
      .limit(1);
    if (existing)
      return reply.code(409).send({ error: "Batch code already exists" });

    const [batch] = await db
      .insert(batches)
      .values({
        institutionId: parsed.data.institutionId,
        name: parsed.data.name,
        code: parsed.data.code,
      })
      .returning();
    return reply.code(201).send(batch);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateBatchSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    // Check code uniqueness if code is being updated
    if (parsed.data.code) {
      const [existing] = await db
        .select({ id: batches.id })
        .from(batches)
        .where(eq(batches.code, parsed.data.code))
        .limit(1);
      if (existing && existing.id !== id)
        return reply.code(409).send({ error: "Batch code already exists" });
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .update(batches)
      .set(updateData)
      .where(eq(batches.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Batch not found" });
    return updated;
  });

  app.delete("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    try {
      await db.transaction(async (tx) => {
        // 1. Delete attempt-dependent data for exam batches of this batch
        await tx.execute(
          sql`DELETE FROM answer_snapshots WHERE answer_id IN (SELECT a.id FROM answers a JOIN attempts at ON a.attempt_id = at.id JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM answers WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM event_logs WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM violation_reports WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM proctoring_events WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM scores WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM scorecards WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM certificates WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM session_tokens WHERE attempt_id IN (SELECT at.id FROM attempts at JOIN exam_batches eb ON at.exam_batch_id = eb.id WHERE eb.batch_id = ${id})`,
        );

        // 2. Delete attempts for exam batches of this batch
        await tx.execute(
          sql`DELETE FROM attempts WHERE exam_batch_id IN (SELECT id FROM exam_batches WHERE batch_id = ${id})`,
        );

        // 3. Delete exam_batch_candidates, proctoring_configs, analytics_snapshots
        await tx.execute(
          sql`DELETE FROM exam_batch_candidates WHERE exam_batch_id IN (SELECT id FROM exam_batches WHERE batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM proctoring_configs WHERE exam_batch_id IN (SELECT id FROM exam_batches WHERE batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM analytics_snapshots WHERE exam_batch_id IN (SELECT id FROM exam_batches WHERE batch_id = ${id})`,
        );

        // 4. Delete exam_batches
        await tx.execute(sql`DELETE FROM exam_batches WHERE batch_id = ${id}`);

        // 5. Delete candidate-dependent data (by candidate for this batch)
        await tx.execute(
          sql`DELETE FROM scorecards WHERE candidate_id IN (SELECT id FROM candidates WHERE batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM certificates WHERE candidate_id IN (SELECT id FROM candidates WHERE batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM exam_batch_candidates WHERE candidate_id IN (SELECT id FROM candidates WHERE batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM attempts WHERE candidate_id IN (SELECT id FROM candidates WHERE batch_id = ${id})`,
        );

        // 6. Delete session_tokens and audit_logs for candidate users
        await tx.execute(
          sql`DELETE FROM session_tokens WHERE user_id IN (SELECT user_id FROM candidates WHERE batch_id = ${id})`,
        );
        await tx.execute(
          sql`DELETE FROM audit_logs WHERE user_id IN (SELECT user_id FROM candidates WHERE batch_id = ${id})`,
        );

        // 7. Delete candidate users and candidates
        await tx.execute(
          sql`DELETE FROM users WHERE id IN (SELECT user_id FROM candidates WHERE batch_id = ${id})`,
        );
        await tx.execute(sql`DELETE FROM candidates WHERE batch_id = ${id}`);

        // 8. Delete batch_subjects and batch_candidates associations
        await tx.execute(
          sql`DELETE FROM batch_subjects WHERE batch_id = ${id}`,
        );
        await tx.execute(
          sql`DELETE FROM batch_candidates WHERE batch_id = ${id}`,
        );

        // 9. Delete the batch
        const [deleted] = await tx
          .delete(batches)
          .where(eq(batches.id, id))
          .returning({ id: batches.id });
        if (!deleted) throw new Error("Batch not found");
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Batch not found")
        return reply.code(404).send({ error: "Batch not found" });
      throw err;
    }

    return { message: "Batch and all related data deleted" };
  });
};

export { batchesRoutes, institutionsRoutes };
