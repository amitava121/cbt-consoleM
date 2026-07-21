FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Compile TypeScript
RUN npx tsc

# --- Runtime ---
FROM node:24-alpine

WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Copy drizzle config + migrations (with meta) + schemas + seeds
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/database/migrations ./src/database/migrations
COPY --from=builder /app/src/database/schemas ./src/database/schemas
COPY --from=builder /app/src/database/seeds ./src/database/seeds

# Entrypoint: wait for DB, run migrations, seed, start server
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
