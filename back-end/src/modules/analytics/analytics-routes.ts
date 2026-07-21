import { and, eq, inArray } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    answers,
    attempts,
    questionOptions,
    scores,
} from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";

const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("super_admin", "exam_admin"));

  app.get("/batch/:examBatchId/item-analysis", async (request, reply) => {
    const { examBatchId } = request.params as { examBatchId: string };

    if (!z.string().uuid().safeParse(examBatchId).success) {
      return reply.code(400).send({ error: "Invalid exam batch ID" });
    }

    const batchAttempts = await db
      .select({ id: attempts.id })
      .from(attempts)
      .where(
        and(
          eq(attempts.examBatchId, examBatchId),
          inArray(attempts.status, [
            "submitted",
            "auto_submitted",
            "force_submitted",
          ]),
        ),
      );

    if (batchAttempts.length === 0) {
      return reply.send({ success: true, items: [] });
    }

    const attemptIds = batchAttempts.map((a) => a.id);

    const allAnswers = await db
      .select()
      .from(answers)
      .where(inArray(answers.attemptId, attemptIds));

    const totalAttempts = attemptIds.length;

    const questionStats = new Map<
      string,
      {
        questionId: string;
        attempted: number;
        correct: number;
        incorrect: number;
        notVisited: number;
      }
    >();

    for (const ans of allAnswers) {
      const stat = questionStats.get(ans.questionId) ?? {
        questionId: ans.questionId,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        notVisited: 0,
      };

      if (ans.status === "answered" || ans.status === "answered_and_marked") {
        stat.attempted++;
        const answerData = ans.answerDataJson as Record<string, unknown>;
        const selectedOptionId = answerData.selectedOptionId as
          | string
          | undefined;
        const selectedOptionIds = answerData.selectedOptionIds as
          | string[]
          | undefined;

        const optionRows = await db
          .select()
          .from(questionOptions)
          .where(eq(questionOptions.questionId, ans.questionId));

        const correctIds = optionRows
          .filter((o) => o.isCorrect)
          .map((o) => o.id);

        if (selectedOptionId) {
          if (correctIds.includes(selectedOptionId)) {
            stat.correct++;
          } else {
            stat.incorrect++;
          }
        } else if (selectedOptionIds && selectedOptionIds.length > 0) {
          const allCorrect =
            correctIds.every((id) => selectedOptionIds.includes(id)) &&
            selectedOptionIds.every((id) => correctIds.includes(id));
          if (allCorrect) {
            stat.correct++;
          } else {
            stat.incorrect++;
          }
        } else {
          stat.incorrect++;
        }
      } else {
        stat.notVisited++;
      }

      questionStats.set(ans.questionId, stat);
    }

    const items = Array.from(questionStats.values()).map((stat) => {
      const difficultyIndex =
        totalAttempts > 0 ? stat.correct / totalAttempts : 0;

      const discriminationIndex = 0;

      return {
        questionId: stat.questionId,
        totalAttempts,
        attempted: stat.attempted,
        correct: stat.correct,
        incorrect: stat.incorrect,
        notVisited: stat.notVisited,
        difficultyIndex: parseFloat(difficultyIndex.toFixed(3)),
        discriminationIndex,
        attemptRate:
          totalAttempts > 0
            ? parseFloat((stat.attempted / totalAttempts).toFixed(3))
            : 0,
        correctRate:
          stat.attempted > 0
            ? parseFloat((stat.correct / stat.attempted).toFixed(3))
            : 0,
      };
    });

    return reply.send({ success: true, items });
  });

  app.get("/batch/:examBatchId/section-analysis", async (request, reply) => {
    const { examBatchId } = request.params as { examBatchId: string };

    if (!z.string().uuid().safeParse(examBatchId).success) {
      return reply.code(400).send({ error: "Invalid exam batch ID" });
    }

    const batchScores = await db
      .select({
        sectionScoresJson: scores.sectionScoresJson,
      })
      .from(scores)
      .innerJoin(attempts, eq(scores.attemptId, attempts.id))
      .where(eq(attempts.examBatchId, examBatchId));

    if (batchScores.length === 0) {
      return reply.send({ success: true, sections: [] });
    }

    const sectionAgg = new Map<
      string,
      {
        sectionName: string;
        totalMarks: number;
        marksObtained: number;
        correctCount: number;
        incorrectCount: number;
        count: number;
      }
    >();

    for (const score of batchScores) {
      const sections =
        (score.sectionScoresJson as Array<{
          sectionId: string;
          sectionName: string;
          totalMarks: number;
          marksObtained: number;
          correctCount: number;
          incorrectCount: number;
        }>) ?? [];

      for (const sec of sections) {
        const agg = sectionAgg.get(sec.sectionId) ?? {
          sectionName: sec.sectionName,
          totalMarks: sec.totalMarks,
          marksObtained: 0,
          correctCount: 0,
          incorrectCount: 0,
          count: 0,
        };

        agg.marksObtained += sec.marksObtained;
        agg.correctCount += sec.correctCount;
        agg.incorrectCount += sec.incorrectCount;
        agg.count++;

        sectionAgg.set(sec.sectionId, agg);
      }
    }

    const sections = Array.from(sectionAgg.entries()).map(([id, agg]) => ({
      sectionId: id,
      sectionName: agg.sectionName,
      totalMarks: agg.totalMarks,
      avgMarksObtained: parseFloat((agg.marksObtained / agg.count).toFixed(2)),
      avgCorrectCount: parseFloat((agg.correctCount / agg.count).toFixed(2)),
      avgIncorrectCount: parseFloat(
        (agg.incorrectCount / agg.count).toFixed(2),
      ),
      candidateCount: agg.count,
    }));

    return reply.send({ success: true, sections });
  });
};

export default analyticsRoutes;
