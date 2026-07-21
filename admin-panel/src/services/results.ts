import api from "./api.js";

export interface BatchResultRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  candidateRollNo: string | null;
  status: string;
  totalMarks: string;
  marksObtained: string;
  netScore: string;
  rank: number | null;
  percentile: string | null;
  sectionScoresJson: unknown;
  submittedAt: string | null;
}

export interface BatchStats {
  totalCandidates: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  medianScore: number;
}

export interface AttemptResult {
  score: {
    id: string;
    attemptId: string;
    totalMarks: string;
    marksObtained: string;
    netScore: string;
    sectionScoresJson: unknown;
  };
  scorecard: {
    id: string;
    attemptId: string;
    candidateId: string;
    rank: number | null;
    percentile: string | null;
    totalScore: string;
  } | null;
  attempt: {
    id: string;
    status: string;
    submittedAt: string | null;
  } | null;
  candidate: {
    id: string;
    rollNumber: string | null;
    admitCardNumber: string | null;
  } | null;
}

export const resultsService = {
  gradeAttempt: (attemptId: string) =>
    api.post<unknown, { success: boolean; result: unknown }>(
      "/results/grade/attempt",
      {
        attemptId,
      },
    ),

  gradeBatch: (examBatchId: string) =>
    api.post<
      unknown,
      { success: boolean; graded: number; failed: number; ranked: number }
    >("/results/grade/batch", { examBatchId }),

  getBatchResults: (examBatchId: string) =>
    api.get<
      unknown,
      { success: boolean; results: BatchResultRow[]; message?: string }
    >(`/results/batch/${examBatchId}`),

  getBatchStats: (examBatchId: string) =>
    api.get<unknown, { success: boolean; stats: BatchStats }>(
      `/results/batch/${examBatchId}/stats`,
    ),

  getAttemptResult: (attemptId: string) =>
    api.get<unknown, { success: boolean } & AttemptResult>(
      `/results/attempt/${attemptId}`,
    ),

  publishResults: (examBatchId: string) =>
    api.post<unknown, { success: boolean; message: string }>(
      `/results/batch/${examBatchId}/publish`,
    ),
};
