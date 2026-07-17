import type {
  AddExamQuestionsInput,
  CreateExamInput,
  CreateSectionInput,
  Exam,
  ExamSection,
  PaginatedResponse,
  UpdateExamInput,
} from "../types/index.js";
import api from "./api.js";

export const examsService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }) =>
    api.get<unknown, PaginatedResponse<Exam>>("/exams", { params }),

  getById: (id: string) => api.get<unknown, Exam>(`/exams/${id}`),

  create: (data: CreateExamInput) => api.post<unknown, Exam>("/exams", data),

  update: (id: string, data: UpdateExamInput) =>
    api.put<unknown, Exam>(`/exams/${id}`, data),

  deactivate: (id: string) =>
    api.delete<unknown, { message: string }>(`/exams/${id}`),

  /* ----- Sections ----- */
  addSection: (examId: string, data: CreateSectionInput) =>
    api.post<unknown, ExamSection>(`/exams/${examId}/sections`, data),

  updateSection: (
    examId: string,
    sectionId: string,
    data: Partial<CreateSectionInput>,
  ) => api.put<unknown, ExamSection>(`/exams/${examId}/sections/${sectionId}`, data),

  removeSection: (examId: string, sectionId: string) =>
    api.delete<unknown, { message: string }>(
      `/exams/${examId}/sections/${sectionId}`,
    ),

  /* ----- Exam Questions ----- */
  addQuestions: (
    examId: string,
    sectionId: string,
    data: AddExamQuestionsInput,
  ) =>
    api.post<unknown, { message: string; added: number }>(
      `/exams/${examId}/sections/${sectionId}/questions`,
      data,
    ),

  removeQuestion: (
    examId: string,
    sectionId: string,
    eqId: string,
  ) =>
    api.delete<unknown, { message: string }>(
      `/exams/${examId}/sections/${sectionId}/questions/${eqId}`,
    ),
};
