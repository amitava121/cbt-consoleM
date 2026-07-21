import { desc, eq, ilike, ne, sql } from "drizzle-orm";
import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { db } from "../../database/db.js";
import { users } from "../../database/schemas/index.js";
import { requireRole } from "../../middleware/rbac.js";
import { hashPassword } from "../../services/auth.js";

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).max(255),
  role: z.enum([
    "super_admin",
    "exam_admin",
    "proctor",
    "question_author",
    "candidate",
  ]),
  phone: z.string().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  role: z
    .enum([
      "super_admin",
      "exam_admin",
      "proctor",
      "question_author",
      "candidate",
    ])
    .optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  role: z.string().optional(),
  excludeRole: z.string().optional(),
});

const usersRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("super_admin"));

  app.get("/", async (request) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return { error: "Invalid query parameters" };
    }
    const { page, pageSize, search, role, excludeRole } = parsed.data;
    const offset = (page - 1) * pageSize;

    const conditions = [];
    if (search && search.length >= 3) {
      conditions.push(
        ilike(sql`(${users.email} || ' ' || ${users.fullName})`, `%${search}%`),
      );
    }
    if (role) {
      conditions.push(
        eq(users.role, role as (typeof users.role.enumValues)[number]),
      );
    }
    if (excludeRole) {
      conditions.push(
        ne(users.role, excludeRole as (typeof users.role.enumValues)[number]),
      );
    }

    const where =
      conditions.length > 0 ? sql.join(conditions, sql` AND `) : undefined;

    const [rows, [{ count }]] = await Promise.all([
      where
        ? db
            .select()
            .from(users)
            .where(where)
            .orderBy(desc(users.createdAt))
            .limit(pageSize)
            .offset(offset)
        : db
            .select()
            .from(users)
            .orderBy(desc(users.createdAt))
            .limit(pageSize)
            .offset(offset),
      where
        ? db
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(where)
        : db.select({ count: sql<number>`count(*)::int` }).from(users),
    ]);

    const data = rows.map((row) => ({
      ...row,
      passwordHash: undefined,
    }));

    return { data, total: count, page, pageSize };
  });

  app.get("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  });

  app.post("/", async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (existing) {
      return reply.code(409).send({ error: "Email already in use" });
    }

    const passwordHash = await hashPassword(body.password);

    const [user] = await db
      .insert(users)
      .values({
        email: body.email.toLowerCase(),
        passwordHash,
        fullName: body.fullName,
        role: body.role,
        phone: body.phone,
      })
      .returning();

    const { passwordHash: _, ...safeUser } = user;
    return reply.code(201).send(safeUser);
  });

  app.patch("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
    }
    const body = parsed.data;

    const [updated] = await db
      .update(users)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: "User not found" });
    }

    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  });

  app.delete("/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!deleted) {
      return reply.code(404).send({ error: "User not found" });
    }

    return { message: "User deleted" };
  });
};

export default usersRoutes;
