import { eq } from "drizzle-orm";
import { type FastifyReply, type FastifyRequest } from "fastify";
import { db } from "../database/db.js";
import { examBatches, systemSettings } from "../database/schemas/index.js";
import {
    generateBrowserExamKey,
    type SebConfigOptions,
} from "../modules/seb/seb-config-generator.js";

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
    return { enabled: false };
  }

  try {
    return JSON.parse(row.value) as Record<string, unknown>;
  } catch {
    return { enabled: false };
  }
}

/**
 * SEB Browser Exam Key (BEK) Verification Middleware
 *
 * Verifies that requests to protected exam endpoints come from Safe Exam Browser
 * by checking the `X-Safeexambrowser-Requesthash` header against the expected BEK.
 *
 * SEB sends these headers:
 * - X-Safeexambrowser-Requesthash: SHA-256 hash of the exam key
 * - X-Safeexambrowser-Confighash: Hash of the config file
 * - User-Agent: contains "SEB" when running in SEB
 *
 * Usage:
 *   app.get("/protected", { preHandler: verifySebBek }, handler);
 *   app.addHook("preHandler", verifySebBek); // for entire plugin
 */

// Header names SEB uses (case-insensitive in Fastify)
const SEB_REQUEST_HASH_HEADER = "x-safeexambrowser-requesthash";
const SEB_USER_AGENT_MARKER = "seb";

/**
 * Checks if the request is coming from Safe Exam Browser by examining
 * the User-Agent header for the SEB marker.
 */
export function isSebRequest(request: FastifyRequest): boolean {
  const userAgent = request.headers["user-agent"] ?? "";
  return userAgent.toLowerCase().includes(SEB_USER_AGENT_MARKER);
}

/**
 * Verifies the SEB Browser Exam Key (BEK) header against the expected hash.
 *
 * This middleware:
 * 1. Reads global SEB settings from system_settings
 * 2. If SEB is enabled, verifies the X-Safeexambrowser-Requesthash header
 * 3. Falls back to User-Agent check if BEK is not configured
 *
 * The examBatchId is extracted from:
 * - Route param `batchId` or `id`
 * - Request body `examBatchId`
 * - Query param `examBatchId`
 */
export async function verifySebBek(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  // Read global SEB settings
  const sebSettings = await getSebSettings();

  if (!(sebSettings.enabled as boolean)) {
    // SEB not required globally — allow all requests
    return;
  }

  // Extract examBatchId from various sources
  const params = request.params as Record<string, string>;
  const body = request.body as Record<string, unknown> | null;
  const query = request.query as Record<string, string>;

  const examBatchId =
    params.batchId ??
    params.id ??
    (body?.examBatchId as string) ??
    query.examBatchId;

  if (!examBatchId) {
    // No batch ID — can't verify, allow through (other middleware will handle)
    return;
  }

  // Fetch the exam batch name (for BEK computation)
  const [batch] = await db
    .select({
      id: examBatches.id,
      name: examBatches.name,
    })
    .from(examBatches)
    .where(eq(examBatches.id, examBatchId))
    .limit(1);

  if (!batch) {
    return reply.code(404).send({ error: "Exam batch not found" });
  }

  // SEB is required — verify the request
  const requestHash = request.headers[SEB_REQUEST_HASH_HEADER] as
    | string
    | undefined;

  // Build the expected config for BEK verification
  const globalStartUrl = (sebSettings.startUrl as string) ?? "";
  const startUrl =
    globalStartUrl ||
    `${request.protocol}://${request.hostname}/exam/${examBatchId}`;

  const configOptions: SebConfigOptions = {
    examBatchId: batch.id,
    examName: batch.name,
    startUrl,
  };

  const expectedHash = generateBrowserExamKey(configOptions);

  // Verification strategy:
  // 1. If BEK header matches expected hash → allow (strongest verification)
  // 2. If BEK header is present but doesn't match → reject (possible spoofing)
  // 3. If no BEK header but User-Agent contains "SEB" → allow (SEB without BEK config)
  // 4. If no SEB markers at all → reject

  if (requestHash) {
    if (requestHash === expectedHash) {
      return; // BEK verified — strongest check
    }
    // BEK present but doesn't match — reject
    return reply.code(403).send({
      error: "SEB verification failed: Browser Exam Key mismatch",
      code: "SEB_BEK_MISMATCH",
    });
  }

  // No BEK header — fall back to User-Agent check
  if (isSebRequest(request)) {
    // Running in SEB but without BEK — allow if config allows it
    if (sebSettings.requireBek === true) {
      return reply.code(403).send({
        error:
          "SEB verification failed: Browser Exam Key required but not provided",
        code: "SEB_BEK_REQUIRED",
      });
    }
    return; // SEB detected via User-Agent, BEK not required
  }

  // No SEB markers at all — reject
  return reply.code(403).send({
    error:
      "This exam requires Safe Exam Browser. Please launch the exam using SEB.",
    code: "SEB_REQUIRED",
  });
}

/**
 * Lightweight SEB check that only verifies User-Agent (for non-critical endpoints).
 * Use this for endpoints where BEK is overkill but SEB is still preferred.
 */
export async function verifySebUserAgent(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!isSebRequest(request)) {
    return reply.code(403).send({
      error: "This endpoint requires Safe Exam Browser.",
      code: "SEB_REQUIRED",
    });
  }
}
