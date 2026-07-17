# CBE Console — Backend

Node.js 24 + Fastify 5 + Drizzle ORM + PostgreSQL + WebSocket (`ws`).

## Quick Start

```bash
# 1. Install dependencies (already done if node_modules exists)
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your PostgreSQL connection details

# 3. Create database and run migrations
npx drizzle-kit migrate

# 4. Start development server
npm run dev
```

## Scripts

- `npm run dev` — Start with hot reload (tsx watch)
- `npm run build` — Compile TypeScript to `dist/`
- `npm start` — Run compiled server
- `npm run db:generate` — Generate Drizzle migrations
- `npm run db:migrate` — Apply migrations
- `npm run db:studio` — Open Drizzle Studio
- `npm run db:seed` — Seed database
- `npm test` — Run Vitest tests

## Architecture

- `src/config/` — Environment and configuration
- `src/database/` — Drizzle schemas, migrations, and db client
- `src/modules/` — Domain modules (auth, users, exams, etc.)
- `src/routes/` — Fastify route definitions
- `src/services/` — Shared business services
- `src/middleware/` — Fastify plugins (auth, logging, error handling)
- `src/websocket/` — WebSocket server and room management
- `src/workers/` — Background worker threads
- `tests/` — Unit and integration tests
