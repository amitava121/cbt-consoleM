import type {
  ActiveSessionsResponse,
  AttemptState,
} from "../types/index.js";
import api from "./api.js";

export const sessionService = {
  getActiveSessions: (examBatchId: string) =>
    api.get<unknown, ActiveSessionsResponse>("/sessions/active", {
      params: { examBatchId },
    }),

  getAttemptState: (attemptId: string) =>
    api.get<unknown, AttemptState>(`/sessions/${attemptId}/state`),

  startAttempt: (attemptId: string, deviceFingerprint?: string) =>
    api.post<unknown, unknown>(`/sessions/${attemptId}/start`, {
      attemptId,
      deviceFingerprint,
    }),

  submitAttempt: (attemptId: string) =>
    api.post<unknown, { submitted: boolean; submittedAt: number }>(
      `/sessions/${attemptId}/submit`,
    ),

  pauseAttempt: (attemptId: string, reason: string) =>
    api.post<unknown, { paused: boolean; remainingTimeSecs: number }>(
      `/sessions/${attemptId}/pause`,
      { reason },
    ),

  resumeAttempt: (attemptId: string) =>
    api.post<unknown, { resumed: boolean; remainingTimeSecs: number }>(
      `/sessions/${attemptId}/resume`,
    ),

  terminateAttempt: (attemptId: string, reason: string) =>
    api.post<unknown, { terminated: boolean; terminatedAt: number }>(
      `/sessions/${attemptId}/terminate`,
      { reason },
    ),

  saveAnswer: (
    attemptId: string,
    data: {
      questionId: string;
      answerData: unknown;
      status: string;
      timeSpentSecs: number;
      isMarkedForReview: boolean;
    },
  ) =>
    api.post<unknown, { saved: boolean; status: string; savedAt: number }>(
      `/sessions/${attemptId}/answers`,
      data,
    ),

  batchSyncAnswers: (
    attemptId: string,
    data: {
      answers: Array<{
        questionId: string;
        answerData: unknown;
        status: string;
        timeSpentSecs: number;
        isMarkedForReview: boolean;
      }>;
    },
  ) =>
    api.post<unknown, { savedCount: number; savedAt: number }>(
      `/sessions/${attemptId}/answers/batch`,
      data,
    ),

  logEvent: (
    attemptId: string,
    data: {
      eventType: string;
      eventData: unknown;
      severity: string;
      clientTimestamp?: string;
    },
  ) => api.post<unknown, { logged: boolean }>(`/sessions/${attemptId}/events`, data),

  reportViolation: (
    attemptId: string,
    data: {
      violationType: string;
      severity: string;
      description: string;
      evidenceUrl?: string;
    },
  ) => api.post<unknown, { reported: boolean }>(`/sessions/${attemptId}/violations`, data),

  getExamPaper: (attemptId: string) =>
    api.get<unknown, unknown>(`/sessions/${attemptId}/exam-paper`),
};
