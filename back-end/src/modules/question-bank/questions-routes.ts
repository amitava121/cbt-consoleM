import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    questionOptions,
    questions,
    questionTags,
    questionVersions,
} from "../../database/schemas/index.js";

const createQuestionSchema = z.object({
  questionBankId: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().optional().nullable(),
  type: z.enum([
    "mcq_single",
    "mcq_multiple",
    "fill_in_blank",
    "essay",
    "true_false",
    "matching",
    "assertion_reason",
    "comprehension",
    "drag_drop",
    "image_based",
    "audio_video",
    "numerical",
    "matrix_match",
  ]),
  difficulty: z.enum(["easy", "medium", "hard", "very_hard"]).default("medium"),
  cognitiveLevel: z
    .enum(["remember", "understand", "apply", "analyze", "evaluate", "create"])
    .optional()
    .nullable(),
  marks: z.coerce.number().min(0).max(9999.99),
  negativeMarks: z.coerce.number().min(0).max(9999.99).default(0),
  estimatedTimeSecs: z.number().int().min(1).optional().nullable(),
  content: z.object({
    text: z.string().min(1),
    latex: z.string().optional().nullable(),
    passageId: z.string().uuid().optional().nullable(),
  }),
  mediaUrls: z.array(z.string().url()).optional().default([]),
  options: z
    .array(
      z.object({
        text: z.string().min(1),
        isCorrect: z.boolean(),
        displayOrder: z.number().int().min(1),
      }),
    )
    .optional()
    .default([]),
  solution: z
    .object({
      text: z.string().optional(),
      explanation: z.string().optional(),
    })
    .optional()
    .nullable(),
  tags: z.array(z.string().max(100)).optional().default([]),
});

const updateQuestionSchema = createQuestionSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  questionBankId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  type: z.string().optional(),
  difficulty: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  isApproved: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

const questionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const {
      page,
      pageSize,
      questionBankId,
      subjectId,
      topicId,
      type,
      difficulty,
      isActive,
      isApproved,
      search,
    } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (questionBankId)
      conditions.push(eq(questions.questionBankId, questionBankId));
    if (subjectId) conditions.push(eq(questions.subjectId, subjectId));
    if (topicId) conditions.push(eq(questions.topicId, topicId));
    if (type) conditions.push(eq(questions.type, type as never));
    if (difficulty)
      conditions.push(eq(questions.difficulty, difficulty as never));
    if (isActive !== undefined)
      conditions.push(eq(questions.isActive, isActive));
    if (isApproved !== undefined) {
      if (isApproved) conditions.push(sql`${questions.approvedBy} IS NOT NULL`);
      else conditions.push(sql`${questions.approvedBy} IS NULL`);
    }
    if (search)
      conditions.push(
        ilike(sql`CAST(${questions.contentJson} AS TEXT)`, `%${search}%`),
      );

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ count }]] = await Promise.all([
      where
        ? db
            .select()
            .from(questions)
            .where(where)
            .orderBy(desc(questions.createdAt))
            .limit(pageSize)
            .offset(offset)
        : db
            .select()
            .from(questions)
            .orderBy(desc(questions.createdAt))
            .limit(pageSize)
            .offset(offset),
      where
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(questions)
            .where(where)
        : db.select({ count: sql<number>`count(*)::int` }).from(questions),
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.get("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const [question] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);
    if (!question) return reply.code(404).send({ error: "Question not found" });

    const [options, tags] = await Promise.all([
      db
        .select()
        .from(questionOptions)
        .where(eq(questionOptions.questionId, id))
        .orderBy(asc(questionOptions.displayOrder)),
      db.select().from(questionTags).where(eq(questionTags.questionId, id)),
    ]);

    return { ...question, options, tags: tags.map((t) => t.tag) };
  });

  app.post("/", async (request, reply) => {
    const parsed = createQuestionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    const body = parsed.data;

    const {
      options: optsData,
      tags: tagData,
      content,
      mediaUrls,
      solution,
      ...questionData
    } = body;

    const [question] = await db
      .insert(questions)
      .values({
        ...questionData,
        marks: String(body.marks),
        negativeMarks: String(body.negativeMarks),
        contentJson: content,
        mediaUrlsJson: mediaUrls.length > 0 ? mediaUrls : null,
        solutionJson: solution ?? null,
        createdBy: request.user.sub,
      })
      .returning();

    const insertPromises: Promise<unknown>[] = [];

    if (optsData.length > 0) {
      insertPromises.push(
        db.insert(questionOptions).values(
          optsData.map((o) => ({
            questionId: question.id,
            optionText: o.text,
            isCorrect: o.isCorrect,
            displayOrder: o.displayOrder,
          })),
        ),
      );
    }

    if (tagData.length > 0) {
      insertPromises.push(
        db
          .insert(questionTags)
          .values(tagData.map((tag) => ({ questionId: question.id, tag }))),
      );
    }

    insertPromises.push(
      db.insert(questionVersions).values({
        questionId: question.id,
        versionNumber: 1,
        contentJson: content,
        changedBy: request.user.sub,
        changeReason: "Initial creation",
      }),
    );

    await Promise.all(insertPromises);

    return reply.code(201).send(question);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateQuestionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    const body = parsed.data;

    const [existing] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "Question not found" });

    const {
      options: optsData,
      tags: tagData,
      content,
      mediaUrls,
      solution,
      ...questionData
    } = body;

    const updateData: Record<string, unknown> = {
      ...questionData,
      updatedAt: new Date(),
    };
    if (content) {
      updateData.contentJson = content;
      updateData.version = existing.version + 1;
    }
    if (mediaUrls !== undefined)
      updateData.mediaUrlsJson = mediaUrls.length > 0 ? mediaUrls : null;
    if (solution !== undefined) updateData.solutionJson = solution ?? null;

    const [updated] = await db
      .update(questions)
      .set(updateData)
      .where(eq(questions.id, id))
      .returning();

    const sideEffects: Promise<unknown>[] = [];

    if (optsData && optsData.length > 0) {
      sideEffects.push(
        db.delete(questionOptions).where(eq(questionOptions.questionId, id)),
      );
    }

    if (tagData !== undefined) {
      sideEffects.push(
        db.delete(questionTags).where(eq(questionTags.questionId, id)),
      );
    }

    if (content) {
      sideEffects.push(
        db.insert(questionVersions).values({
          questionId: id,
          versionNumber: existing.version + 1,
          contentJson: content,
          changedBy: request.user.sub,
          changeReason: "Updated via admin panel",
        }),
      );
    }

    await Promise.all(sideEffects);

    const insertAfterDelete: Promise<unknown>[] = [];

    if (optsData && optsData.length > 0) {
      insertAfterDelete.push(
        db.insert(questionOptions).values(
          optsData.map((o) => ({
            questionId: id,
            optionText: o.text,
            isCorrect: o.isCorrect,
            displayOrder: o.displayOrder,
          })),
        ),
      );
    }

    if (tagData !== undefined && tagData.length > 0) {
      insertAfterDelete.push(
        db
          .insert(questionTags)
          .values(tagData.map((tag) => ({ questionId: id, tag }))),
      );
    }

    if (insertAfterDelete.length > 0) {
      await Promise.all(insertAfterDelete);
    }

    return updated;
  });

  app.delete("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const [updated] = await db
      .update(questions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(questions.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Question not found" });
    return { message: "Question deactivated" };
  });

  app.post("/:id/approve", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const [approved] = await db
      .update(questions)
      .set({
        approvedBy: request.user.sub,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(questions.id, id))
      .returning();
    if (!approved) return reply.code(404).send({ error: "Question not found" });
    return approved;
  });

  app.get("/:id/versions", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const [existing] = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);
    if (!existing) return reply.code(404).send({ error: "Question not found" });

    const versions = await db
      .select()
      .from(questionVersions)
      .where(eq(questionVersions.questionId, id))
      .orderBy(desc(questionVersions.versionNumber));

    return { data: versions, total: versions.length };
  });
};

export default questionsRoutes;
