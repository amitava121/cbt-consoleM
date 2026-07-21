import { createHash, randomBytes } from "node:crypto";

/**
 * SEB Config Generator
 *
 * Generates Safe Exam Browser configuration in plist XML format.
 * The .seb file is a plist that SEB reads to configure lockdown settings.
 *
 * Reference: https://safeexambrowser.org/developer/seb-config.html
 */

export interface SebConfigOptions {
  examBatchId: string;
  examName: string;
  startUrl: string;
  quitUrl?: string;
  examKey?: string;
  // Lockdown settings
  allowQuit?: boolean;
  quitPassword?: string;
  allowReload?: boolean;
  showTime?: boolean;
  showKeyboardLayout?: boolean;
  allowSpellCheck?: boolean;
  allowZoom?: boolean;
  blockScreenCapture?: boolean;
  blockScreenSharing?: boolean;
  allowDeveloperConsole?: boolean;
  muteAudio?: boolean;
  allowWindowResize?: boolean;
  // Process blocking
  blockedProcesses?: string[];
  allowedBrowserExtensions?: string[];
  // Network
  urlFilterRules?: SebUrlFilterRule[];
}

export interface SebUrlFilterRule {
  action: "block" | "allow";
  url: string;
  description?: string;
}

/**
 * Generates a Browser Exam Key (BEK) hash from the config.
 * This is a SHA-256 hash that SEB sends as the `X-Safeexambrowser-Requesthash` header.
 * The server can verify this to ensure the request comes from SEB.
 */
export function generateBrowserExamKey(config: SebConfigOptions): string {
  const data = `${config.examBatchId}:${config.startUrl}:${config.examKey ?? ""}`;
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Generates the SEB config as a plist XML string.
 * This is the format SEB expects for .seb files.
 */
export function generateSebConfig(options: SebConfigOptions): string {
  const {
    examBatchId,
    examName,
    startUrl,
    quitUrl = "",
    examKey = generateBrowserExamKey(options),
    allowQuit = true,
    quitPassword = "",
    allowReload = false,
    showTime = true,
    showKeyboardLayout = false,
    allowSpellCheck = false,
    allowZoom = true,
    blockScreenCapture = true,
    blockScreenSharing = true,
    allowDeveloperConsole = false,
    muteAudio = false,
    allowWindowResize = false,
    blockedProcesses = [],
    allowedBrowserExtensions = [],
    urlFilterRules = [],
  } = options;

  const sessionId = randomBytes(16).toString("hex");

  const blockedProcessXml = blockedProcesses
    .map(
      (p) =>
        `        <dict>
          <key>active</key>
          <true/>
          <key>executable</key>
          <string>${escapeXml(p)}</string>
          <key>originalName</key>
          <string>${escapeXml(p)}</string>
        </dict>`,
    )
    .join("\n");

  const urlFilterXml = urlFilterRules
    .map(
      (rule) =>
        `        <dict>
          <key>action</key>
          <string>${rule.action}</string>
          <key>active</key>
          <true/>
          <key>expression</key>
          <string>${escapeXml(rule.url)}</string>
          <key>description</key>
          <string>${escapeXml(rule.description ?? "")}</string>
        </dict>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>sebConfigSource</key>
    <string>configFile</string>
    <key>sebConfigFormat</key>
    <string>xml</string>
    <key>originatorVersion</key>
    <string>CBE Console</string>
    <key>startURL</key>
    <string>${escapeXml(startUrl)}</string>
    <key>startResource</key>
    <string></string>
    <key>examSessionClearCookiesOnStart</key>
    <true/>
    <key>examSessionClearCookiesOnEnd</key>
    <true/>
    <key>allowQuit</key>
    <${allowQuit}/>
    <key>quitURL</key>
    <string>${escapeXml(quitUrl)}</string>
    <key>quitURLConfirm</key>
    <true/>
    <key>quitPasswordHash</key>
    <string>${quitPassword ? createHash("sha256").update(quitPassword).digest("hex") : ""}</string>
    <key>examKey</key>
    <string>${examKey}</string>
    <key>examBatchId</key>
    <string>${examBatchId}</string>
    <key>examName</key>
    <string>${escapeXml(examName)}</string>
    <key>sessionId</key>
    <string>${sessionId}</string>
    <key>sebMode</key>
    <string>0</string>
    <key>allowReload</key>
    <${allowReload}/>
    <key>showTime</key>
    <${showTime}/>
    <key>showKeyboardLayout</key>
    <${showKeyboardLayout}/>
    <key>allowSpellCheck</key>
    <${allowSpellCheck}/>
    <key>allowZoom</key>
    <${allowZoom}/>
    <key>allowWindowResize</key>
    <${allowWindowResize}/>
    <key>blockScreenCapture</key>
    <${blockScreenCapture}/>
    <key>blockScreenSharing</key>
    <${blockScreenSharing}/>
    <key>allowDeveloperConsole</key>
    <${allowDeveloperConsole}/>
    <key>muteAudio</key>
    <${muteAudio}/>
    <key>browserViewMode</key>
    <integer>0</integer>
    <key>newBrowserWindowByLinkPolicy</key>
    <integer>2</integer>
    <key>newBrowserWindowByScriptPolicy</key>
    <integer>2</integer>
    <key>browserWindowAllowReload</key>
    <${allowReload}/>
    <key>blockedProcesses</key>
    <array>
${blockedProcessXml || "        <dict/>"}
    </array>
    <key>allowedBrowserExtensions</key>
    <array>
${allowedBrowserExtensions.map((e) => `        <string>${escapeXml(e)}</string>`).join("\n") || "        <string/>"}
    </array>
    <key>urlFilterRules</key>
    <array>
${urlFilterXml || "        <dict/>"}
    </array>
    <key>downloadAndOpen</key>
    <false/>
    <key>openDownloads</key>
    <false/>
    <key>desktopPolicy</key>
    <integer>0</integer>
    <key>touchOptimized</key>
    <false/>
    <key>audioMute</key>
    <${muteAudio}/>
    <key>allowFlash</key>
    <false/>
    <key>allowJava</key>
    <false/>
    <key>allowPlugins</key>
    <false/>
    <key>allowPopUps</key>
    <false/>
    <key>allowUserAppFolder</key>
    <false/>
    <key>allowExternalDisplays</key>
    <false/>
    <key>displayScalingPolicy</key>
    <integer>0</integer>
    <key>insideSebEnablePrint</key>
    <false/>
    <key>insideSebEnablePrintScreen</key>
    <false/>
  </dict>
</plist>`;
}

/**
 * Generates the seb:// launch URL that opens SEB with the config.
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Default SEB lockdown settings for CBE exams.
 */
export const DEFAULT_SEB_SETTINGS: Omit<SebConfigOptions, "examBatchId" | "examName" | "startUrl"> = {
  allowQuit: true,
  quitPassword: "",
  allowReload: false,
  showTime: true,
  showKeyboardLayout: false,
  allowSpellCheck: false,
  allowZoom: true,
  blockScreenCapture: true,
  blockScreenSharing: true,
  allowDeveloperConsole: false,
  muteAudio: false,
  allowWindowResize: false,
  blockedProcesses: [
    "TeamViewer",
    "AnyDesk",
    "Chrome Remote Desktop",
    "Skype",
    "Zoom",
    "Discord",
    "Snipping Tool",
    "OBS Studio",
  ],
  urlFilterRules: [
    { action: "allow", url: "localhost", description: "Allow backend API" },
    { action: "allow", url: "127.0.0.1", description: "Allow local backend" },
  ],
};
