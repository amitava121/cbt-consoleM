import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    batches,
    candidates,
    centers,
    users,
} from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";

/* ---------- Zod Schemas ---------- */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  batchId: z.string().uuid().optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

const createCandidateSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(255),
  password: z.string().min(6).max(100),
  batchId: z.string().uuid().optional().nullable(),
  rollNumber: z.string().max(50).optional(),
  admitCardNumber: z.string().max(50).optional(),
  photoUrl: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
});

const updateCandidateSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  batchId: z.string().uuid().optional().nullable(),
  rollNumber: z.string().max(50).optional(),
  admitCardNumber: z.string().max(50).optional(),
  photoUrl: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});

const bulkImportSchema = z.object({
  batchId: z.string().uuid().optional().nullable(),
  candidates: z
    .array(
      z.object({
        email: z.string().email(),
        fullName: z.string().min(1).max(255),
        rollNumber: z.string().max(50).optional(),
        admitCardNumber: z.string().max(50).optional(),
        phone: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(500),
});

/* ---------- Route Plugin ---------- */

const candidateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("super_admin", "exam_admin"));

  /* ----- GET /candidates — list with pagination + filters ----- */
  app.get("/", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success)
      return reply.code(400).send({ error: "Invalid query parameters" });

    const { page, pageSize, search, batchId, isActive } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search && search.length >= 3) {
      conditions.push(
        or(
          ilike(
            sql`(${users.fullName} || ' ' || ${users.email})`,
            `%${search}%`,
          ),
          ilike(
            sql`(COALESCE(${candidates.rollNumber}, '') || ' ' || COALESCE(${candidates.admitCardNumber}, ''))`,
            `%${search}%`,
          ),
        ),
      );
    }
    if (batchId) conditions.push(eq(candidates.batchId, batchId));
    if (isActive !== undefined)
      conditions.push(eq(candidates.isActive, isActive === "true"));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: candidates.id,
          userId: candidates.userId,
          batchId: candidates.batchId,
          rollNumber: candidates.rollNumber,
          admitCardNumber: candidates.admitCardNumber,
          photoUrl: candidates.photoUrl,
          isActive: candidates.isActive,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          batchName: batches.name,
        })
        .from(candidates)
        .innerJoin(users, eq(candidates.userId, users.id))
        .leftJoin(batches, eq(candidates.batchId, batches.id))
        .where(where)
        .orderBy(asc(candidates.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(candidates)
        .innerJoin(users, eq(candidates.userId, users.id))
        .where(where),
    ]);

    return reply.send({
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  });

  /* ----- POST /candidates — create single candidate ----- */
  app.post("/", async (request, reply) => {
    const parsed = createCandidateSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const {
      email,
      fullName,
      password,
      batchId,
      rollNumber,
      admitCardNumber,
      photoUrl,
      phone,
    } = parsed.data;

    // Hash password BEFORE transaction to avoid holding DB lock during CPU work
    const { hash } = await import("@node-rs/argon2");
    const passwordHash = await hash(password);

    // Atomic insert with ON CONFLICT DO NOTHING — eliminates TOCTOU race condition
    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email,
          fullName,
          passwordHash,
          role: "candidate",
          phone: phone ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: users.id });

      if (!user) return null;

      const [candidate] = await tx
        .insert(candidates)
        .values({
          userId: user.id,
          batchId: batchId ?? null,
          rollNumber: rollNumber ?? null,
          admitCardNumber: admitCardNumber ?? null,
          photoUrl: photoUrl ?? null,
        })
        .returning();

      return candidate;
    });

    if (!result)
      return reply.code(409).send({ error: "Email already registered" });

    return reply.code(201).send(result);
  });

  /* ----- GET /candidates/:id — get details ----- */
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [row] = await db
      .select({
        id: candidates.id,
        userId: candidates.userId,
        batchId: candidates.batchId,
        rollNumber: candidates.rollNumber,
        admitCardNumber: candidates.admitCardNumber,
        photoUrl: candidates.photoUrl,
        isActive: candidates.isActive,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        batchName: batches.name,
        centerName: centers.name,
      })
      .from(candidates)
      .innerJoin(users, eq(candidates.userId, users.id))
      .leftJoin(batches, eq(candidates.batchId, batches.id))
      .leftJoin(centers, eq(batches.centerId, centers.id))
      .where(eq(candidates.id, id))
      .limit(1);

    if (!row) return reply.code(404).send({ error: "Candidate not found" });

    return reply.send(row);
  });

  /* ----- PUT /candidates/:id — update ----- */
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateCandidateSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const {
      fullName,
      batchId,
      rollNumber,
      admitCardNumber,
      photoUrl,
      phone,
      isActive,
    } = parsed.data;

    // Single transaction: update candidate + user, then return joined result
    const row = await db.transaction(async (tx) => {
      // Update candidate
      const [updated] = await tx
        .update(candidates)
        .set({
          ...(batchId !== undefined ? { batchId: batchId ?? null } : {}),
          ...(rollNumber !== undefined ? { rollNumber } : {}),
          ...(admitCardNumber !== undefined ? { admitCardNumber } : {}),
          ...(photoUrl !== undefined ? { photoUrl } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, id))
        .returning({ userId: candidates.userId });

      if (!updated) return null;

      // Update user fields if provided
      if (fullName !== undefined || phone !== undefined) {
        await tx
          .update(users)
          .set({
            ...(fullName !== undefined ? { fullName } : {}),
            ...(phone !== undefined ? { phone } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, updated.userId));
      }

      // Fetch joined view within same transaction (avoids separate query)
      const [result] = await tx
        .select({
          id: candidates.id,
          userId: candidates.userId,
          batchId: candidates.batchId,
          rollNumber: candidates.rollNumber,
          admitCardNumber: candidates.admitCardNumber,
          photoUrl: candidates.photoUrl,
          isActive: candidates.isActive,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
          email: users.email,
          fullName: users.fullName,
          phone: users.phone,
          batchName: batches.name,
        })
        .from(candidates)
        .innerJoin(users, eq(candidates.userId, users.id))
        .leftJoin(batches, eq(candidates.batchId, batches.id))
        .where(eq(candidates.id, id))
        .limit(1);

      return result;
    });

    if (!row) return reply.code(404).send({ error: "Candidate not found" });

    return reply.send(row);
  });

  /* ----- POST /candidates/bulk — bulk import ----- */
  app.post("/bulk", async (request, reply) => {
    const parsed = bulkImportSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      });

    const { batchId, candidates: importRows } = parsed.data;

    // Deduplicate by email within the payload
    const seenEmails = new Set<string>();
    const uniqueRows = importRows.filter((r) => {
      const lower = r.email.toLowerCase();
      if (seenEmails.has(lower)) return false;
      seenEmails.add(lower);
      return true;
    });

    // Hash default password BEFORE transaction
    const { hash } = await import("@node-rs/argon2");
    const defaultPasswordHash = await hash("Candidate@123");

    // Atomic bulk insert with ON CONFLICT DO NOTHING — eliminates race conditions
    // No pre-check needed; PostgreSQL handles uniqueness atomically
    const result = await db.transaction(async (tx) => {
      // Batch insert users with ON CONFLICT DO NOTHING
      const createdUsers = await tx
        .insert(users)
        .values(
          uniqueRows.map((r) => ({
            email: r.email,
            fullName: r.fullName,
            passwordHash: defaultPasswordHash,
            role: "candidate" as const,
            phone: r.phone ?? null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: users.id, email: users.email });

      if (createdUsers.length === 0) {
        return { imported: 0, skipped: uniqueRows.length };
      }

      // Build lookup for optional fields (avoid O(n²) find calls)
      const emailToRow = new Map(
        uniqueRows.map((r) => [r.email.toLowerCase(), r]),
      );

      const candidateRows = createdUsers.map((u) => ({
        userId: u.id,
        batchId: batchId ?? null,
        rollNumber: emailToRow.get(u.email.toLowerCase())?.rollNumber ?? null,
        admitCardNumber:
          emailToRow.get(u.email.toLowerCase())?.admitCardNumber ?? null,
      }));

      const createdCandidates = await tx
        .insert(candidates)
        .values(candidateRows)
        .returning({ id: candidates.id });

      return {
        imported: createdCandidates.length,
        skipped: uniqueRows.length - createdUsers.length,
      };
    });

    return reply.code(201).send({
      message: `${result.imported} candidate(s) imported`,
      imported: result.imported,
      skipped: result.skipped,
    });
  });
};

export default candidateRoutes;
