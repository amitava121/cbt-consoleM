import { desc, eq, ilike, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import { subjects, topics } from "../../database/schemas/index.js";

const createSubjectSchema = z.object({
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

const createTopicSchema = z.object({
  subjectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  parentTopicId: z.string().uuid().optional().nullable(),
});

const updateTopicSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  parentTopicId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const subjectsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const where =
      search && search.length >= 3
        ? ilike(subjects.name, `%${search}%`)
        : undefined;

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

  app.post("/", async (request, reply) => {
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
      .where(eq(subjects.code, body.code))
      .limit(1);
    if (existing)
      return reply.code(409).send({ error: "Subject code already exists" });

    const [subject] = await db.insert(subjects).values(body).returning();
    return reply.code(201).send(subject);
  });

  app.put("/:id", async (request, reply) => {
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
  });

  app.get("/:id/topics", async (request) => {
    const id = (request.params as { id: string }).id;
    const rows = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, id))
      .orderBy(desc(topics.createdAt));
    return { data: rows, total: rows.length };
  });
};

const topicsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/", async (request, reply) => {
    const parsed = createTopicSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [topic] = await db.insert(topics).values(parsed.data).returning();
    return reply.code(201).send(topic);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateTopicSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [updated] = await db
      .update(topics)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(topics.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Topic not found" });
    return updated;
  });
};

export { subjectsRoutes, topicsRoutes };
