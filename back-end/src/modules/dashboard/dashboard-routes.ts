import { desc, eq, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { db } from "../../database/db.js";
import {
    attempts,
    candidates,
    deviceRegistrations,
    examBatches,
    exams,
    institutions,
    questions,
    subjects,
    users,
    violationReports,
} from "../../database/schemas/index.js";

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  /* ----- GET /dashboard/stats — aggregate counts ----- */
  app.get("/stats", async (_request, reply) => {
    const [
      usersResult,
      institutionsResult,
      subjectsResult,
      questionsResult,
      examsResult,
      candidatesResult,
      devicesResult,
      activeBatchesResult,
      activeAttemptsResult,
      violationsResult,
      unresolvedViolationsResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(institutions),
      db.select({ count: sql<number>`count(*)::int` }).from(subjects),
      db.select({ count: sql<number>`count(*)::int` }).from(questions),
      db.select({ count: sql<number>`count(*)::int` }).from(exams),
      db.select({ count: sql<number>`count(*)::int` }).from(candidates),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(deviceRegistrations),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(examBatches)
        .where(eq(examBatches.status, "active")),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(attempts)
        .where(eq(attempts.status, "in_progress")),
      db.select({ count: sql<number>`count(*)::int` }).from(violationReports),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(violationReports)
        .where(eq(violationReports.isResolved, false)),
    ]);

    return reply.send({
      users: usersResult[0]?.count ?? 0,
      institutions: institutionsResult[0]?.count ?? 0,
      subjects: subjectsResult[0]?.count ?? 0,
      questions: questionsResult[0]?.count ?? 0,
      exams: examsResult[0]?.count ?? 0,
      candidates: candidatesResult[0]?.count ?? 0,
      devices: devicesResult[0]?.count ?? 0,
      activeBatches: activeBatchesResult[0]?.count ?? 0,
      activeAttempts: activeAttemptsResult[0]?.count ?? 0,
      violations: violationsResult[0]?.count ?? 0,
      unresolvedViolations: unresolvedViolationsResult[0]?.count ?? 0,
    });
  });

  /* ----- GET /dashboard/recent-exams — last 5 exams ----- */
  app.get("/recent-exams", async (_request, reply) => {
    const rows = await db
      .select({
        id: exams.id,
        name: exams.name,
        code: exams.code,
        durationMinutes: exams.durationMinutes,
        totalMarks: exams.totalMarks,
        isActive: exams.isActive,
        createdAt: exams.createdAt,
        subjectName: subjects.name,
      })
      .from(exams)
      .leftJoin(subjects, eq(exams.subjectId, subjects.id))
      .orderBy(desc(exams.createdAt))
      .limit(5);

    return reply.send({ data: rows });
  });

  /* ----- GET /dashboard/recent-violations — last 5 violations ----- */
  app.get("/recent-violations", async (_request, reply) => {
    const rows = await db
      .select({
        id: violationReports.id,
        violationType: violationReports.violationType,
        severity: violationReports.severity,
        isResolved: violationReports.isResolved,
        createdAt: violationReports.createdAt,
      })
      .from(violationReports)
      .orderBy(desc(violationReports.createdAt))
      .limit(5);

    return reply.send({ data: rows });
  });

  /* ----- GET /dashboard/exam-status-breakdown — counts by batch status ----- */
  app.get("/exam-status-breakdown", async (_request, reply) => {
    const rows = await db
      .select({
        status: examBatches.status,
        count: sql<number>`count(*)::int`,
      })
      .from(examBatches)
      .groupBy(examBatches.status);

    return reply.send({ data: rows });
  });
};

export default dashboardRoutes;
