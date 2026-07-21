import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshPromise = axios
      .post("/api/auth/refresh", {
        refreshToken: localStorage.getItem("refreshToken"),
      })
      .then((res) => {
        const { accessToken, refreshToken } = res.data;
        localStorage.setItem("accessToken", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
        return accessToken;
      })
      .finally(() => {
        isRefreshing = false;
      });
  }
  return refreshPromise!;
}

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem("accessToken");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
      try {
        const newToken = await refreshAccessToken();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(originalRequest);
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
