import { createHash, randomBytes } from "node:crypto";

/**
 * SEB Config Generator
 *
 * Generates Safe Exam Browser configuration in plist XML format.
 * The .seb file is a plist that SEB reads to configure lockdown settings.
 *
 * Reference: https://safeexambrowser.org/developer/seb-config-key.html
 * Full key list: SEB-Specification-ConfigKeys.pdf
 */

export interface SebConfigOptions {
  examBatchId: string;
  examName: string;
  startUrl: string;
  // ─── General ───
  sebServerUrl?: string;
  quitUrl?: string;
  quitUrlConfirm?: boolean;
  quitPassword?: string;
  allowQuit?: boolean;
  ignoreExitKeys?: boolean;
  sebMode?: number; // 0 = kiosk, 1 = browser
  // ─── User Interface ───
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
  zoomMode?: number; // 0 = useConfig, 1 = always
  allowDictionaryLookup?: boolean;
  enableTouchExit?: boolean;
  oskBehavior?: number; // 0 = none, 1 = allow, 2 = force
  allowDeveloperConsole?: boolean;
  allowSpellCheck?: boolean;
  allowSpellCheckDictionary?: boolean;
  audioMute?: boolean;
  audioControlEnabled?: boolean;
  audioVolumeLevel?: number; // 0-100
  audioSetVolumeLevel?: boolean;
  batteryChargeThresholdCritical?: number;
  batteryChargeThresholdLow?: number;
  browserScreenKeyboard?: boolean;
  showQrVerifyButton?: boolean;
  allowFind?: boolean;
  allowPrint?: boolean;
  browserWindowTitleSuffix?: string;
  // ─── Browser ───
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
  newBrowserWindowByLinkPolicy?: number; // 0 = open, 1 = block, 2 = openSame
  newBrowserWindowByScriptPolicy?: number;
  newBrowserWindowByLinkBlockForeign?: boolean;
  newBrowserWindowByScriptBlockForeign?: boolean;
  newBrowserWindowShowURL?: boolean;
  browserWindowShowURL?: boolean;
  browserUserAgent?: string;
  // ─── Downloads/Uploads ───
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
  chooseFileToUploadPolicy?: number; // 0 = allow, 1 = block
  // ─── Exam ───
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
  // ─── Applications ───
  monitorProcesses?: boolean;
  allowSwitchToApplications?: boolean;
  allowFlashFullscreen?: boolean;
  // ─── Security ───
  blockScreenCapture?: boolean;
  blockScreenSharing?: boolean;
  allowWindowResize?: boolean;
  // ─── Network ───
  enableURLFilter?: boolean;
  enableURLContentFilter?: boolean;
  // ─── Process blocking ───
  blockedProcesses?: string[];
  permittedProcesses?: string[];
  // ─── URL Filter ───
  urlFilterRules?: SebUrlFilterRule[];
}

export interface SebUrlFilterRule {
  action: "block" | "allow";
  url: string;
  description?: string;
  active?: boolean;
  regex?: boolean;
}

/**
 * Generates a Browser Exam Key (BEK) hash from the config.
 */
export function generateBrowserExamKey(config: SebConfigOptions): string {
  const data = `${config.examBatchId}:${config.startUrl}:${config.examName}`;
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Generates the SEB config as a plist XML string.
 */
export function generateSebConfig(options: SebConfigOptions): string {
  const o = options;
  const examKey = generateBrowserExamKey(options);
  const sessionId = randomBytes(16).toString("hex");

  const bool = (v: boolean | undefined, d: boolean): string =>
    `<${(v ?? d) ? "true" : "false"}/>`;

  const blockedProcessXml = (o.blockedProcesses ?? [])
    .map((p) => `        <dict>
          <key>active</key><true/>
          <key>executable</key><string>${esc(p)}</string>
          <key>originalName</key><string>${esc(p)}</string>
          <key>os</key><integer>1</integer>
          <key>strongKill</key><true/>
        </dict>`)
    .join("\n");

  const permittedProcessXml = (o.permittedProcesses ?? [])
    .map((p) => `        <dict>
          <key>active</key><true/>
          <key>executable</key><string>${esc(p)}</string>
          <key>originalName</key><string>${esc(p)}</string>
          <key>os</key><integer>1</integer>
          <key>autostart</key><true/>
        </dict>`)
    .join("\n");

  const urlFilterXml = (o.urlFilterRules ?? [])
    .map((r) => `        <dict>
          <key>action</key><string>${r.action}</string>
          <key>active</key><${r.active !== false ? "true" : "false"}/>
          <key>expression</key><string>${esc(r.url)}</string>
          <key>regex</key><${r.regex ? "true" : "false"}/>
        </dict>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>sebConfigSource</key><string>configFile</string>
    <key>sebConfigFormat</key><string>xml</string>
    <key>originatorVersion</key><string>CBE Console</string>

    <!-- General -->
    <key>startURL</key><string>${esc(o.startUrl)}</string>
    <key>startResource</key><string></string>
    <key>sebServerURL</key><string>${esc(o.sebServerUrl ?? "")}</string>
    <key>sebMode</key><integer>${o.sebMode ?? 0}</integer>
    <key>allowQuit</key>${bool(o.allowQuit, true)}
    <key>ignoreExitKeys</key>${bool(o.ignoreExitKeys, true)}
    <key>quitURL</key><string>${esc(o.quitUrl ?? "")}</string>
    <key>quitURLConfirm</key>${bool(o.quitUrlConfirm, true)}
    <key>quitURLRestart</key>${bool(o.quitURLRestart, false)}
    <key>hashedQuitPassword</key><string>${o.quitPassword ? createHash("sha256").update(o.quitPassword).digest("hex") : ""}</string>
    <key>startURLAppendQueryParameter</key><string>${esc(o.startURLAppendQueryParameter ?? "")}</string>

    <!-- Exam -->
    <key>sendBrowserExamKey</key>${bool(o.sendBrowserExamKey, true)}
    <key>browserExamKey</key><string>${examKey}</string>
    <key>browserURLSalt</key>${bool(o.browserURLSalt, true)}
    <key>examSessionClearCookiesOnStart</key>${bool(o.examSessionClearCookiesOnStart, true)}
    <key>examSessionClearCookiesOnEnd</key>${bool(o.examSessionClearCookiesOnEnd, true)}
    <key>examSessionReconfigureAllow</key>${bool(o.examSessionReconfigureAllow, false)}
    <key>examSessionReconfigureConfigURL</key><string>${esc(o.examSessionReconfigureConfigURL ?? "")}</string>
    <key>restartExamText</key><string>${esc(o.restartExamText ?? "")}</string>
    <key>restartExamURL</key><string>${esc(o.restartExamURL ?? "")}</string>
    <key>restartExamUseStartURL</key>${bool(o.restartExamUseStartURL, false)}
    <key>restartExamPasswordProtected</key>${bool(o.restartExamPasswordProtected, false)}
    <key>examKey</key><string>${examKey}</string>
    <key>examBatchId</key><string>${esc(o.examBatchId)}</string>
    <key>examName</key><string>${esc(o.examName)}</string>
    <key>sessionId</key><string>${sessionId}</string>

    <!-- User Interface -->
    <key>browserViewMode</key><integer>0</integer>
    <key>showTaskBar</key>${bool(o.showTaskBar, true)}
    <key>showTime</key>${bool(o.showTime, true)}
    <key>showReloadButton</key>${bool(o.showReloadButton, true)}
    <key>showInputLanguage</key>${bool(o.showInputLanguage, false)}
    <key>showSideMenu</key>${bool(o.showSideMenu, false)}
    <key>showMenuBar</key>${bool(o.showMenuBar, false)}
    <key>enableBrowserWindowToolbar</key>${bool(o.enableBrowserWindowToolbar, false)}
    <key>hideBrowserWindowToolbar</key>${bool(o.hideBrowserWindowToolbar, false)}
    <key>browserWindowAllowAddressBar</key>${bool(o.browserWindowAllowAddressBar, false)}
    <key>touchOptimized</key>${bool(o.touchOptimized, false)}
    <key>enableZoomText</key>${bool(o.enableZoomText, false)}
    <key>enableZoomPage</key>${bool(o.enableZoomPage, true)}
    <key>zoomMode</key><integer>${o.zoomMode ?? 0}</integer>
    <key>allowDictionaryLookup</key>${bool(o.allowDictionaryLookup, false)}
    <key>enableTouchExit</key>${bool(o.enableTouchExit, false)}
    <key>oskBehavior</key><integer>${o.oskBehavior ?? 0}</integer>
    <key>allowDeveloperConsole</key>${bool(o.allowDeveloperConsole, false)}
    <key>allowSpellCheck</key>${bool(o.allowSpellCheck, false)}
    <key>allowSpellCheckDictionary</key>${bool(o.allowSpellCheckDictionary, false)}
    <key>audioMute</key>${bool(o.audioMute, false)}
    <key>audioControlEnabled</key>${bool(o.audioControlEnabled, false)}
    <key>audioVolumeLevel</key><integer>${o.audioVolumeLevel ?? 25}</integer>
    <key>audioSetVolumeLevel</key>${bool(o.audioSetVolumeLevel, false)}
    <key>batteryChargeThresholdCritical</key><integer>${o.batteryChargeThresholdCritical ?? 0}</integer>
    <key>batteryChargeThresholdLow</key><integer>${o.batteryChargeThresholdLow ?? 0}</integer>
    <key>browserScreenKeyboard</key>${bool(o.browserScreenKeyboard, false)}
    <key>showQRVerifyButton</key>${bool(o.showQrVerifyButton, false)}
    <key>allowFind</key>${bool(o.allowFind, false)}
    <key>allowPrint</key>${bool(o.allowPrint, false)}
    <key>browserWindowTitleSuffix</key><string>${esc(o.browserWindowTitleSuffix ?? "")}</string>

    <!-- Browser -->
    <key>enableSebBrowser</key>${bool(o.enableSebBrowser, true)}
    <key>browserWindowAllowReload</key>${bool(o.browserWindowAllowReload, false)}
    <key>newBrowserWindowAllowReload</key>${bool(o.newBrowserWindowAllowReload, false)}
    <key>showReloadWarning</key>${bool(o.showReloadWarning, true)}
    <key>newBrowserWindowShowReloadWarning</key>${bool(o.newBrowserWindowShowReloadWarning, true)}
    <key>enablePlugIns</key>${bool(o.enablePlugIns, false)}
    <key>enableJava</key>${bool(o.enableJava, false)}
    <key>enableJavaScript</key>${bool(o.enableJavaScript, true)}
    <key>blockPopUpWindows</key>${bool(o.blockPopUpWindows, true)}
    <key>allowVideoCapture</key>${bool(o.allowVideoCapture, false)}
    <key>allowAudioCapture</key>${bool(o.allowAudioCapture, false)}
    <key>allowBrowsingBackForward</key>${bool(o.allowBrowsingBackForward, false)}
    <key>removeBrowserProfile</key>${bool(o.removeBrowserProfile, false)}
    <key>removeLocalStorage</key>${bool(o.removeLocalStorage, false)}
    <key>allowPDFReaderToolbar</key>${bool(o.allowPDFReaderToolbar, false)}
    <key>allowPDFPlugIn</key>${bool(o.allowPDFPlugIn, false)}
    <key>newBrowserWindowByLinkPolicy</key><integer>${o.newBrowserWindowByLinkPolicy ?? 2}</integer>
    <key>newBrowserWindowByScriptPolicy</key><integer>${o.newBrowserWindowByScriptPolicy ?? 2}</integer>
    <key>newBrowserWindowByLinkBlockForeign</key>${bool(o.newBrowserWindowByLinkBlockForeign, false)}
    <key>newBrowserWindowByScriptBlockForeign</key>${bool(o.newBrowserWindowByScriptBlockForeign, false)}
    <key>newBrowserWindowShowURL</key>${bool(o.newBrowserWindowShowURL, false)}
    <key>browserWindowShowURL</key>${bool(o.browserWindowShowURL, false)}
    <key>browserUserAgent</key><string>${esc(o.browserUserAgent ?? "")}</string>

    <!-- Downloads / Uploads -->
    <key>allowDownloads</key>${bool(o.allowDownloads, false)}
    <key>allowUploads</key>${bool(o.allowUploads, false)}
    <key>allowCustomDownUploadLocation</key>${bool(o.allowCustomDownUploadLocation, false)}
    <key>downloadDirectoryWin</key><string>${esc(o.downloadDirectoryWin ?? "")}</string>
    <key>downloadDirectoryOSX</key><string>${esc(o.downloadDirectoryMac ?? "")}</string>
    <key>openDownloads</key>${bool(o.openDownloads, false)}
    <key>downloadPDFFiles</key>${bool(o.downloadPDFFiles, false)}
    <key>downloadAndOpenSebConfig</key>${bool(o.downloadAndOpenSebConfig, false)}
    <key>backgroundOpenSEBConfig</key>${bool(o.backgroundOpenSebConfig, false)}
    <key>useTemporaryDownUploadDirectory</key>${bool(o.useTemporaryDownUploadDirectory, false)}
    <key>browserShowFileSystemElementPath</key>${bool(o.browserShowFileSystemElementPath, false)}
    <key>chooseFileToUploadPolicy</key><integer>${o.chooseFileToUploadPolicy ?? 0}</integer>

    <!-- Applications -->
    <key>monitorProcesses</key>${bool(o.monitorProcesses, true)}
    <key>allowSwitchToApplications</key>${bool(o.allowSwitchToApplications, false)}
    <key>allowFlashFullscreen</key>${bool(o.allowFlashFullscreen, false)}
    <key>allowWindowResize</key>${bool(o.allowWindowResize, false)}

    <!-- Security -->
    <key>blockScreenCapture</key>${bool(o.blockScreenCapture, true)}
    <key>blockScreenSharing</key>${bool(o.blockScreenSharing, true)}
    <key>insideSebEnablePrint</key>${bool(o.allowPrint, false)}
    <key>insideSebEnablePrintScreen</key><false/>
    <key>allowFlash</key><false/>
    <key>allowUserAppFolder</key><false/>
    <key>allowExternalDisplays</key><false/>
    <key>displayScalingPolicy</key><integer>0</integer>
    <key>desktopPolicy</key><integer>0</integer>

    <!-- Network -->
    <key>enableURLFilter</key>${bool(o.enableURLFilter, false)}
    <key>enableURLContentFilter</key>${bool(o.enableURLContentFilter, false)}
    <key>URLFilterEnable</key>${bool(o.enableURLFilter, false)}
    <key>URLFilterEnableContentFilter</key>${bool(o.enableURLContentFilter, false)}

    <!-- Prohibited Processes -->
    <key>prohibitedProcesses</key>
    <array>
${blockedProcessXml || "        <dict/>"}
    </array>

    <!-- Permitted Processes -->
    <key>permittedProcesses</key>
    <array>
${permittedProcessXml || "        <dict/>"}
    </array>

    <!-- URL Filter Rules -->
    <key>URLFilterRules</key>
    <array>
${urlFilterXml || "        <dict/>"}
    </array>
  </dict>
</plist>`;
}

/**
 * Generates the seb:// launch URL.
 */
export function generateSebLaunchUrl(
  configUrl: string,
  startUrl?: string,
): string {
  const base = `seb://${configUrl}`;
  if (startUrl) {
    return `${base}?starturl=${encodeURIComponent(startUrl)}`;
  }
  return base;
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Default SEB settings — most restrictive/safe defaults.
 */
export const DEFAULT_SEB_SETTINGS: Record<string, unknown> = {
  enabled: false,
  requireBek: true,
  sebServerUrl: "",
  quitUrl: "",
  quitUrlConfirm: true,
  quitPassword: "",
  allowQuit: true,
  ignoreExitKeys: true,
  sebMode: 0,
  showTaskBar: true,
  showTime: true,
  showReloadButton: true,
  showInputLanguage: false,
  showSideMenu: false,
  showMenuBar: false,
  enableBrowserWindowToolbar: false,
  hideBrowserWindowToolbar: false,
  browserWindowAllowAddressBar: false,
  touchOptimized: false,
  enableZoomText: false,
  enableZoomPage: true,
  zoomMode: 0,
  allowDictionaryLookup: false,
  enableTouchExit: false,
  oskBehavior: 0,
  allowDeveloperConsole: false,
  allowSpellCheck: false,
  allowSpellCheckDictionary: false,
  audioMute: false,
  audioControlEnabled: false,
  audioVolumeLevel: 25,
  audioSetVolumeLevel: false,
  batteryChargeThresholdCritical: 0,
  batteryChargeThresholdLow: 0,
  browserScreenKeyboard: false,
  showQrVerifyButton: false,
  allowFind: false,
  allowPrint: false,
  browserWindowTitleSuffix: "",
  enableSebBrowser: true,
  browserWindowAllowReload: false,
  newBrowserWindowAllowReload: false,
  showReloadWarning: true,
  newBrowserWindowShowReloadWarning: true,
  enablePlugIns: false,
  enableJava: false,
  enableJavaScript: true,
  blockPopUpWindows: true,
  allowVideoCapture: false,
  allowAudioCapture: false,
  allowBrowsingBackForward: false,
  removeBrowserProfile: false,
  removeLocalStorage: false,
  allowPDFReaderToolbar: false,
  allowPDFPlugIn: false,
  newBrowserWindowByLinkPolicy: 2,
  newBrowserWindowByScriptPolicy: 2,
  newBrowserWindowByLinkBlockForeign: false,
  newBrowserWindowByScriptBlockForeign: false,
  newBrowserWindowShowURL: false,
  browserWindowShowURL: false,
  browserUserAgent: "",
  allowDownloads: false,
  allowUploads: false,
  allowCustomDownUploadLocation: false,
  downloadDirectoryWin: "",
  downloadDirectoryMac: "",
  openDownloads: false,
  downloadPDFFiles: false,
  downloadAndOpenSebConfig: false,
  backgroundOpenSebConfig: false,
  useTemporaryDownUploadDirectory: false,
  browserShowFileSystemElementPath: false,
  chooseFileToUploadPolicy: 0,
  sendBrowserExamKey: true,
  examSessionClearCookiesOnStart: true,
  examSessionClearCookiesOnEnd: true,
  browserURLSalt: true,
  restartExamText: "",
  restartExamURL: "",
  restartExamUseStartURL: false,
  restartExamPasswordProtected: false,
  examSessionReconfigureAllow: false,
  examSessionReconfigureConfigURL: "",
  quitURLRestart: false,
  startURLAppendQueryParameter: "",
  monitorProcesses: true,
  allowSwitchToApplications: false,
  allowFlashFullscreen: false,
  blockScreenCapture: true,
  blockScreenSharing: true,
  allowWindowResize: false,
  enableURLFilter: false,
  enableURLContentFilter: false,
  blockedProcesses: [
    "TeamViewer", "AnyDesk", "Chrome Remote Desktop",
    "Skype", "Zoom", "Discord", "Snipping Tool", "OBS Studio",
  ],
  permittedProcesses: [],
  urlFilterRules: [
    { action: "allow", url: "localhost", description: "Allow backend API" },
    { action: "allow", url: "127.0.0.1", description: "Allow local backend" },
  ],
};
