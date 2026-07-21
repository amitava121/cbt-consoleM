import api from "./api";

export interface SebSettings {
  enabled: boolean;
  requireBek: boolean;
  startUrl: string;
  quitUrl: string;
  quitPassword?: string;
  allowQuit: boolean;
  allowReload: boolean;
  showTime: boolean;
  showKeyboardLayout: boolean;
  allowSpellCheck: boolean;
  allowZoom: boolean;
  blockScreenCapture: boolean;
  blockScreenSharing: boolean;
  allowDeveloperConsole: boolean;
  muteAudio: boolean;
  allowWindowResize: boolean;
  blockedProcesses: string[];
  urlFilterRules: { action: "block" | "allow"; url: string; description?: string }[];
}

export const sebService = {
  getSettings: () =>
    api.get<unknown, SebSettings>("/seb/settings"),

  saveSettings: (data: SebSettings) =>
    api.put<unknown, { success: boolean; settings: SebSettings }>("/seb/settings", data),
};
