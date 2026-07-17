import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { closePool } from "./database/db.js";
import authRoutes from "./modules/auth/routes.js";
import examBatchRoutes from "./modules/exams/exam-batch-routes.js";
import examRoutes from "./modules/exams/exam-routes.js";
import candidateRoutes from "./modules/organization/candidate-routes.js";
import deviceRoutes from "./modules/organization/device-routes.js";
import {
    batchesRoutes,
    centersRoutes,
    institutionsRoutes,
} from "./modules/organization/org-routes.js";
import questionBanksRoutes from "./modules/question-bank/banks-routes.js";
import importExportRoutes from "./modules/question-bank/import-export-routes.js";
import questionsRoutes from "./modules/question-bank/questions-routes.js";
import {
    subjectsRoutes,
    topicsRoutes,
} from "./modules/question-bank/subjects-routes.js";
import sessionRoutes from "./modules/sessions/session-routes.js";
import usersRoutes from "./modules/users/routes.js";
import { verifyToken } from "./services/auth.js";
import websocketPlugin from "./websocket/server.js";

const app = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.body.password",
        "req.body.passwordHash",
        "*.password",
        "*.passwordHash",
        "*.token",
      ],
      remove: true,
    },
  },
});

app.register(cors, {
  origin: env.NODE_ENV === "development" ? true : false,
});
app.register(helmet);
app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Allow empty JSON bodies for POST routes that don't require a body (e.g. /resume, /submit)
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (_req, body, done) => {
    const str = typeof body === "string" ? body : body.toString();
    if (str.trim() === "") {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(str));
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)), undefined);
    }
  },
);

if (env.NODE_ENV === "development") {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "CBE Console API",
        version: "0.1.0",
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
}

app.get("/health", async () => ({ status: "ok", env: env.NODE_ENV }));

app.get("/api", async () => ({
  message: "CBE Console API",
  version: "0.1.0",
}));

await app.register(authRoutes, { prefix: "/api/auth" });

await app.register(async (protectedScope) => {
  protectedScope.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.code(401).send({ error: "Missing access token" });
    }
    try {
      request.user = verifyToken(authHeader.slice(7));
    } catch {
      return reply.code(401).send({ error: "Invalid access token" });
    }
  });
  await protectedScope.register(usersRoutes, { prefix: "/api/users" });
  await protectedScope.register(institutionsRoutes, {
    prefix: "/api/institutions",
  });
  await protectedScope.register(centersRoutes, { prefix: "/api/centers" });
  await protectedScope.register(batchesRoutes, { prefix: "/api/batches" });
  await protectedScope.register(subjectsRoutes, { prefix: "/api/subjects" });
  await protectedScope.register(topicsRoutes, { prefix: "/api/topics" });
  await protectedScope.register(questionBanksRoutes, {
    prefix: "/api/question-banks",
  });
  await protectedScope.register(questionsRoutes, { prefix: "/api/questions" });
  await protectedScope.register(importExportRoutes, {
    prefix: "/api/questions",
  });
  await protectedScope.register(examRoutes, { prefix: "/api/exams" });
  await protectedScope.register(examBatchRoutes, {
    prefix: "/api/exam-batches",
  });
  await protectedScope.register(candidateRoutes, {
    prefix: "/api/candidates",
  });
  await protectedScope.register(deviceRoutes, {
    prefix: "/api/devices",
  });
  await protectedScope.register(sessionRoutes, {
    prefix: "/api/sessions",
  });
});

await app.register(websocketPlugin);

app.addHook("onClose", async () => {
  await closePool();
});

const start = async () => {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received. Closing server...`);
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
