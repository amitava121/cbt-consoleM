import type {
    Batch,
    CreateBatchInput,
    CreateInstitutionInput,
    Institution,
    PaginatedResponse,
    UpdateBatchInput,
    UpdateInstitutionInput,
} from "../types";
import api from "./api";

export const institutionsService = {
  list: (params: { page?: number; pageSize?: number; search?: string }) =>
    api.get<unknown, PaginatedResponse<Institution>>("/institutions", {
      params,
    }),

  create: (data: CreateInstitutionInput) =>
    api.post<unknown, Institution>("/institutions", data),

  update: (id: string, data: UpdateInstitutionInput) =>
    api.put<unknown, Institution>(`/institutions/${id}`, data),

  delete: (id: string) => api.delete(`/institutions/${id}`),
};

export const batchesService = {
  list: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    institutionId?: string;
  }) => api.get<unknown, PaginatedResponse<Batch>>("/batches", { params }),

  create: (data: CreateBatchInput) =>
    api.post<unknown, Batch>("/batches", data),

  update: (id: string, data: UpdateBatchInput) =>
    api.put<unknown, Batch>(`/batches/${id}`, data),

  delete: (id: string) => api.delete(`/batches/${id}`),
};
