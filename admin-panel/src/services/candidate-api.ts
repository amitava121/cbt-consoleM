import axios from "axios";

const candidateApi = axios.create({
  baseURL: "/api",
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

candidateApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("candidateAccessToken");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const fp = localStorage.getItem("candidateDeviceFp");
  if (fp && config.headers) {
    config.headers["X-Device-FP"] = fp;
  }
  return config;
});

candidateApi.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("candidateAccessToken");
      localStorage.removeItem("candidateRefreshToken");
      if (!window.location.pathname.startsWith("/candidate")) {
        window.location.href = "/candidate/login";
      }
    }
    return Promise.reject(error);
  },
);

export default candidateApi;
