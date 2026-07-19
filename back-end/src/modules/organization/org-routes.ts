import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import {
    batches,
    centers,
    institutions,
} from "../../database/schemas/index.js";

/* ---------- Zod Schemas ---------- */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

const createInstitutionSchema = z.object({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  address: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
});

const updateInstitutionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  address: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(20).optional(),
  isActive: z.boolean().optional(),
});

const createCenterSchema = z.object({
  institutionId: z.string().uuid(),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  address: z.string().optional(),
  capacity: z.coerce.number().int().min(1).max(10000).default(100),
});

const updateCenterSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  address: z.string().optional(),
  capacity: z.coerce.number().int().min(1).max(10000).optional(),
  isActive: z.boolean().optional(),
});

const createBatchSchema = z.object({
  centerId: z.string().uuid(),
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(50),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
});

const updateBatchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  code: z.string().min(1).max(50).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isActive: z.boolean().optional(),
});

/* ---------- Institutions Routes ---------- */

const institutionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const where =
      search && search.length >= 3
        ? ilike(institutions.name, `%${search}%`)
        : undefined;

    const baseQuery = db
      .select()
      .from(institutions)
      .orderBy(desc(institutions.createdAt))
      .limit(pageSize)
      .offset(offset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(institutions);

    const [rows, [{ count }]] = await Promise.all([
      where ? baseQuery.where(where) : baseQuery,
      where ? countQuery.where(where) : countQuery,
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.post("/", async (request, reply) => {
    const parsed = createInstitutionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [existing] = await db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.code, parsed.data.code))
      .limit(1);
    if (existing)
      return reply.code(409).send({ error: "Institution code already exists" });

    const [institution] = await db
      .insert(institutions)
      .values(parsed.data)
      .returning();
    return reply.code(201).send(institution);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateInstitutionSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [updated] = await db
      .update(institutions)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(institutions.id, id))
      .returning();
    if (!updated)
      return reply.code(404).send({ error: "Institution not found" });
    return updated;
  });

  app.delete("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;

    const [updated] = await db
      .update(institutions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(institutions.id, id))
      .returning();
    if (!updated)
      return reply.code(404).send({ error: "Institution not found" });
    return { message: "Institution deactivated" };
  });
};

/* ---------- Centers Routes ---------- */

const centersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search && search.length >= 3)
      conditions.push(ilike(centers.name, `%${search}%`));
    const institutionId = (request.query as { institutionId?: string })
      .institutionId;
    if (institutionId)
      conditions.push(eq(centers.institutionId, institutionId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select({
        id: centers.id,
        institutionId: centers.institutionId,
        name: centers.name,
        code: centers.code,
        address: centers.address,
        capacity: centers.capacity,
        isActive: centers.isActive,
        createdAt: centers.createdAt,
        updatedAt: centers.updatedAt,
        institutionName: institutions.name,
      })
      .from(centers)
      .leftJoin(institutions, eq(centers.institutionId, institutions.id))
      .orderBy(desc(centers.createdAt))
      .limit(pageSize)
      .offset(offset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(centers);

    const [rows, [{ count }]] = await Promise.all([
      where ? baseQuery.where(where) : baseQuery,
      where ? countQuery.where(where) : countQuery,
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.post("/", async (request, reply) => {
    const parsed = createCenterSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [existing] = await db
      .select({ id: centers.id })
      .from(centers)
      .where(eq(centers.code, parsed.data.code))
      .limit(1);
    if (existing)
      return reply.code(409).send({ error: "Center code already exists" });

    const [center] = await db.insert(centers).values(parsed.data).returning();
    return reply.code(201).send(center);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateCenterSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [updated] = await db
      .update(centers)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(centers.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Center not found" });
    return updated;
  });

  app.get("/:id/batches", async (request) => {
    const id = (request.params as { id: string }).id;
    const query = request.query as { page?: string; pageSize?: string };
    const page = Math.max(1, parseInt(query.page ?? "1"));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "50")));
    const offset = (page - 1) * pageSize;

    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(batches)
        .where(eq(batches.centerId, id))
        .orderBy(desc(batches.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(batches)
        .where(eq(batches.centerId, id)),
    ]);

    return { data: rows, total: count, page, pageSize };
  });
};

/* ---------- Batches Routes ---------- */

const batchesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return { error: "Invalid query parameters" };
    const { page, pageSize, search } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search && search.length >= 3)
      conditions.push(ilike(batches.name, `%${search}%`));
    const centerId = (request.query as { centerId?: string }).centerId;
    if (centerId) conditions.push(eq(batches.centerId, centerId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select({
        id: batches.id,
        centerId: batches.centerId,
        name: batches.name,
        code: batches.code,
        startDate: batches.startDate,
        endDate: batches.endDate,
        isActive: batches.isActive,
        createdAt: batches.createdAt,
        updatedAt: batches.updatedAt,
        centerName: centers.name,
        institutionName: institutions.name,
      })
      .from(batches)
      .leftJoin(centers, eq(batches.centerId, centers.id))
      .leftJoin(institutions, eq(centers.institutionId, institutions.id))
      .orderBy(desc(batches.createdAt))
      .limit(pageSize)
      .offset(offset);
    const countQuery = db
      .select({ count: sql<number>`count(*)::int` })
      .from(batches);

    const [rows, [{ count }]] = await Promise.all([
      where ? baseQuery.where(where) : baseQuery,
      where ? countQuery.where(where) : countQuery,
    ]);

    return { data: rows, total: count, page, pageSize };
  });

  app.post("/", async (request, reply) => {
    const parsed = createBatchSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const [existing] = await db
      .select({ id: batches.id })
      .from(batches)
      .where(
        and(
          eq(batches.centerId, parsed.data.centerId),
          eq(batches.code, parsed.data.code),
        ),
      )
      .limit(1);
    if (existing)
      return reply
        .code(409)
        .send({ error: "Batch code already exists in this center" });

    const [batch] = await db
      .insert(batches)
      .values({
        centerId: parsed.data.centerId,
        name: parsed.data.name,
        code: parsed.data.code,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate ?? null,
      })
      .returning();
    return reply.code(201).send(batch);
  });

  app.put("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateBatchSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };
    if (parsed.data.startDate) updateData.startDate = parsed.data.startDate;
    if (parsed.data.endDate !== undefined)
      updateData.endDate = parsed.data.endDate ?? null;

    const [updated] = await db
      .update(batches)
      .set(updateData)
      .where(eq(batches.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "Batch not found" });
    return updated;
  });
};

export { batchesRoutes, centersRoutes, institutionsRoutes };
