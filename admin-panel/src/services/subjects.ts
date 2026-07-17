import type { PaginatedResponse, Subject, Topic } from "../types/index.js";
import api from "./api.js";

export const subjectsService = {
  list: (params?: { page?: number; pageSize?: number; search?: string }) =>
    api.get<unknown, PaginatedResponse<Subject>>("/subjects", { params }),

  create: (data: { name: string; code: string; description?: string }) =>
    api.post<unknown, Subject>("/subjects", data),

  update: (
    id: string,
    data: Partial<{
      name: string;
      code: string;
      description: string;
      isActive: boolean;
    }>,
  ) => api.put<unknown, Subject>(`/subjects/${id}`, data),

  getTopics: (subjectId: string) =>
    api.get<unknown, { data: Topic[]; total: number }>(
      `/subjects/${subjectId}/topics`,
    ),
};

export const topicsService = {
  create: (data: {
    subjectId: string;
    name: string;
    description?: string;
    parentTopicId?: string | null;
  }) => api.post<unknown, Topic>("/topics", data),

  update: (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      parentTopicId: string | null;
      isActive: boolean;
    }>,
  ) => api.put<unknown, Topic>(`/topics/${id}`, data),
};
