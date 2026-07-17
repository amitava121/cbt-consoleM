import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    examQuestions,
    examSections,
    exams,
    questions,
} from "../../database/schemas/index.js";

/* ---------- Schemas ---------- */

const createExamSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  description: z.string().optional().nullable(),
  durationMinutes: z.number().int().min(1),
  totalMarks: z.coerce.number().min(0).transform(String),
  passingMarks: z.coerce
    .number()
    .min(0)
    .optional()
    .nullable()
    .transform((v) => (v !== null && v !== undefined ? String(v) : v)),
  hasNegativeMarking: z.boolean().default(false),
  selectionStrategy: z.enum(["static", "random", "hybrid"]).default("static"),
  navigationMode: z.enum(["free", "linear", "section_free"]).default("free"),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  instructions: z
    .object({
      title: z.string().optional(),
      body: z.string().optional(),
      rules: z.array(z.string()).optional(),
    })
    .optional()
    .nullable(),
  resultVisibility: z.string().max(20).default("delayed"),
});

const updateExamSchema = createExamSchema.partial();

const createSectionSchema = z.object({
  name: z.string().min(1).max(255),
  sectionOrder: z.number().int().min(1),
  durationMinutes: z.number().int().min(1).optional().nullable(),
  totalMarks: z.coerce.number().min(0).transform(String),
  negativeMarkingPercentage: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0)
    .transform(String),
  questionCount: z.number().int().min(1),
  navigationMode: z
    .enum(["free", "linear", "section_free"])
    .optional()
    .nullable(),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  instructions: z.record(z.unknown()).optional().nullable(),
});

const updateSectionSchema = createSectionSchema.partial();

const addExamQuestionsSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1),
  marks: z.coerce.number().min(0),
  negativeMarks: z.coerce.number().min(0).default(0),
  isOptional: z.boolean().default(false),
});

const updateExamQuestionSchema = z.object({
  marks: z.coerce.number().min(0).optional(),
  negativeMarks: z.coerce.number().min(0).optional(),
  isOptional: z.boolean().optional(),
  displayOrder: z.number().int().min(1).optional(),
});

/* ---------- Route Plugin ---------- */

const examRoutes: FastifyPluginAsync = async (app) => {
  /* ----- GET /exams — list with pagination ----- */
  app.get("/", async (request, reply) => {
    const query = request.query as {
      page?: string;
      pageSize?: string;
      search?: string;
    };
    const page = Math.max(1, parseInt(query.page ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(query.pageSize ?? "20")),
    );
    const search = query.search?.trim();

    const conditions = [];
    if (search && search.length >= 3) {
      conditions.push(ilike(exams.name, `%${search}%`));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(exams)
        .where(where)
        .orderBy(asc(exams.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(exams)
        .where(where),
    ]);

    return reply.send({
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  });

  /* ----- POST /exams — create exam ----- */
  app.post("/", async (request, reply) => {
    const parsed = createExamSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const { instructions, ...examFields } = parsed.data;

    const [exam] = await db
      .insert(exams)
      .values({
        ...examFields,
        instructionsJson: (instructions as Record<string, unknown>) ?? null,
        createdBy: request.user.sub,
      } as typeof exams.$inferInsert)
      .returning();

    return reply.code(201).send(exam);
  });

  /* ----- GET /exams/:id — get exam with sections ----- */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [exam] = await db.select().from(exams).where(eq(exams.id, id));
    if (!exam) return reply.code(404).send({ error: "Exam not found" });

    const sections = await db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, id))
      .orderBy(asc(examSections.sectionOrder));

    // Fetch question counts per section in one query
    const sectionIds = sections.map((s) => s.id);
    let sectionQuestions: {
      id: string;
      examSectionId: string;
      questionId: string;
      displayOrder: number;
      marks: string;
      negativeMarks: string;
      isOptional: boolean;
    }[] = [];
    if (sectionIds.length > 0) {
      sectionQuestions = await db
        .select({
          id: examQuestions.id,
          examSectionId: examQuestions.examSectionId,
          questionId: examQuestions.questionId,
          displayOrder: examQuestions.displayOrder,
          marks: examQuestions.marks,
          negativeMarks: examQuestions.negativeMarks,
          isOptional: examQuestions.isOptional,
        })
        .from(examQuestions)
        .where(inArray(examQuestions.examSectionId, sectionIds))
        .orderBy(asc(examQuestions.displayOrder));
    }

    const sectionsWithQuestions = sections.map((s) => ({
      ...s,
      questions: sectionQuestions.filter((q) => q.examSectionId === s.id),
    }));

    return reply.send({ ...exam, sections: sectionsWithQuestions });
  });

  /* ----- PUT /exams/:id — update exam ----- */
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateExamSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const { instructions, ...examFields } = parsed.data;

    const [updated] = await db
      .update(exams)
      .set({
        ...examFields,
        ...(instructions !== undefined
          ? { instructionsJson: instructions as Record<string, unknown> | null }
          : {}),
        updatedAt: new Date(),
      } as Partial<typeof exams.$inferInsert>)
      .where(eq(exams.id, id))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Exam not found" });
    return reply.send(updated);
  });

  /* ----- DELETE /exams/:id — deactivate exam ----- */
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [updated] = await db
      .update(exams)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(exams.id, id))
      .returning({ id: exams.id });

    if (!updated) return reply.code(404).send({ error: "Exam not found" });
    return reply.send({ message: "Exam deactivated" });
  });

  /* ----- POST /exams/:id/sections — add section ----- */
  app.post("/:id/sections", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createSectionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const [exam] = await db
      .select({ id: exams.id })
      .from(exams)
      .where(eq(exams.id, id));
    if (!exam) return reply.code(404).send({ error: "Exam not found" });

    const [section] = await db
      .insert(examSections)
      .values({
        ...parsed.data,
        examId: id,
        instructionsJson:
          (parsed.data.instructions as Record<string, unknown>) ?? null,
      } as typeof examSections.$inferInsert)
      .returning();

    return reply.code(201).send(section);
  });

  /* ----- PUT /exams/:id/sections/:sectionId — update section ----- */
  app.put("/:id/sections/:sectionId", async (request, reply) => {
    const { id, sectionId } = request.params as {
      id: string;
      sectionId: string;
    };
    const parsed = updateSectionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const { instructions, ...sectionFields } = parsed.data;

    const [updated] = await db
      .update(examSections)
      .set({
        ...sectionFields,
        ...(instructions !== undefined
          ? { instructionsJson: instructions as Record<string, unknown> | null }
          : {}),
        updatedAt: new Date(),
      } as Partial<typeof examSections.$inferInsert>)
      .where(and(eq(examSections.id, sectionId), eq(examSections.examId, id)))
      .returning();

    if (!updated) return reply.code(404).send({ error: "Section not found" });
    return reply.send(updated);
  });

  /* ----- DELETE /exams/:id/sections/:sectionId — remove section ----- */
  app.delete("/:id/sections/:sectionId", async (request, reply) => {
    const { id, sectionId } = request.params as {
      id: string;
      sectionId: string;
    };

    // Transaction: delete child questions + section atomically
    const result = await db.transaction(async (tx) => {
      await tx
        .delete(examQuestions)
        .where(eq(examQuestions.examSectionId, sectionId));

      const [deleted] = await tx
        .delete(examSections)
        .where(and(eq(examSections.id, sectionId), eq(examSections.examId, id)))
        .returning({ id: examSections.id });

      return deleted;
    });

    if (!result) return reply.code(404).send({ error: "Section not found" });
    return reply.send({ message: "Section removed" });
  });

  /* ----- POST /exams/:id/sections/:sectionId/questions — add questions ----- */
  app.post("/:id/sections/:sectionId/questions", async (request, reply) => {
    const { id, sectionId } = request.params as {
      id: string;
      sectionId: string;
    };
    const parsed = addExamQuestionsSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    // Parallel: verify section exists, validate question IDs, get max display order
    const [section, validQuestions, maxRow] = await Promise.all([
      db
        .select({ id: examSections.id })
        .from(examSections)
        .where(and(eq(examSections.id, sectionId), eq(examSections.examId, id)))
        .limit(1),
      db
        .select({ id: questions.id })
        .from(questions)
        .where(inArray(questions.id, parsed.data.questionIds)),
      db
        .select({
          maxOrder: sql<number>`COALESCE(MAX(${examQuestions.displayOrder}), 0)`,
        })
        .from(examQuestions)
        .where(eq(examQuestions.examSectionId, sectionId)),
    ]);

    if (!section.length)
      return reply.code(404).send({ error: "Section not found" });

    if (validQuestions.length !== parsed.data.questionIds.length)
      return reply.code(400).send({ error: "Some question IDs are invalid" });

    let nextOrder = (maxRow[0]?.maxOrder ?? 0) + 1;

    const values = parsed.data.questionIds.map((questionId) => ({
      examSectionId: sectionId,
      questionId,
      displayOrder: nextOrder++,
      marks: String(parsed.data.marks),
      negativeMarks: String(parsed.data.negativeMarks),
      isOptional: parsed.data.isOptional,
    }));

    await db.insert(examQuestions).values(values);

    return reply.code(201).send({
      message: `${values.length} question(s) added`,
      added: values.length,
    });
  });

  /* ----- PUT /exams/:id/sections/:sectionId/questions/:eqId — update exam question ----- */
  app.put(
    "/:id/sections/:sectionId/questions/:eqId",
    async (request, reply) => {
      const { sectionId, eqId } = request.params as {
        id: string;
        sectionId: string;
        eqId: string;
      };
      const parsed = updateExamQuestionSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        });

      const updateFields: Record<string, unknown> = {};
      if (parsed.data.marks !== undefined)
        updateFields.marks = String(parsed.data.marks);
      if (parsed.data.negativeMarks !== undefined)
        updateFields.negativeMarks = String(parsed.data.negativeMarks);
      if (parsed.data.isOptional !== undefined)
        updateFields.isOptional = parsed.data.isOptional;
      if (parsed.data.displayOrder !== undefined)
        updateFields.displayOrder = parsed.data.displayOrder;

      const [updated] = await db
        .update(examQuestions)
        .set(updateFields)
        .where(
          and(
            eq(examQuestions.id, eqId),
            eq(examQuestions.examSectionId, sectionId),
          ),
        )
        .returning();

      if (!updated)
        return reply.code(404).send({ error: "Exam question not found" });
      return reply.send(updated);
    },
  );

  /* ----- DELETE /exams/:id/sections/:sectionId/questions/:eqId — remove question ----- */
  app.delete(
    "/:id/sections/:sectionId/questions/:eqId",
    async (request, reply) => {
      const { sectionId, eqId } = request.params as {
        id: string;
        sectionId: string;
        eqId: string;
      };

      const [deleted] = await db
        .delete(examQuestions)
        .where(
          and(
            eq(examQuestions.id, eqId),
            eq(examQuestions.examSectionId, sectionId),
          ),
        )
        .returning();

      if (!deleted)
        return reply.code(404).send({ error: "Exam question not found" });
      return reply.send({ message: "Question removed from section" });
    },
  );
};

export default examRoutes;
