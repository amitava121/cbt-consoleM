import { sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";

const HEARTBEAT_TIMEOUT_SECS = 30;

const registerSchema = z.object({
  candidateId: z.string().uuid(),
  candidateName: z.string().max(255),
  admitCard: z.string().max(50).optional(),
  ipAddress: z.string().max(45).optional(),
  userAgent: z.string().optional(),
  browserName: z.string().max(100).optional(),
  hostname: z.string().max(255).optional(),
  deviceFingerprint: z.string().max(255).optional(),
});

const heartbeatSchema = z.object({
  sessionId: z.string().uuid(),
  currentPage: z.string().max(50).optional(),
  currentQuestionIndex: z.number().int().optional(),
  remainingTimeSecs: z.number().int().optional(),
  examBatchId: z.string().uuid().optional(),
  examName: z.string().max(255).optional(),
  attemptId: z.string().uuid().optional(),
  currentStatus: z.string().max(30).optional(),
});

const browserSessionRoutes: FastifyPluginAsync = async (app) => {

  // POST /browser-sessions/register — called on candidate login
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Validation failed", details: parsed.error.flatten() });

    const { candidateId, candidateName, admitCard, ipAddress, userAgent, browserName, hostname, deviceFingerprint } = parsed.data;

    // Upsert: if candidate already has an active session, update it
    const existing = await db.execute(sql`
      SELECT id FROM browser_sessions 
      WHERE candidate_id = ${candidateId} AND is_connected = true
      LIMIT 1
    `);

    if (existing.rows.length > 0 && (existing.rows[0] as any).id) {
      const existingId = (existing.rows[0] as any).id;
      const updated = await db.execute(sql`
        UPDATE browser_sessions SET
          candidate_name = ${candidateName},
          admit_card = ${admitCard ?? null},
          ip_address = ${ipAddress ?? request.ip},
          user_agent = ${userAgent ?? null},
          browser_name = ${browserName ?? null},
          hostname = ${hostname ?? null},
          device_fingerprint = ${deviceFingerprint ?? null},
          last_heartbeat = NOW(),
          current_status = 'online',
          is_connected = true,
          login_time = NOW(),
          updated_at = NOW()
        WHERE id = ${existingId}
        RETURNING id
      `);
      return reply.send({ sessionId: (updated.rows[0] as any)?.id ?? existingId, status: "reconnected" });
    }

    // Create new session
    const session = await db.execute(sql`
      INSERT INTO browser_sessions (candidate_id, candidate_name, admit_card, ip_address, user_agent, browser_name, hostname, device_fingerprint, client_type, current_status, is_connected)
      VALUES (${candidateId}, ${candidateName}, ${admitCard ?? null}, ${ipAddress ?? request.ip}, ${userAgent ?? null}, ${browserName ?? null}, ${hostname ?? null}, ${deviceFingerprint ?? null}, 'browser', 'online', true)
      RETURNING id
    `);

    return reply.code(201).send({ sessionId: (session.rows[0] as any).id, status: "registered" });
  });

  // POST /browser-sessions/heartbeat — called every 10-15 seconds
  app.post("/heartbeat", async (request, reply) => {
    const parsed = heartbeatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Validation failed" });

    const { sessionId, currentPage, currentQuestionIndex, remainingTimeSecs, examBatchId, examName, attemptId, currentStatus } = parsed.data;

    await db.execute(sql`
      UPDATE browser_sessions SET
        last_heartbeat = NOW(),
        current_page = COALESCE(${currentPage ?? null}, current_page),
        current_question_index = COALESCE(${currentQuestionIndex ?? null}, current_question_index),
        remaining_time_secs = COALESCE(${remainingTimeSecs ?? null}, remaining_time_secs),
        exam_batch_id = COALESCE(${examBatchId ?? null}, exam_batch_id),
        exam_name = COALESCE(${examName ?? null}, exam_name),
        attempt_id = COALESCE(${attemptId ?? null}, attempt_id),
        current_status = COALESCE(${currentStatus ?? null}, current_status),
        is_connected = true,
        updated_at = NOW()
      WHERE id = ${sessionId}
    `);

    return reply.send({ ok: true, serverTime: new Date().toISOString() });
  });

  // POST /browser-sessions/disconnect — called on page unload
  app.post("/disconnect", async (request, reply) => {
    const body = request.body as { sessionId?: string };
    if (!body.sessionId) return reply.code(400).send({ error: "sessionId required" });

    await db.execute(sql`
      UPDATE browser_sessions SET
        is_connected = false,
        current_status = 'offline',
        updated_at = NOW()
      WHERE id = ${body.sessionId}
    `);

    return reply.send({ ok: true });
  });

  // GET /browser-sessions/active — for Admin Live Monitor
  app.get("/active", async (_request, reply) => {
    const since = new Date(Date.now() - HEARTBEAT_TIMEOUT_SECS * 1000);

    // Mark stale sessions as offline
    await db.execute(sql`
      UPDATE browser_sessions SET
        is_connected = false,
        current_status = 'offline'
      WHERE is_connected = true AND last_heartbeat < ${since}
    `);

    // Return all recent sessions (last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const rows = await db.execute(sql`
      SELECT * FROM browser_sessions
      WHERE login_time > ${twoHoursAgo}
      ORDER BY is_connected DESC, last_heartbeat DESC
    `);

    return reply.send({ data: rows.rows, total: rows.rows.length });
  });
};

export default browserSessionRoutes;
