import { eq } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import { examBatches } from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";
import {
    calculateRanks,
    getAttemptResult,
    getBatchResults,
    getBatchStats,
    gradeAndSaveAttempt,
    gradeBatch,
} from "./results-service.js";

const gradeAttemptSchema = z.object({
  attemptId: z.string().uuid(),
});

const gradeBatchSchema = z.object({
  examBatchId: z.string().uuid(),
});

const resultsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("super_admin", "exam_admin"));

  app.post("/grade/attempt", async (request, reply) => {
    const parsed = gradeAttemptSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const result = await gradeAndSaveAttempt(parsed.data.attemptId);
      return reply.send({
        success: true,
        result: {
          attemptId: result.attemptId,
          totalMarks: result.totalMarks,
          marksObtained: result.marksObtained,
          netScore: result.netScore,
          correctCount: result.correctCount,
          incorrectCount: result.incorrectCount,
          unattemptedCount: result.unattemptedCount,
          totalQuestions: result.totalQuestions,
          sectionResults: result.sectionResults,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return reply.code(400).send({ error: message });
    }
  });

  app.post("/grade/batch", async (request, reply) => {
    const parsed = gradeBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const { examBatchId } = parsed.data;

    const batch = await db
      .select()
      .from(examBatches)
      .where(eq(examBatches.id, examBatchId))
      .limit(1);

    if (!batch[0]) {
      return reply.code(404).send({ error: "Exam batch not found" });
    }

    const gradeResult = await gradeBatch(examBatchId);
    const rankResult = await calculateRanks(examBatchId);

    return reply.send({
      success: true,
      graded: gradeResult.graded,
      failed: gradeResult.failed,
      ranked: rankResult.ranked,
    });
  });

  app.get("/batch/:examBatchId", async (request, reply) => {
    const { examBatchId } = request.params as { examBatchId: string };

    if (!z.string().uuid().safeParse(examBatchId).success) {
      return reply.code(400).send({ error: "Invalid exam batch ID" });
    }

    const results = await getBatchResults(examBatchId);

    if (results.length === 0) {
      return reply.send({
        success: true,
        results: [],
        message: "No graded results found. Grade the batch first.",
      });
    }

    return reply.send({ success: true, results });
  });

  app.get("/batch/:examBatchId/stats", async (request, reply) => {
    const { examBatchId } = request.params as { examBatchId: string };

    if (!z.string().uuid().safeParse(examBatchId).success) {
      return reply.code(400).send({ error: "Invalid exam batch ID" });
    }

    const stats = await getBatchStats(examBatchId);
    return reply.send({ success: true, stats });
  });

  app.get("/attempt/:attemptId", async (request, reply) => {
    const { attemptId } = request.params as { attemptId: string };

    if (!z.string().uuid().safeParse(attemptId).success) {
      return reply.code(400).send({ error: "Invalid attempt ID" });
    }

    const result = await getAttemptResult(attemptId);

    if (!result) {
      return reply
        .code(404)
        .send({ error: "Result not found. Grade the attempt first." });
    }

    return reply.send({ success: true, ...result });
  });

  app.post("/batch/:examBatchId/publish", async (request, reply) => {
    const { examBatchId } = request.params as { examBatchId: string };

    if (!z.string().uuid().safeParse(examBatchId).success) {
      return reply.code(400).send({ error: "Invalid exam batch ID" });
    }

    const batch = await db
      .select()
      .from(examBatches)
      .where(eq(examBatches.id, examBatchId))
      .limit(1);

    if (!batch[0]) {
      return reply.code(404).send({ error: "Exam batch not found" });
    }

    await db
      .update(examBatches)
      .set({ status: "results_published" })
      .where(eq(examBatches.id, examBatchId));

    return reply.send({ success: true, message: "Results published" });
  });
};

export default resultsRoutes;
