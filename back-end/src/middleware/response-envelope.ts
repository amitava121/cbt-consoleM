import { type FastifyPluginAsync } from "fastify";

/**
 * Response envelope middleware using onSend hook.
 * Wraps all JSON responses:
 * - Success (2xx/3xx): { success: true, data: <body> }
 * - Error (4xx/5xx): { success: false, error: { code: "...", message: "..." } }
 * 
 * Compliant with API_SPECIFICATION.md Section 2.5.
 */
const responseEnvelopePlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onSend", async (_request, reply, payload) => {
    // Only wrap JSON responses
    const ct = reply.getHeader("content-type");
    if (typeof ct === "string" && !ct.includes("json")) {
      return payload;
    }

    // If payload is not a string, skip
    if (typeof payload !== "string" || payload.length === 0) {
      return payload;
    }

    // Try to parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return payload;
    }

    // Skip if already enveloped
    if (typeof parsed === "object" && parsed !== null && "success" in parsed) {
      return payload;
    }

    const statusCode = reply.statusCode;

    if (statusCode >= 200 && statusCode < 400) {
      return JSON.stringify({ success: true, data: parsed });
    } else {
      let errorCode = mapErrorToCode(statusCode, "");
      let errorMessage = "An unexpected error occurred";

      if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
        const errObj = parsed as Record<string, unknown>;
        if (typeof errObj.error === "string") {
          errorMessage = errObj.error;
          errorCode = mapErrorToCode(statusCode, errObj.error);
        }
      }

      return JSON.stringify({
        success: false,
        error: { code: errorCode, message: errorMessage },
      });
    }
  });
};

function mapErrorToCode(statusCode: number, message: string): string {
  const msg = message.toLowerCase();
  switch (statusCode) {
    case 400: return "VALIDATION_ERROR";
    case 401:
      if (msg.includes("expired")) return "TOKEN_EXPIRED";
      if (msg.includes("revoked")) return "TOKEN_REVOKED";
      return "UNAUTHORIZED";
    case 403:
      if (msg.includes("device")) return "DEVICE_NOT_REGISTERED";
      return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409:
      if (msg.includes("submitted")) return "ATTEMPT_ALREADY_SUBMITTED";
      return "CONFLICT";
    case 423:
      if (msg.includes("lock")) return "LOCKED_OUT";
      if (msg.includes("active")) return "EXAM_NOT_ACTIVE";
      return "EXAM_NOT_ACTIVE";
    case 429: return "RATE_LIMITED";
    case 503: return "SERVICE_UNAVAILABLE";
    default: return "INTERNAL_ERROR";
  }
}

export default responseEnvelopePlugin;
