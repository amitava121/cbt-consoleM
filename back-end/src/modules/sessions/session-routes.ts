import { eq, inArray } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    attempts,
    examBatches,
    examQuestions,
    examSections,
    exams,
    questionOptions,
    questions,
} from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";
import { seededShuffle } from "../../utils/shuffle.js";
import { roomManager } from "../../websocket/rooms.js";
import {
    batchSyncAnswers,
    createViolation,
    getActiveAttempts,
    getAttemptAnswers,
    getRemainingTime,
    logEvent,
    pauseAttempt,
    resumeAttempt,
    saveAnswer,
    startOrResumeAttempt,
    submitAttempt,
    terminateAttempt,
} from "./session-service.js";

const startAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  deviceFingerprint: z.string().optional(),
});

const saveAnswerSchema = z.object({
  questionId: z.string().uuid(),
  answerData: z.any(),
  status: z.enum([
    "not_visited",
    "visited",
    "answered",
    "marked_for_review",
    "answered_and_marked",
  ]),
  timeSpentSecs: z.number().int().min(0),
  isMarkedForReview: z.boolean(),
});

const batchSyncSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      answerData: z.any(),
      status: z.enum([
        "not_visited",
        "visited",
        "answered",
        "marked_for_review",
        "answered_and_marked",
      ]),
      timeSpentSecs: z.number().int().min(0),
      isMarkedForReview: z.boolean(),
    }),
  ),
});

const logEventSchema = z.object({
  eventType: z.string().min(1).max(50),
  eventData: z.unknown(),
  severity: z.enum(["info", "warn", "error"]),
  clientTimestamp: z.string().datetime().optional(),
});

const violationSchema = z.object({
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
  description: z.string().min(1),
  evidenceUrl: z.string().url().optional(),
});

const adminActionSchema = z.object({
  reason: z.string().min(1).max(500),
});

const terminateSchema = z.object({
  reason: z.string().min(1).max(500),
});

const sessionRoutes: FastifyPluginAsync = async (app) => {
  // ─── POST /sessions/:attemptId/start ──────────────────────────
  app.post(
    "/:attemptId/start",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const body = startAttemptSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      try {
        const result = await startOrResumeAttempt({
          attemptId,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
        });

        const attemptAnswers = await getAttemptAnswers(attemptId);

        return reply.send({
          ...result,
          answers: attemptAnswers,
        });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to start attempt");
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // ─── GET /sessions/:attemptId/state ───────────────────────────
  app.get(
    "/:attemptId/state",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };

      // Parallel queries instead of sequential
      const [{ remainingSecs, status }, attemptAnswers] = await Promise.all([
        getRemainingTime(attemptId),
        getAttemptAnswers(attemptId),
      ]);

      return reply.send({
        attemptId,
        status,
        remainingTimeSecs: remainingSecs,
        answers: attemptAnswers,
        serverTime: Date.now(),
      });
    },
  );

  // ─── POST /sessions/:attemptId/answers ────────────────────────
  app.post(
    "/:attemptId/answers",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const body = saveAnswerSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      try {
        const result = await saveAnswer({
          attemptId,
          ...body.data,
        });

        return reply.send({
          saved: result.saved,
          status: result.status,
          savedAt: Date.now(),
        });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to save answer");
        return reply.code(500).send({ error: "Failed to save answer" });
      }
    },
  );

  // ─── POST /sessions/:attemptId/answers/batch ──────────────────
  app.post(
    "/:attemptId/answers/batch",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const body = batchSyncSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      try {
        const result = await batchSyncAnswers({
          attemptId,
          answers: body.data.answers,
        });

        return reply.send({
          savedCount: result.savedCount,
          savedAt: Date.now(),
        });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to batch sync answers");
        return reply.code(500).send({ error: "Failed to batch sync answers" });
      }
    },
  );

  // ─── POST /sessions/:attemptId/submit ─────────────────────────
  app.post(
    "/:attemptId/submit",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };

      try {
        await submitAttempt(attemptId, "submitted");

        // Notify via WebSocket
        roomManager.broadcast(`attempt:${attemptId}`, {
          type: "session:finished",
          attemptId,
          finishReason: "submitted",
          serverTime: Date.now(),
        });

        return reply.send({ submitted: true, submittedAt: Date.now() });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to submit attempt");
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // ─── POST /sessions/:attemptId/pause (admin/proctor) ──────────
  app.post(
    "/:attemptId/pause",
    { preHandler: requireRole("super_admin", "exam_admin", "proctor") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const body = adminActionSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      try {
        const result = await pauseAttempt(attemptId, body.data.reason);

        roomManager.broadcast(`attempt:${attemptId}`, {
          type: "session:paused",
          attemptId,
          reason: body.data.reason,
          serverTime: Date.now(),
        });

        return reply.send({
          paused: true,
          remainingTimeSecs: result.remainingTimeSecs,
        });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to pause attempt");
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // ─── POST /sessions/:attemptId/resume (admin/proctor) ─────────
  app.post(
    "/:attemptId/resume",
    { preHandler: requireRole("super_admin", "exam_admin", "proctor") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };

      try {
        const result = await resumeAttempt(attemptId);

        roomManager.broadcast(`attempt:${attemptId}`, {
          type: "session:resumed",
          attemptId,
          remainingTimeSecs: result.remainingTimeSecs,
          serverTime: Date.now(),
        });

        return reply.send({
          resumed: true,
          remainingTimeSecs: result.remainingTimeSecs,
        });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to resume attempt");
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // ─── POST /sessions/:attemptId/terminate (admin/proctor) ──────
  app.post(
    "/:attemptId/terminate",
    { preHandler: requireRole("super_admin", "exam_admin", "proctor") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const body = terminateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      try {
        const user = request.user;
        await terminateAttempt(attemptId, user.sub, body.data.reason);

        roomManager.broadcast(`attempt:${attemptId}`, {
          type: "session:finished",
          attemptId,
          finishReason: "terminated",
          serverTime: Date.now(),
        });

        return reply.send({ terminated: true, terminatedAt: Date.now() });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to terminate attempt");
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  // ─── POST /sessions/:attemptId/events ─────────────────────────
  app.post(
    "/:attemptId/events",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const body = logEventSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      try {
        await logEvent({
          attemptId,
          eventType: body.data.eventType,
          eventData: body.data.eventData,
          severity: body.data.severity,
          clientTimestamp: body.data.clientTimestamp
            ? new Date(body.data.clientTimestamp)
            : undefined,
        });

        return reply.send({ logged: true });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to log event");
        return reply.code(500).send({ error: "Failed to log event" });
      }
    },
  );

  // ─── POST /sessions/:attemptId/violations ─────────────────────
  app.post(
    "/:attemptId/violations",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };
      const body = violationSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      try {
        await createViolation({
          attemptId,
          violationType: body.data.violationType,
          severity: body.data.severity,
          description: body.data.description,
          evidenceUrl: body.data.evidenceUrl,
        });

        // Notify admin room
        roomManager.broadcast("admin", {
          type: "violation:report",
          attemptId,
          violationType: body.data.violationType,
          severity: body.data.severity,
          serverTime: Date.now(),
        });

        return reply.send({ reported: true });
      } catch (err) {
        request.log.error({ err, attemptId }, "Failed to create violation");
        return reply.code(500).send({ error: "Failed to create violation" });
      }
    },
  );

  // ─── GET /sessions/active?examBatchId=xxx (admin/proctor) ─────
  app.get(
    "/active",
    { preHandler: requireRole("super_admin", "exam_admin", "proctor") },
    async (request, reply) => {
      const query = request.query as { examBatchId?: string };
      if (!query.examBatchId) {
        return reply.code(400).send({ error: "examBatchId is required" });
      }

      // getActiveAttempts now computes remaining time in SQL — no N+1
      const activeAttempts = await getActiveAttempts(query.examBatchId);

      // Enrich with WebSocket connection status
      const enriched = activeAttempts.map((a) => ({
        ...a,
        wsConnected: roomManager.getRoomSize(`attempt:${a.id}`) > 0,
      }));

      return reply.send({
        examBatchId: query.examBatchId,
        activeCount: enriched.length,
        attempts: enriched,
        serverTime: Date.now(),
      });
    },
  );

  // ─── GET /sessions/:attemptId/exam-paper ──────────────────────
  // Returns the full exam paper for the attempt (questions + options)
  // Optimized: parallel queries and response caching header
  app.get(
    "/:attemptId/exam-paper",
    { preHandler: requireRole("candidate") },
    async (request, reply) => {
      const { attemptId } = request.params as { attemptId: string };

      // Single JOIN: attempt → batch → exam in 1 query
      const attemptData = await db
        .select({
          examId: examBatches.examId,
          attemptStatus: attempts.status,
          examData: exams,
        })
        .from(attempts)
        .innerJoin(examBatches, eq(examBatches.id, attempts.examBatchId))
        .innerJoin(exams, eq(exams.id, examBatches.examId))
        .where(eq(attempts.id, attemptId))
        .limit(1);

      if (attemptData.length === 0) {
        return reply.code(404).send({ error: "Attempt not found" });
      }

      const { examId, examData } = attemptData[0];

      // Parallel: fetch sections and all exam questions in one pass
      const [sections, examQs] = await Promise.all([
        db
          .select()
          .from(examSections)
          .where(eq(examSections.examId, examId))
          .orderBy(examSections.sectionOrder),
        db
          .select({
            eqId: examQuestions.id,
            examSectionId: examQuestions.examSectionId,
            questionId: examQuestions.questionId,
            displayOrder: examQuestions.displayOrder,
            isOptional: examQuestions.isOptional,
            qId: questions.id,
            qType: questions.type,
            qText: questions.contentJson,
            qMediaUrl: questions.mediaUrlsJson,
          })
          .from(examQuestions)
          .innerJoin(questions, eq(examQuestions.questionId, questions.id))
          .innerJoin(
            examSections,
            eq(examQuestions.examSectionId, examSections.id),
          )
          .where(eq(examSections.examId, examId))
          .orderBy(examQuestions.displayOrder),
      ]);

      if (sections.length === 0) {
        return reply.send({ exam: examData, sections: [], questions: [] });
      }

      // Get options for all questions in parallel
      const questionIds = examQs.map((q) => q.questionId);
      let optionsMap: Record<string, unknown[]> = {};
      if (questionIds.length > 0) {
        const opts = await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(questionOptions.displayOrder);

        for (const opt of opts) {
          if (!optionsMap[opt.questionId]) {
            optionsMap[opt.questionId] = [];
          }
          // Don't send isCorrect to client!
          optionsMap[opt.questionId].push({
            id: opt.id,
            text: opt.optionText,
            mediaUrl: opt.optionMediaUrl,
            displayOrder: opt.displayOrder,
          });
        }
      }

      // Cache exam paper for 5 minutes (immutable during an attempt)
      reply.header("Cache-Control", "private, max-age=300");

      // Apply shuffle if enabled (seeded by attempt ID for per-candidate consistency)
      const shuffleSeed = attemptId;
      let shuffledExamQs = examQs;
      if (examData.shuffleQuestions) {
        shuffledExamQs = seededShuffle(examQs, shuffleSeed + ":questions");
      }

      return reply.send({
        exam: examData,
        sections,
        questions: shuffledExamQs.map((q) => {
          let qOpts = optionsMap[q.questionId] ?? [];
          if (examData.shuffleOptions && qOpts.length > 0) {
            qOpts = seededShuffle(
              qOpts as unknown[],
              shuffleSeed + ":options:" + q.questionId,
            );
          }
          return {
            examQuestionId: q.eqId,
            examSectionId: q.examSectionId,
            questionId: q.questionId,
            displayOrder: q.displayOrder,
            isOptional: q.isOptional,
            type: q.qType,
            content: q.qText,
            mediaUrls: q.qMediaUrl,
            options: qOpts,
          };
        }),
      });
    },
  );
};

export default sessionRoutes;
