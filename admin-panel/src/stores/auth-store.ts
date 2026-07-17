import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { authService } from "../services/auth";

interface AuthUser {
  id: string;
  role: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  init: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email, password) => {
        const res = await authService.login(email, password);
        localStorage.setItem("accessToken", res.accessToken);
        localStorage.setItem("refreshToken", res.refreshToken);
        const payload = JSON.parse(atob(res.accessToken.split(".")[1]));
        set({ user: { id: payload.sub, role: payload.role }, isAuthenticated: true });
      },

      logout: async () => {
        await authService.logout();
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        set({ user: null, isAuthenticated: false });
      },

      init: () => {
        const token = localStorage.getItem("accessToken");
        if (!token) {
          set({ isLoading: false });
          return;
        }
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          const isExpired = Date.now() >= (payload.exp ?? 0) * 1000;
          if (isExpired) {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            set({ user: null, isAuthenticated: false, isLoading: false });
          } else {
            set({ user: { id: payload.sub, role: payload.role }, isAuthenticated: true, isLoading: false });
          }
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "cbe-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
