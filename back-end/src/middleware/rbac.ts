import { type FastifyReply, type FastifyRequest } from "fastify";

/**
 * RBAC middleware factory — returns a preHandler that checks the
 * authenticated user's role against the allowed roles.
 *
 * Usage at plugin level:
 *   app.addHook("preHandler", requireRole("super_admin"));
 *
 * Usage at route level:
 *   app.get("/", { preHandler: requireRole("super_admin") }, handler);
 *
 * Per SECURITY_ARCHITECTURE.md Section 4.1 Permission Matrix.
 */
export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return reply.code(403).send({ error: "Insufficient permissions" });
    }
  };
}
