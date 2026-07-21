import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../database/db.js";
import {
    attempts,
    candidates,
    scorecards,
    scores,
    users,
} from "../../database/schemas/index.js";
import { gradeAttempt, type AttemptGradeResult } from "./grading-engine.js";

export async function gradeAndSaveAttempt(
  attemptId: string,
): Promise<AttemptGradeResult> {
  const result = await gradeAttempt(attemptId);

  const existing = await db
    .select()
    .from(scores)
    .where(eq(scores.attemptId, attemptId))
    .limit(1);

  const sectionScoresJson = result.sectionResults.map((s) => ({
    sectionId: s.sectionId,
    sectionName: s.sectionName,
    totalMarks: s.totalMarks,
    marksObtained: s.marksObtained,
    netScore: s.netScore,
    correctCount: s.correctCount,
    incorrectCount: s.incorrectCount,
    unattemptedCount: s.unattemptedCount,
  }));

  if (existing[0]) {
    await db
      .update(scores)
      .set({
        totalMarks: result.totalMarks.toFixed(2),
        marksObtained: result.marksObtained.toFixed(2),
        netScore: result.netScore.toFixed(2),
        sectionScoresJson: sectionScoresJson,
      })
      .where(eq(scores.id, existing[0].id));
  } else {
    await db.insert(scores).values({
      attemptId,
      totalMarks: result.totalMarks.toFixed(2),
      marksObtained: result.marksObtained.toFixed(2),
      netScore: result.netScore.toFixed(2),
      sectionScoresJson: sectionScoresJson,
    });
  }

  return result;
}

export async function gradeBatch(
  examBatchId: string,
): Promise<{ graded: number; failed: number; results: AttemptGradeResult[] }> {
  const batchAttempts = await db
    .select()
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

  const results: AttemptGradeResult[] = [];
  let failed = 0;

  for (const attempt of batchAttempts) {
    try {
      const result = await gradeAndSaveAttempt(attempt.id);
      results.push(result);
    } catch (err) {
      failed++;
    }
  }

  return { graded: results.length, failed, results };
}

export async function calculateRanks(
  examBatchId: string,
): Promise<{ ranked: number }> {
  const batchScores = await db
    .select({
      scoreId: scores.id,
      attemptId: scores.attemptId,
      netScore: scores.netScore,
      candidateId: attempts.candidateId,
    })
    .from(scores)
    .innerJoin(attempts, eq(scores.attemptId, attempts.id))
    .where(eq(attempts.examBatchId, examBatchId))
    .orderBy(desc(scores.netScore));

  if (batchScores.length === 0) {
    return { ranked: 0 };
  }

  const totalCandidates = batchScores.length;

  for (let i = 0; i < batchScores.length; i++) {
    const rank = i + 1;
    const percentile = ((totalCandidates - rank) / totalCandidates) * 100;
    const scoreEntry = batchScores[i];

    const existingCard = await db
      .select()
      .from(scorecards)
      .where(eq(scorecards.attemptId, scoreEntry.attemptId))
      .limit(1);

    if (existingCard[0]) {
      await db
        .update(scorecards)
        .set({
          rank,
          percentile: percentile.toFixed(3),
          totalScore: scoreEntry.netScore,
        })
        .where(eq(scorecards.id, existingCard[0].id));
    } else {
      await db.insert(scorecards).values({
        attemptId: scoreEntry.attemptId,
        candidateId: scoreEntry.candidateId,
        rank,
        percentile: percentile.toFixed(3),
        totalScore: scoreEntry.netScore,
      });
    }
  }

  return { ranked: totalCandidates };
}

export async function getBatchResults(examBatchId: string) {
  const results = await db
    .select({
      attemptId: attempts.id,
      candidateId: attempts.candidateId,
      candidateName: users.fullName,
      candidateRollNo: candidates.rollNumber,
      status: attempts.status,
      totalMarks: scores.totalMarks,
      marksObtained: scores.marksObtained,
      netScore: scores.netScore,
      rank: scorecards.rank,
      percentile: scorecards.percentile,
      sectionScoresJson: scores.sectionScoresJson,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(scores, eq(scores.attemptId, attempts.id))
    .innerJoin(candidates, eq(candidates.id, attempts.candidateId))
    .innerJoin(users, eq(users.id, candidates.userId))
    .leftJoin(scorecards, eq(scorecards.attemptId, attempts.id))
    .where(eq(attempts.examBatchId, examBatchId))
    .orderBy(desc(scores.netScore));

  return results;
}

export async function getAttemptResult(attemptId: string) {
  const scoreRows = await db
    .select()
    .from(scores)
    .where(eq(scores.attemptId, attemptId))
    .limit(1);

  if (!scoreRows[0]) {
    return null;
  }

  const scorecardRows = await db
    .select()
    .from(scorecards)
    .where(eq(scorecards.attemptId, attemptId))
    .limit(1);

  const attemptRows = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, attemptId))
    .limit(1);

  const candidateRows = await db
    .select()
    .from(candidates)
    .where(eq(candidates.id, attemptRows[0]?.candidateId ?? ""))
    .limit(1);

  return {
    score: scoreRows[0],
    scorecard: scorecardRows[0] ?? null,
    attempt: attemptRows[0] ?? null,
    candidate: candidateRows[0] ?? null,
  };
}

export async function getBatchStats(examBatchId: string) {
  const batchScores = await db
    .select({
      netScore: scores.netScore,
    })
    .from(scores)
    .innerJoin(attempts, eq(scores.attemptId, attempts.id))
    .where(eq(attempts.examBatchId, examBatchId));

  if (batchScores.length === 0) {
    return {
      totalCandidates: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      medianScore: 0,
    };
  }

  const scoresNum = batchScores.map((s) => parseFloat(s.netScore));
  const sorted = [...scoresNum].sort((a, b) => a - b);
  const total = batchScores.length;
  const sum = scoresNum.reduce((a, b) => a + b, 0);
  const avg = sum / total;
  const median =
    total % 2 === 0
      ? (sorted[total / 2 - 1] + sorted[total / 2]) / 2
      : sorted[Math.floor(total / 2)];

  return {
    totalCandidates: total,
    averageScore: parseFloat(avg.toFixed(2)),
    highestScore: sorted[total - 1],
    lowestScore: sorted[0],
    medianScore: parseFloat(median.toFixed(2)),
  };
}
