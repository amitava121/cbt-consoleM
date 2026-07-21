import api from "./api";

export interface SebUrlFilterRule {
  action: "block" | "allow";
  url: string;
  description?: string;
  active?: boolean;
  regex?: boolean;
}

export interface SebSettings {
  enabled: boolean;
  requireBek: boolean;
  startUrl: string;
  // General
  sebServerUrl?: string;
  quitUrl?: string;
  quitUrlConfirm?: boolean;
  quitPassword?: string;
  allowQuit?: boolean;
  ignoreExitKeys?: boolean;
  sebMode?: number;
  // UI
  showTaskBar?: boolean;
  showTime?: boolean;
  showReloadButton?: boolean;
  showInputLanguage?: boolean;
  showSideMenu?: boolean;
  showMenuBar?: boolean;
  enableBrowserWindowToolbar?: boolean;
  hideBrowserWindowToolbar?: boolean;
  browserWindowAllowAddressBar?: boolean;
  touchOptimized?: boolean;
  enableZoomText?: boolean;
  enableZoomPage?: boolean;
  zoomMode?: number;
  allowDictionaryLookup?: boolean;
  enableTouchExit?: boolean;
  oskBehavior?: number;
  allowDeveloperConsole?: boolean;
  allowSpellCheck?: boolean;
  allowSpellCheckDictionary?: boolean;
  audioMute?: boolean;
  audioControlEnabled?: boolean;
  audioVolumeLevel?: number;
  audioSetVolumeLevel?: boolean;
  batteryChargeThresholdCritical?: number;
  batteryChargeThresholdLow?: number;
  browserScreenKeyboard?: boolean;
  showQrVerifyButton?: boolean;
  allowFind?: boolean;
  allowPrint?: boolean;
  browserWindowTitleSuffix?: string;
  // Browser
  enableSebBrowser?: boolean;
  browserWindowAllowReload?: boolean;
  newBrowserWindowAllowReload?: boolean;
  showReloadWarning?: boolean;
  newBrowserWindowShowReloadWarning?: boolean;
  enablePlugIns?: boolean;
  enableJava?: boolean;
  enableJavaScript?: boolean;
  blockPopUpWindows?: boolean;
  allowVideoCapture?: boolean;
  allowAudioCapture?: boolean;
  allowBrowsingBackForward?: boolean;
  removeBrowserProfile?: boolean;
  removeLocalStorage?: boolean;
  allowPDFReaderToolbar?: boolean;
  allowPDFPlugIn?: boolean;
  newBrowserWindowByLinkPolicy?: number;
  newBrowserWindowByScriptPolicy?: number;
  newBrowserWindowByLinkBlockForeign?: boolean;
  newBrowserWindowByScriptBlockForeign?: boolean;
  newBrowserWindowShowURL?: boolean;
  browserWindowShowURL?: boolean;
  browserUserAgent?: string;
  // Downloads
  allowDownloads?: boolean;
  allowUploads?: boolean;
  allowCustomDownUploadLocation?: boolean;
  downloadDirectoryWin?: string;
  downloadDirectoryMac?: string;
  openDownloads?: boolean;
  downloadPDFFiles?: boolean;
  downloadAndOpenSebConfig?: boolean;
  backgroundOpenSebConfig?: boolean;
  useTemporaryDownUploadDirectory?: boolean;
  browserShowFileSystemElementPath?: boolean;
  chooseFileToUploadPolicy?: number;
  // Exam
  sendBrowserExamKey?: boolean;
  examSessionClearCookiesOnStart?: boolean;
  examSessionClearCookiesOnEnd?: boolean;
  browserURLSalt?: boolean;
  restartExamText?: string;
  restartExamURL?: string;
  restartExamUseStartURL?: boolean;
  restartExamPasswordProtected?: boolean;
  examSessionReconfigureAllow?: boolean;
  examSessionReconfigureConfigURL?: string;
  quitURLRestart?: boolean;
  startURLAppendQueryParameter?: string;
  // Applications
  monitorProcesses?: boolean;
  allowSwitchToApplications?: boolean;
  allowFlashFullscreen?: boolean;
  // Security
  blockScreenCapture?: boolean;
  blockScreenSharing?: boolean;
  allowWindowResize?: boolean;
  // Network
  enableURLFilter?: boolean;
  enableURLContentFilter?: boolean;
  // Processes
  blockedProcesses?: string[];
  permittedProcesses?: string[];
  // URL Filter
  urlFilterRules?: SebUrlFilterRule[];
}

export const sebService = {
  getSettings: () => api.get<unknown, SebSettings>("/seb/settings"),

  saveSettings: (data: SebSettings) =>
    api.put<unknown, { success: boolean; settings: SebSettings }>(
      "/seb/settings",
      data,
    ),
};
