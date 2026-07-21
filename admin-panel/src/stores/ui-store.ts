import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

export interface PageHeaderOverride {
  title: string;
  subtitle?: string;
}

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  customBreadcrumbs: BreadcrumbItem[] | null;
  setCustomBreadcrumbs: (crumbs: BreadcrumbItem[] | null) => void;
  pageHeaderOverride: PageHeaderOverride | null;
  setPageHeaderOverride: (header: PageHeaderOverride | null) => void;
}

const getInitialTheme = (): ThemeMode => {
  const saved = localStorage.getItem("cbe-theme") as ThemeMode;
  if (saved && ["dark", "light", "system"].includes(saved)) {
    return saved;
  }
  return "dark";
};

const applyThemeToDOM = (theme: ThemeMode) => {
  const root = document.documentElement;
  root.classList.remove("light", "dark");

  if (theme === "system") {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(systemDark ? "dark" : "light");
  } else {
    root.classList.add(theme);
  }
};

// Initial theme application on load
const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme);

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  theme: initialTheme,
  setTheme: (theme: ThemeMode) => {
    localStorage.setItem("cbe-theme", theme);
    applyThemeToDOM(theme);
    set({ theme });
  },
  customBreadcrumbs: null,
  setCustomBreadcrumbs: (customBreadcrumbs) => set({ customBreadcrumbs }),
  pageHeaderOverride: null,
  setPageHeaderOverride: (pageHeaderOverride) => set({ pageHeaderOverride }),
}));


