import type {
    AssignCandidatesInput,
    CheckConflictsResponse,
    CreateExamBatchInput,
    ExamBatch,
    ExamBatchAttempt,
    ExamBatchCandidate,
    ExamBatchDetail,
    ExamBatchListItem,
    ExamBatchMonitor,
    PaginatedResponse,
    UpdateExamBatchInput,
} from "../types/index.js";
import api from "./api.js";

export const examBatchService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    examId?: string;
    status?: string;
  }) =>
    api.get<unknown, PaginatedResponse<ExamBatchListItem>>("/exam-batches", {
      params,
    }),

  getById: (id: string) =>
    api.get<unknown, ExamBatchDetail>(`/exam-batches/${id}`),

  create: (data: CreateExamBatchInput) =>
    api.post<unknown, ExamBatch>("/exam-batches", data),

  update: (id: string, data: UpdateExamBatchInput) =>
    api.put<unknown, ExamBatch>(`/exam-batches/${id}`, data),

  /* ----- Lifecycle ----- */
  schedule: (id: string) =>
    api.post<unknown, ExamBatch>(`/exam-batches/${id}/schedule`),
  publish: (id: string) =>
    api.post<unknown, ExamBatch>(`/exam-batches/${id}/publish`),
  activate: (id: string) =>
    api.post<unknown, ExamBatch>(`/exam-batches/${id}/activate`),
  pause: (id: string) =>
    api.post<unknown, ExamBatch>(`/exam-batches/${id}/pause`),
  resume: (id: string) =>
    api.post<unknown, ExamBatch>(`/exam-batches/${id}/resume`),
  finish: (id: string) =>
    api.post<unknown, ExamBatch>(`/exam-batches/${id}/finish`),
  publishResults: (id: string) =>
    api.post<unknown, ExamBatch>(`/exam-batches/${id}/publish-results`),

  /* ----- Candidates ----- */
  assignCandidates: (id: string, data: AssignCandidatesInput) =>
    api.post<unknown, { message: string; added: number; skipped: number }>(
      `/exam-batches/${id}/candidates`,
      data,
    ),

  checkConflicts: (id: string, data: AssignCandidatesInput) =>
    api.post<unknown, CheckConflictsResponse>(
      `/exam-batches/${id}/candidates/check-conflicts`,
      data,
    ),

  removeCandidates: (id: string, data: AssignCandidatesInput) =>
    api.delete<unknown, { message: string; removed: number }>(
      `/exam-batches/${id}/candidates`,
      { data },
    ),

  listCandidates: (id: string) =>
    api.get<unknown, { data: ExamBatchCandidate[]; total: number }>(
      `/exam-batches/${id}/candidates`,
    ),

  /* ----- Attempts ----- */
  listAttempts: (id: string) =>
    api.get<unknown, { data: ExamBatchAttempt[]; total: number }>(
      `/exam-batches/${id}/attempts`,
    ),

  /* ----- Monitor ----- */
  monitor: (id: string) =>
    api.get<unknown, ExamBatchMonitor>(`/exam-batches/${id}/monitor`),
};
