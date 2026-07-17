import type {
  DeviceDetail,
  DeviceListItem,
  DeviceStatus,
  PaginatedResponse,
  RegisterDeviceInput,
  UpdateDeviceInput,
} from "../types/index.js";
import api from "./api.js";

export const deviceService = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    centerId?: string;
    status?: DeviceStatus;
  }) =>
    api.get<unknown, PaginatedResponse<DeviceListItem>>("/devices", {
      params,
    }),

  getById: (id: string) =>
    api.get<unknown, DeviceDetail>(`/devices/${id}`),

  register: (data: RegisterDeviceInput) =>
    api.post<unknown, { id: string }>("/devices", data),

  update: (id: string, data: UpdateDeviceInput) =>
    api.put<unknown, DeviceDetail>(`/devices/${id}`, data),

  suspend: (id: string) =>
    api.post<unknown, { id: string; status: DeviceStatus }>(
      `/devices/${id}/suspend`,
    ),

  activate: (id: string) =>
    api.post<unknown, { id: string; status: DeviceStatus }>(
      `/devices/${id}/activate`,
    ),
};
