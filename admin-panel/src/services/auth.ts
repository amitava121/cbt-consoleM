import api from "./api";
import type { LoginResponse } from "../types";

export const authService = {
  login: (email: string, password: string) =>
    api.post<unknown, LoginResponse>("/auth/login", { email, password }),

  logout: () => {
    const token = localStorage.getItem("accessToken");
    if (token) {
      return api.post("/auth/logout").catch(() => undefined);
    }
    return Promise.resolve();
  },

  getMe: () => {
    const token = localStorage.getItem("accessToken");
    if (!token) return Promise.resolve(null);
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Promise.resolve({
      id: payload.sub,
      role: payload.role,
    });
  },
};
