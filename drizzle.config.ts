// Drizzle Kit config. Reads schema, writes migrations to ./drizzle/migrations.
//
// Usage:
//   npm run db:generate    # generate migration SQL from schema diff
//   npm run db:migrate     # apply pending migrations to DATABASE_URL
//   npm run db:studio      # browse data in a local web UI
//
// dotenv loads .env.local explicitly because drizzle-kit doesn't auto-
// pick up Next.js's .env.local convention — only plain .env.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/journey/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
