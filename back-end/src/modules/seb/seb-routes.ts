import { eq } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import { examBatches, systemSettings } from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";
import {
  DEFAULT_SEB_SETTINGS,
  generateBrowserExamKey,
  generateSebConfig,
  generateSebLaunchUrl,
  type SebConfigOptions,
} from "./seb-config-generator.js";

const SEB_SETTINGS_KEY = "seb_config";

/**
 * Reads SEB settings from the system_settings table (global).
 * Returns defaults if no settings exist yet.
 */
async function getSebSettings(): Promise<Record<string, unknown>> {
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, SEB_SETTINGS_KEY))
    .limit(1);

  if (!row) {
    return { enabled: false, ...DEFAULT_SEB_SETTINGS };
  }

  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    // Merge with defaults to ensure new keys are present for old records
    return { ...DEFAULT_SEB_SETTINGS, ...parsed };
  } catch {
    return { enabled: false, ...DEFAULT_SEB_SETTINGS };
  }
}

const sebSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  requireBek: z.boolean().default(true),
  startUrl: z.string().url().or(z.literal("")).default(""),
  // General
  sebServerUrl: z.string().url().or(z.literal("")).default(""),
  quitUrl: z.string().url().or(z.literal("")).default(""),
  quitUrlConfirm: z.boolean().default(true),
  quitPassword: z.string().optional(),
  allowQuit: z.boolean().default(true),
  ignoreExitKeys: z.boolean().default(true),
  sebMode: z.number().int().default(0),
  // UI
  showTaskBar: z.boolean().default(true),
  showTime: z.boolean().default(true),
  showReloadButton: z.boolean().default(true),
  showInputLanguage: z.boolean().default(false),
  showSideMenu: z.boolean().default(false),
  showMenuBar: z.boolean().default(false),
  enableBrowserWindowToolbar: z.boolean().default(false),
  hideBrowserWindowToolbar: z.boolean().default(false),
  browserWindowAllowAddressBar: z.boolean().default(false),
  touchOptimized: z.boolean().default(false),
  enableZoomText: z.boolean().default(false),
  enableZoomPage: z.boolean().default(true),
  zoomMode: z.number().int().default(0),
  allowDictionaryLookup: z.boolean().default(false),
  enableTouchExit: z.boolean().default(false),
  oskBehavior: z.number().int().default(0),
  allowDeveloperConsole: z.boolean().default(false),
  allowSpellCheck: z.boolean().default(false),
  allowSpellCheckDictionary: z.boolean().default(false),
  audioMute: z.boolean().default(false),
  audioControlEnabled: z.boolean().default(false),
  audioVolumeLevel: z.number().int().min(0).max(100).default(25),
  audioSetVolumeLevel: z.boolean().default(false),
  batteryChargeThresholdCritical: z.number().int().default(0),
  batteryChargeThresholdLow: z.number().int().default(0),
  browserScreenKeyboard: z.boolean().default(false),
  showQrVerifyButton: z.boolean().default(false),
  allowFind: z.boolean().default(false),
  allowPrint: z.boolean().default(false),
  browserWindowTitleSuffix: z.string().default(""),
  // Browser
  enableSebBrowser: z.boolean().default(true),
  browserWindowAllowReload: z.boolean().default(false),
  newBrowserWindowAllowReload: z.boolean().default(false),
  showReloadWarning: z.boolean().default(true),
  newBrowserWindowShowReloadWarning: z.boolean().default(true),
  enablePlugIns: z.boolean().default(false),
  enableJava: z.boolean().default(false),
  enableJavaScript: z.boolean().default(true),
  blockPopUpWindows: z.boolean().default(true),
  allowVideoCapture: z.boolean().default(false),
  allowAudioCapture: z.boolean().default(false),
  allowBrowsingBackForward: z.boolean().default(false),
  removeBrowserProfile: z.boolean().default(false),
  removeLocalStorage: z.boolean().default(false),
  allowPDFReaderToolbar: z.boolean().default(false),
  allowPDFPlugIn: z.boolean().default(false),
  newBrowserWindowByLinkPolicy: z.number().int().default(2),
  newBrowserWindowByScriptPolicy: z.number().int().default(2),
  newBrowserWindowByLinkBlockForeign: z.boolean().default(false),
  newBrowserWindowByScriptBlockForeign: z.boolean().default(false),
  newBrowserWindowShowURL: z.boolean().default(false),
  browserWindowShowURL: z.boolean().default(false),
  browserUserAgent: z.string().default(""),
  // Downloads
  allowDownloads: z.boolean().default(false),
  allowUploads: z.boolean().default(false),
  allowCustomDownUploadLocation: z.boolean().default(false),
  downloadDirectoryWin: z.string().default(""),
  downloadDirectoryMac: z.string().default(""),
  openDownloads: z.boolean().default(false),
  downloadPDFFiles: z.boolean().default(false),
  downloadAndOpenSebConfig: z.boolean().default(false),
  backgroundOpenSebConfig: z.boolean().default(false),
  useTemporaryDownUploadDirectory: z.boolean().default(false),
  browserShowFileSystemElementPath: z.boolean().default(false),
  chooseFileToUploadPolicy: z.number().int().default(0),
  // Exam
  sendBrowserExamKey: z.boolean().default(true),
  examSessionClearCookiesOnStart: z.boolean().default(true),
  examSessionClearCookiesOnEnd: z.boolean().default(true),
  browserURLSalt: z.boolean().default(true),
  restartExamText: z.string().default(""),
  restartExamURL: z.string().default(""),
  restartExamUseStartURL: z.boolean().default(false),
  restartExamPasswordProtected: z.boolean().default(false),
  examSessionReconfigureAllow: z.boolean().default(false),
  examSessionReconfigureConfigURL: z.string().default(""),
  quitURLRestart: z.boolean().default(false),
  startURLAppendQueryParameter: z.string().default(""),
  // Applications
  monitorProcesses: z.boolean().default(true),
  allowSwitchToApplications: z.boolean().default(false),
  allowFlashFullscreen: z.boolean().default(false),
  // Security
  blockScreenCapture: z.boolean().default(true),
  blockScreenSharing: z.boolean().default(true),
  allowWindowResize: z.boolean().default(false),
  // Network
  enableURLFilter: z.boolean().default(false),
  enableURLContentFilter: z.boolean().default(false),
  // Processes
  blockedProcesses: z.array(z.string()).default([]),
  permittedProcesses: z.array(z.string()).default([]),
  // URL Filter
  urlFilterRules: z
    .array(
      z.object({
        action: z.enum(["block", "allow"]),
        url: z.string(),
        description: z.string().optional(),
        active: z.boolean().optional(),
        regex: z.boolean().optional(),
      }),
    )
    .default([]),
});

const sebRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /seb/settings — Get global SEB settings ─────────────────────────
  app.get(
    "/settings",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (_request, reply) => {
      const settings = await getSebSettings();
      return reply.send(settings);
    },
  );

  // ─── PUT /seb/settings — Save global SEB settings ────────────────────────
  app.put(
    "/settings",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const parsed = sebSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid SEB settings",
          details: parsed.error.flatten().fieldErrors,
        });
      }

      const settings = parsed.data;
      const settingsJson = JSON.stringify(settings);

      // Upsert: try update first, insert if not exists
      const [existing] = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, SEB_SETTINGS_KEY))
        .limit(1);

      if (existing) {
        await db
          .update(systemSettings)
          .set({
            value: settingsJson,
            valueType: "json",
            description: "Safe Exam Browser global configuration",
            updatedBy: request.user.sub,
            updatedAt: new Date(),
          })
          .where(eq(systemSettings.key, SEB_SETTINGS_KEY));
      } else {
        await db.insert(systemSettings).values({
          key: SEB_SETTINGS_KEY,
          value: settingsJson,
          valueType: "json",
          description: "Safe Exam Browser global configuration",
          isEditable: true,
          updatedBy: request.user.sub,
        });
      }

      return reply.send({
        success: true,
        settings,
      });
    },
  );

  // ─── GET /seb/:batchId/config.seb — Download SEB config file ──────────────
  // Public (no auth) so SEB can download it before login.
  // Uses global SEB settings + batch-specific info (name).
  app.get("/:batchId/config.seb", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };

    const [batch] = await db
      .select({
        id: examBatches.id,
        name: examBatches.name,
      })
      .from(examBatches)
      .where(eq(examBatches.id, batchId))
      .limit(1);

    if (!batch) {
      return reply.code(404).send({ error: "Exam batch not found" });
    }

    const sebSettings = await getSebSettings();

    if (!(sebSettings.enabled as boolean)) {
      return reply.code(404).send({ error: "SEB not enabled" });
    }

    // Build start URL: use configured startUrl or default to exam portal
    const globalStartUrl = (sebSettings.startUrl as string) ?? "";
    const startUrl =
      globalStartUrl ||
      `${request.protocol}://${request.hostname}/exam/${batchId}`;

    const configOptions: SebConfigOptions = {
      examBatchId: batchId,
      examName: batch.name,
      startUrl,
      // Pass all global SEB settings through
      ...sebSettings,
    };

    const configXml = generateSebConfig(configOptions);

    reply.header("Content-Type", "application/xml");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${batch.name.replace(/[^a-zA-Z0-9]/g, "_")}_seb.seb"`,
    );
    return reply.send(configXml);
  });

  // ─── GET /seb/:batchId/launch-url — Get SEB launch URL for a batch ───────
  app.get(
    "/:batchId/launch-url",
    { preHandler: requireRole("super_admin", "exam_admin") },
    async (request, reply) => {
      const { batchId } = request.params as { batchId: string };
      const sebSettings = await getSebSettings();

      if (!(sebSettings.enabled as boolean)) {
        return reply.send({ enabled: false, launchUrl: null });
      }

      const globalStartUrl = (sebSettings.startUrl as string) ?? "";
      const startUrl =
        globalStartUrl ||
        `${request.protocol}://${request.hostname}/exam/${batchId}`;
      const configUrl = `${request.protocol}://${request.hostname}/api/v1/seb/${batchId}/config.seb`;

      return reply.send({
        enabled: true,
        launchUrl: generateSebLaunchUrl(configUrl, startUrl),
        configUrl,
      });
    },
  );

  // ─── POST /seb/:batchId/verify — Verify SEB request ──────────────────────
  app.post("/:batchId/verify", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };

    const sebSettings = await getSebSettings();

    if (!(sebSettings.enabled as boolean)) {
      return reply.send({ sebRequired: false });
    }

    const userAgent = request.headers["user-agent"] ?? "";
    const requestHash = request.headers["x-safeexambrowser-requesthash"] as
      | string
      | undefined;

    const isSeb = userAgent.toLowerCase().includes("seb");
    const hasBek = !!requestHash;

    const [batch] = await db
      .select({ name: examBatches.name })
      .from(examBatches)
      .where(eq(examBatches.id, batchId))
      .limit(1);

    const globalStartUrl = (sebSettings.startUrl as string) ?? "";
    const startUrl =
      globalStartUrl ||
      `${request.protocol}://${request.hostname}/exam/${batchId}`;

    return reply.send({
      sebRequired: true,
      isSebBrowser: isSeb,
      hasBrowserExamKey: hasBek,
      bekValid: hasBek
        ? requestHash ===
          generateBrowserExamKey({
            examBatchId: batchId,
            examName: batch?.name ?? "",
            startUrl,
          })
        : false,
    });
  });
};

export default sebRoutes;
