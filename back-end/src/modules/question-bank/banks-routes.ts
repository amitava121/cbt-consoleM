import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import { questionBanks, questions } from "../../database/schemas/index.js";

const createBankSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const updateBankSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const questionsListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().optional(),
  difficulty: z.string().optional(),
  isApproved: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

const questionBanksRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const where =
      search && search.length >= 3
        ? ilike(questionBanks.name, `%${search}%`)
        : undefined;

    const baseQuery = db
      .select()
      .from(questionBanks)
      .orderBy(desc(questionBanks.createdAt))
      .limit(pageSize)
      .offset(offset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(questionBanks);

    const [rows, [{ count }]] = await Promise.all([
      where ? baseQuery.where(where) : baseQuery,
      where ? countQuery.where(where) : countQuery,
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.post("/", async (request, reply) => {
    const parsed = createBankSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [bank] = await db
      .insert(questionBanks)
      .values({ ...parsed.data, createdBy: request.user.sub })
      .returning();
    return reply.code(201).send(bank);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateBankSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [updated] = await db
      .update(questionBanks)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(questionBanks.id, id))
      .returning();
    if (!updated)
      return reply.code(404).send({ error: "Question bank not found" });
    return updated;
  });

  app.get("/:id/questions", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = questionsListSchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid query parameters" });

    const { page, pageSize, type, difficulty, isApproved, search } =
      parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [
      eq(questions.questionBankId, id),
    ];
    if (type) conditions.push(eq(questions.type, type as never));
    if (difficulty)
      conditions.push(eq(questions.difficulty, difficulty as never));
    if (isApproved !== undefined) {
      if (isApproved) conditions.push(sql`${questions.approvedBy} IS NOT NULL`);
      else conditions.push(sql`${questions.approvedBy} IS NULL`);
    }
    if (search)
      conditions.push(
        ilike(sql`CAST(${questions.contentJson} AS TEXT)`, `%${search}%`),
      );

    const where = and(...conditions);

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(questions)
        .where(where)
        .orderBy(desc(questions.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(questions)
        .where(where),
    ]);

    return { data: rows, total: count, page, pageSize };
  });
};

export default questionBanksRoutes;
