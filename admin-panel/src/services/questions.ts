import type {
    CreateQuestionInput,
    PaginatedResponse,
    Question,
    QuestionVersion,
} from "../types/index.js";
import api from "./api.js";

export const questionsService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    questionBankId?: string;
    subjectId?: string;
    topicId?: string;
    type?: string;
    difficulty?: string;
    isActive?: boolean;
    isApproved?: boolean;
    search?: string;
  }) => api.get<unknown, PaginatedResponse<Question>>("/questions", { params }),

  getById: (id: string) => api.get<unknown, Question>(`/questions/${id}`),

  create: (data: CreateQuestionInput) =>
    api.post<unknown, Question>("/questions", data),

  update: (id: string, data: Partial<CreateQuestionInput>) =>
    api.put<unknown, Question>(`/questions/${id}`, data),

  deactivate: (id: string) =>
    api.delete<unknown, { message: string }>(`/questions/${id}`),

  approve: (id: string) =>
    api.post<unknown, Question>(`/questions/${id}/approve`),

  getVersions: (id: string) =>
    api.get<unknown, { data: QuestionVersion[]; total: number }>(
      `/questions/${id}/versions`,
    ),

  export: (params: {
    format: "json" | "excel" | "pdf";
    questionBankId?: string;
    subjectId?: string;
    type?: string;
    difficulty?: string;
    search?: string;
  }) =>
    api
      .get(`/questions/export`, {
        params,
        responseType: "blob",
      })
      .then((res) => res as unknown as Blob),

  import: (file: File, questionBankId: string, subjectId: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("questionBankId", questionBankId);
    formData.append("subjectId", subjectId);
    return api.post<
      unknown,
      {
        imported: number;
        failed: number;
        total: number;
        errors?: { row: number; error: string }[];
      }
    >(`/questions/import`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
