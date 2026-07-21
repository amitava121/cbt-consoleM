import type {
    CreateUserInput,
    UpdateUserInput,
    User,
    UserListResponse,
} from "../types";
import api from "./api";

export const usersService = {
  list: (params: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: string;
    excludeRole?: string;
  }) => api.get<unknown, UserListResponse>("/users", { params }),

  getById: (id: string) => api.get<unknown, User>(`/users/${id}`),

  create: (data: CreateUserInput) => api.post<unknown, User>("/users", data),

  update: (id: string, data: UpdateUserInput) =>
    api.patch<unknown, User>(`/users/${id}`, data),

  delete: (id: string) => api.delete(`/users/${id}`),
};
