import api from "./api";
import type {
  Institution,
  CreateInstitutionInput,
  UpdateInstitutionInput,
  Center,
  CreateCenterInput,
  UpdateCenterInput,
  Batch,
  CreateBatchInput,
  UpdateBatchInput,
  PaginatedResponse,
} from "../types";

export const institutionsService = {
  list: (params: { page?: number; pageSize?: number; search?: string }) =>
    api.get<unknown, PaginatedResponse<Institution>>("/institutions", { params }),

  create: (data: CreateInstitutionInput) =>
    api.post<unknown, Institution>("/institutions", data),

  update: (id: string, data: UpdateInstitutionInput) =>
    api.put<unknown, Institution>(`/institutions/${id}`, data),

  delete: (id: string) =>
    api.delete(`/institutions/${id}`),
};

export const centersService = {
  list: (params: { page?: number; pageSize?: number; search?: string; institutionId?: string }) =>
    api.get<unknown, PaginatedResponse<Center>>("/centers", { params }),

  create: (data: CreateCenterInput) =>
    api.post<unknown, Center>("/centers", data),

  update: (id: string, data: UpdateCenterInput) =>
    api.put<unknown, Center>(`/centers/${id}`, data),

  getBatches: (id: string) =>
    api.get<unknown, { data: Batch[]; total: number }>(`/centers/${id}/batches`),
};

export const batchesService = {
  list: (params: { page?: number; pageSize?: number; search?: string; centerId?: string }) =>
    api.get<unknown, PaginatedResponse<Batch>>("/batches", { params }),

  create: (data: CreateBatchInput) =>
    api.post<unknown, Batch>("/batches", data),

  update: (id: string, data: UpdateBatchInput) =>
    api.put<unknown, Batch>(`/batches/${id}`, data),
};
