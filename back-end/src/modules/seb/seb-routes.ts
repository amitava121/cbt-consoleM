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
    return JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return { enabled: false, ...DEFAULT_SEB_SETTINGS };
  }
}

const sebSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  requireBek: z.boolean().default(true),
  startUrl: z.string().url().or(z.literal("")).default(""),
  quitUrl: z.string().url().or(z.literal("")).default(""),
  quitPassword: z.string().optional(),
  allowQuit: z.boolean().default(true),
  allowReload: z.boolean().default(false),
  showTime: z.boolean().default(true),
  showKeyboardLayout: z.boolean().default(false),
  allowSpellCheck: z.boolean().default(false),
  allowZoom: z.boolean().default(true),
  blockScreenCapture: z.boolean().default(true),
  blockScreenSharing: z.boolean().default(true),
  allowDeveloperConsole: z.boolean().default(false),
  muteAudio: z.boolean().default(false),
  allowWindowResize: z.boolean().default(false),
  blockedProcesses: z.array(z.string()).default([]),
  urlFilterRules: z
    .array(
      z.object({
        action: z.enum(["block", "allow"]),
        url: z.string(),
        description: z.string().optional(),
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
      quitUrl: (sebSettings.quitUrl as string) ?? "",
      examKey: generateBrowserExamKey({
        examBatchId: batchId,
        examName: batch.name,
        startUrl,
      }),
      allowQuit: sebSettings.allowQuit as boolean | undefined,
      quitPassword: sebSettings.quitPassword as string | undefined,
      allowReload: sebSettings.allowReload as boolean | undefined,
      showTime: sebSettings.showTime as boolean | undefined,
      showKeyboardLayout: sebSettings.showKeyboardLayout as boolean | undefined,
      allowSpellCheck: sebSettings.allowSpellCheck as boolean | undefined,
      allowZoom: sebSettings.allowZoom as boolean | undefined,
      blockScreenCapture: sebSettings.blockScreenCapture as boolean | undefined,
      blockScreenSharing: sebSettings.blockScreenSharing as boolean | undefined,
      allowDeveloperConsole: sebSettings.allowDeveloperConsole as
        | boolean
        | undefined,
      muteAudio: sebSettings.muteAudio as boolean | undefined,
      allowWindowResize: sebSettings.allowWindowResize as boolean | undefined,
      blockedProcesses: (sebSettings.blockedProcesses as string[]) ?? [],
      urlFilterRules:
        (sebSettings.urlFilterRules as SebConfigOptions["urlFilterRules"]) ??
        [],
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
