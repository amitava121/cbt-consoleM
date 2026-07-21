import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    batchSubjects,
    batches,
    questionOptions,
    questionTags,
    questionVersions,
    questions,
    subjects,
} from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";

const createSubjectSchema = z.object({
  institutionId: z.string().uuid(),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  description: z.string().optional(),
});

const updateSubjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  institutionId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
});

const subjectsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search, institutionId, batchId } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search && search.length >= 3)
      conditions.push(ilike(subjects.name, `%${search}%`));
    if (institutionId)
      conditions.push(eq(subjects.institutionId, institutionId));
    if (batchId)
      conditions.push(
        sql`${subjects.id} IN (SELECT subject_id FROM batch_subjects WHERE batch_id = ${batchId})`,
      );

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select()
      .from(subjects)
      .orderBy(desc(subjects.createdAt))
      .limit(pageSize)
      .offset(offset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(subjects);

    const [rows, [{ count }]] = await Promise.all([
      where ? baseQuery.where(where) : baseQuery,
      where ? countQuery.where(where) : countQuery,
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.post(
    "/",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const parsed = createSubjectSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: "Invalid request body",
          details: parsed.error.flatten(),
        });
      const body = parsed.data;

      const [existing] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(
          and(
            eq(subjects.institutionId, body.institutionId),
            eq(subjects.code, body.code),
          ),
        )
        .limit(1);
      if (existing)
        return reply
          .code(409)
          .send({ error: "Subject code already exists in this institution" });

      const [subject] = await db.insert(subjects).values(body).returning();
      return reply.code(201).send(subject);
    },
  );

  app.put(
    "/:id",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const parsed = updateSubjectSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: "Invalid request body",
          details: parsed.error.flatten(),
        });

      const [updated] = await db
        .update(subjects)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(subjects.id, id))
        .returning();
      if (!updated) return reply.code(404).send({ error: "Subject not found" });
      return updated;
    },
  );

  // Get subjects for a specific batch
  app.get("/batch/:batchId", async (request) => {
    const batchId = (request.params as { batchId: string }).batchId;
    const rows = await db
      .select({
        id: subjects.id,
        institutionId: subjects.institutionId,
        name: subjects.name,
        code: subjects.code,
        description: subjects.description,
        isActive: subjects.isActive,
        createdAt: subjects.createdAt,
        updatedAt: subjects.updatedAt,
      })
      .from(batchSubjects)
      .innerJoin(subjects, eq(batchSubjects.subjectId, subjects.id))
      .where(eq(batchSubjects.batchId, batchId))
      .orderBy(desc(subjects.createdAt));
    return { data: rows, total: rows.length };
  });

  // Add subjects to a batch (from the same institution only)
  const addBatchSubjectsSchema = z.object({
    subjectIds: z.array(z.string().uuid()).min(1),
  });
  app.post(
    "/batch/:batchId",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const batchId = (request.params as { batchId: string }).batchId;
      const parsed = addBatchSubjectsSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: "Invalid request body",
          details: parsed.error.flatten(),
        });

      // Get batch's institution
      const [batch] = await db
        .select({ institutionId: batches.institutionId })
        .from(batches)
        .where(eq(batches.id, batchId))
        .limit(1);
      if (!batch) return reply.code(404).send({ error: "Batch not found" });

      // Verify all subjects belong to the same institution
      const subjectRows = await db
        .select({ id: subjects.id, institutionId: subjects.institutionId })
        .from(subjects)
        .where(inArray(subjects.id, parsed.data.subjectIds));
      const wrongInstitution = subjectRows.filter(
        (s) => s.institutionId !== batch.institutionId,
      );
      if (wrongInstitution.length > 0)
        return reply.code(403).send({
          error: "Subjects must belong to the same institution as the batch",
        });

      // Insert (ignore duplicates)
      const values = parsed.data.subjectIds.map((sid) => ({
        batchId,
        subjectId: sid,
      }));
      await db.insert(batchSubjects).values(values).onConflictDoNothing();
      return reply.code(201).send({ added: values.length });
    },
  );

  // Remove a subject from a batch
  app.delete(
    "/batch/:batchId/:subjectId",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const { batchId, subjectId } = request.params as {
        batchId: string;
        subjectId: string;
      };
      await db
        .delete(batchSubjects)
        .where(
          and(
            eq(batchSubjects.batchId, batchId),
            eq(batchSubjects.subjectId, subjectId),
          ),
        );
      return reply.code(204).send();
    },
  );

  // Permanent delete a subject and all related data
  app.delete(
    "/:id/permanent",
    { preHandler: requireRole("super_admin") },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;

      const [subject] = await db
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.id, id))
        .limit(1);
      if (!subject) return reply.code(404).send({ error: "Subject not found" });

      // Get all question IDs for this subject
      const questionRows = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.subjectId, id));
      const questionIds = questionRows.map((q) => q.id);

      if (questionIds.length > 0) {
        // Delete question versions
        await db
          .delete(questionVersions)
          .where(inArray(questionVersions.questionId, questionIds));

        // Delete question options
        await db
          .delete(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds));

        // Delete question tags
        await db
          .delete(questionTags)
          .where(inArray(questionTags.questionId, questionIds));

        // Delete questions
        await db.delete(questions).where(eq(questions.subjectId, id));
      }

      // Delete batch_subjects associations
      await db.delete(batchSubjects).where(eq(batchSubjects.subjectId, id));

      // Delete the subject
      await db.delete(subjects).where(eq(subjects.id, id));

      return reply.code(200).send({
        message: "Subject and all related data deleted permanently",
      });
    },
  );
};

export { subjectsRoutes };
