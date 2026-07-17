import type { PaginatedResponse, QuestionBank } from "../types/index.js";
import api from "./api.js";

export const questionBanksService = {
  list: (params?: { page?: number; pageSize?: number; search?: string }) =>
    api.get<unknown, PaginatedResponse<QuestionBank>>("/question-banks", {
      params,
    }),

  create: (data: { name: string; description?: string }) =>
    api.post<unknown, QuestionBank>("/question-banks", data),

  update: (
    id: string,
    data: Partial<{ name: string; description: string; isActive: boolean }>,
  ) => api.put<unknown, QuestionBank>(`/question-banks/${id}`, data),

  getQuestions: (
    bankId: string,
    params?: {
      page?: number;
      pageSize?: number;
      type?: string;
      difficulty?: string;
      isApproved?: boolean;
      search?: string;
    },
  ) =>
    api.get<unknown, PaginatedResponse<unknown>>(
      `/question-banks/${bankId}/questions`,
      { params },
    ),
};
