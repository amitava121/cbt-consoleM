import { and, eq, inArray } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { db } from "../../database/db.js";
import {
    attempts,
    deviceRegistrations,
    examBatchCandidates,
    examBatches,
    examQuestions,
    examSections,
    exams,
    questionOptions,
    questions,
} from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";

/**
 * Candidate exam endpoints per API_SPECIFICATION.md Section 5.1.
 *
 * GET  /candidate/exams               — List assigned exams
 * GET  /candidate/exams/:batchId      — Get exam metadata
 * GET  /candidate/exams/:batchId/questions — Get exam questions
 * POST /candidate/exams/:batchId/start    — Start exam attempt
 * GET  /candidate/exams/:batchId/manifest — Get signed exam manifest
 */
const candidateExamRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("candidate"));

  // ─── GET /candidate/exams — List assigned exams for the logged-in candidate ───
  app.get("/", async (request, _reply) => {
    const userId = request.user.sub;

    // Find all exam batches where this candidate is assigned
    const assignments = await db
      .select({
        examBatchId: examBatchCandidates.examBatchId,
        batchName: examBatches.name,
        batchStatus: examBatches.status,
        scheduledStartAt: examBatches.scheduledStartAt,
        scheduledEndAt: examBatches.scheduledEndAt,
        examId: examBatches.examId,
        examName: exams.name,
        examDuration: exams.durationMinutes,
        examTotalMarks: exams.totalMarks,
        examInstructions: exams.instructionsJson,
      })
      .from(examBatchCandidates)
      .innerJoin(
        examBatches,
        eq(examBatches.id, examBatchCandidates.examBatchId),
      )
      .innerJoin(exams, eq(exams.id, examBatches.examId))
      .where(eq(examBatchCandidates.candidateId, userId));

    const result = assignments.map((a) => ({
      examBatchId: a.examBatchId,
      examName: a.examName ?? a.batchName,
      durationMinutes: a.examDuration,
      totalMarks: a.examTotalMarks,
      status: a.batchStatus,
      scheduledAt: a.scheduledStartAt?.toISOString() ?? null,
      instructions: a.examInstructions ?? null,
    }));

    return result;
  });

  // ─── GET /candidate/exams/:batchId — Get exam metadata ────────────────────────
  app.get("/:batchId", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const userId = request.user.sub;

    // Verify candidate is assigned to this batch
    const [assignment] = await db
      .select()
      .from(examBatchCandidates)
      .where(
        and(
          eq(examBatchCandidates.examBatchId, batchId),
          eq(examBatchCandidates.candidateId, userId),
        ),
      )
      .limit(1);

    if (!assignment) {
      return reply.code(403).send({ error: "Not assigned to this exam batch" });
    }

    const [batch] = await db
      .select({
        batchId: examBatches.id,
        batchStatus: examBatches.status,
        scheduledStartAt: examBatches.scheduledStartAt,
        examId: examBatches.examId,
        examName: exams.name,
        examDuration: exams.durationMinutes,
        examTotalMarks: exams.totalMarks,
        examInstructions: exams.instructionsJson,
        examNavigation: exams.navigationMode,
      })
      .from(examBatches)
      .innerJoin(exams, eq(exams.id, examBatches.examId))
      .where(eq(examBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return reply.code(404).send({ error: "Exam batch not found" });
    }

    // Get sections
    const sections = await db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, batch.examId))
      .orderBy(examSections.sectionOrder);

    return {
      examBatchId: batch.batchId,
      examName: batch.examName,
      durationMinutes: batch.examDuration,
      totalMarks: batch.examTotalMarks,
      status: batch.batchStatus,
      scheduledAt: batch.scheduledStartAt?.toISOString() ?? null,
      instructions: batch.examInstructions,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        sectionOrder: s.sectionOrder,
        durationMinutes: s.durationMinutes,
        questionCount: s.questionCount,
        totalMarks: s.totalMarks,
      })),
    };
  });

  // ─── GET /candidate/exams/:batchId/questions — Get exam questions ─────────────
  app.get("/:batchId/questions", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const userId = request.user.sub;

    // Verify assignment
    const [assignment] = await db
      .select()
      .from(examBatchCandidates)
      .where(
        and(
          eq(examBatchCandidates.examBatchId, batchId),
          eq(examBatchCandidates.candidateId, userId),
        ),
      )
      .limit(1);

    if (!assignment) {
      return reply.code(403).send({ error: "Not assigned to this exam batch" });
    }

    // Get exam ID from batch
    const [batch] = await db
      .select({ examId: examBatches.examId, status: examBatches.status })
      .from(examBatches)
      .where(eq(examBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return reply.code(404).send({ error: "Exam batch not found" });
    }

    // Get sections
    const sections = await db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, batch.examId))
      .orderBy(examSections.sectionOrder);

    if (sections.length === 0) {
      return [];
    }

    const sectionIds = sections.map((s) => s.id);

    // Get exam questions with question details
    const examQs = await db
      .select({
        examSectionId: examQuestions.examSectionId,
        questionId: examQuestions.questionId,
        displayOrder: examQuestions.displayOrder,
        marks: examQuestions.marks,
        negativeMarks: examQuestions.negativeMarks,
        qType: questions.type,
        qContent: questions.contentJson,
        qMediaUrls: questions.mediaUrlsJson,
      })
      .from(examQuestions)
      .innerJoin(questions, eq(examQuestions.questionId, questions.id))
      .where(inArray(examQuestions.examSectionId, sectionIds))
      .orderBy(examQuestions.displayOrder);

    // Get options (without isCorrect — never expose to candidate)
    const questionIds = examQs.map((q) => q.questionId);
    const optionsMap: Record<
      string,
      Array<{
        id: string;
        text: string;
        optionMediaUrl: string | null;
        displayOrder: number;
      }>
    > = {};

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
        optionsMap[opt.questionId].push({
          id: opt.id,
          text: opt.optionText,
          optionMediaUrl: opt.optionMediaUrl,
          displayOrder: opt.displayOrder,
        });
      }
    }

    // Return in CLIENT_ARCHITECTURE.md Question model format
    return examQs.map((q) => {
      const content =
        typeof q.qContent === "string" ? JSON.parse(q.qContent) : q.qContent;
      return {
        id: q.questionId,
        sectionId: q.examSectionId,
        type: q.qType,
        displayOrder: q.displayOrder,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        content: {
          text: content?.text ?? "",
          latex: content?.latex ?? null,
          passageId: content?.passageId ?? null,
          imageUrl: content?.imageUrl ?? null,
          audioUrl: content?.audioUrl ?? null,
          videoUrl: content?.videoUrl ?? null,
        },
        options: optionsMap[q.questionId] ?? null,
      };
    });
  });

  // ─── POST /candidate/exams/:batchId/start — Start exam attempt ────────────────
  app.post("/:batchId/start", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const userId = request.user.sub;
    const body = (request.body as { deviceId?: string }) ?? {};

    // Verify assignment
    const [assignment] = await db
      .select()
      .from(examBatchCandidates)
      .where(
        and(
          eq(examBatchCandidates.examBatchId, batchId),
          eq(examBatchCandidates.candidateId, userId),
        ),
      )
      .limit(1);

    if (!assignment) {
      return reply.code(403).send({ error: "Not assigned to this exam batch" });
    }

    // Look up the device registration UUID if deviceId string is provided
    let deviceUuid: string | null = null;
    if (body.deviceId) {
      const [device] = await db
        .select()
        .from(deviceRegistrations)
        .where(eq(deviceRegistrations.deviceId, body.deviceId))
        .limit(1);
      deviceUuid = device?.id ?? null;
    }

    // Get batch + exam info
    const [batch] = await db
      .select({
        batchId: examBatches.id,
        batchStatus: examBatches.status,
        examId: examBatches.examId,
        examDuration: exams.durationMinutes,
      })
      .from(examBatches)
      .innerJoin(exams, eq(exams.id, examBatches.examId))
      .where(eq(examBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return reply.code(404).send({ error: "Exam batch not found" });
    }

    if (batch.batchStatus !== "active") {
      return reply.code(423).send({ error: "Exam batch is not active" });
    }

    // Check for existing attempt
    const [existingAttempt] = await db
      .select()
      .from(attempts)
      .where(
        and(
          eq(attempts.examBatchId, batchId),
          eq(attempts.candidateId, userId),
        ),
      )
      .limit(1);

    if (existingAttempt) {
      if (
        existingAttempt.status === "submitted" ||
        existingAttempt.status === "auto_submitted"
      ) {
        return reply.code(409).send({ error: "Exam already submitted" });
      }

      // Resume existing attempt
      const durationSecs = (batch.examDuration ?? 180) * 60;
      const elapsed = existingAttempt.startedAt
        ? Math.floor(
            (Date.now() - new Date(existingAttempt.startedAt).getTime()) / 1000,
          )
        : 0;
      const remaining = Math.max(0, durationSecs - elapsed);

      // Get sections
      const sections = await db
        .select()
        .from(examSections)
        .where(eq(examSections.examId, batch.examId))
        .orderBy(examSections.sectionOrder);

      return {
        attemptId: existingAttempt.id,
        examBatchId: batchId,
        status: existingAttempt.status,
        startedAt:
          existingAttempt.startedAt?.toISOString() ?? new Date().toISOString(),
        durationSeconds: durationSecs,
        remainingTimeSeconds: remaining,
        sections: sections.map((s) => ({
          id: s.id,
          name: s.name,
          sectionOrder: s.sectionOrder,
          durationMinutes: s.durationMinutes,
          questionCount: s.questionCount,
          totalMarks: s.totalMarks,
        })),
      };
    }

    // Create new attempt
    const durationSecs = (batch.examDuration ?? 180) * 60;
    const now = new Date();

    const [newAttempt] = await db
      .insert(attempts)
      .values({
        examBatchId: batchId,
        candidateId: userId,
        deviceId: deviceUuid ?? "00000000-0000-0000-0000-000000000000",
        status: "in_progress",
        startedAt: now,
        remainingTimeSecs: durationSecs,
      })
      .returning();

    // Get sections
    const sections = await db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, batch.examId))
      .orderBy(examSections.sectionOrder);

    return {
      attemptId: newAttempt.id,
      examBatchId: batchId,
      status: "in_progress",
      startedAt: now.toISOString(),
      durationSeconds: durationSecs,
      remainingTimeSeconds: durationSecs,
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        sectionOrder: s.sectionOrder,
        durationMinutes: s.durationMinutes,
        questionCount: s.questionCount,
        totalMarks: s.totalMarks,
      })),
    };
  });

  // ─── GET /candidate/exams/:batchId/manifest — Signed exam manifest ────────────
  // Per SECURITY_ARCHITECTURE.md Section 17.3
  // Note: In production, this would serve a pre-signed manifest.
  // For now, returns the manifest structure (signing deferred until Ed25519 keys are generated).
  app.get("/:batchId/manifest", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };

    // Get batch + exam info
    const [batch] = await db
      .select({
        batchId: examBatches.id,
        batchStatus: examBatches.status,
        examId: examBatches.examId,
        scheduledEnd: examBatches.scheduledEndAt,
        examName: exams.name,
        examDuration: exams.durationMinutes,
        examNavigation: exams.navigationMode,
        examShuffle: exams.shuffleQuestions,
        examShuffleOpts: exams.shuffleOptions,
      })
      .from(examBatches)
      .innerJoin(exams, eq(exams.id, examBatches.examId))
      .where(eq(examBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return reply.code(404).send({ error: "Exam batch not found" });
    }

    // Get sections
    const sections = await db
      .select()
      .from(examSections)
      .where(eq(examSections.examId, batch.examId))
      .orderBy(examSections.sectionOrder);

    const manifest = {
      manifestId: `manifest-${batchId}`,
      examId: batch.examId,
      examBatchId: batchId,
      version: 1,
      issuedAt: new Date().toISOString(),
      expiresAt:
        batch.scheduledEnd?.toISOString() ??
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      exam: {
        title: batch.examName,
        durationMinutes: batch.examDuration,
        sections: sections.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          questionCount: s.questionCount,
        })),
        markingScheme: { correct: 4, incorrect: -1, unattempted: 0 },
        navigationMode: batch.examNavigation ?? "free",
        shuffleQuestions: batch.examShuffle ?? false,
        shuffleOptions: batch.examShuffleOpts ?? false,
      },
      server: {
        endpoint: `http://${request.hostname}`,
        certificateFingerprint: "",
      },
    };

    // TODO: In production, sign manifest with Ed25519 private key
    // For now, return unsigned manifest (client will need to skip signature verification in dev mode)
    return {
      manifest,
      signature: "", // Unsigned — for development only
    };
  });
};

export default candidateExamRoutes;
