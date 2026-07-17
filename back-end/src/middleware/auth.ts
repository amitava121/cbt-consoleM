import { type FastifyPluginAsync } from "fastify";
import { verifyToken, type TokenPayload } from "../services/auth.js";

declare module "fastify" {
  interface FastifyRequest {
    user: TokenPayload;
  }
}

const authMiddleware: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }

    const token = authHeader.slice(7);
    try {
      request.user = verifyToken(token);
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }
  });
};

export default authMiddleware;
