import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Copy .env.example to .env and configure it.",
  );
}

export default defineConfig({
  schema: "./src/database/schemas/*",
  out: "./src/database/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
});
