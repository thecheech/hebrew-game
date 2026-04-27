import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.local" });
dotenv.config();

/**
 * Prisma Migrate needs a direct (non-pooled) Postgres URL when `DATABASE_URL` points at PgBouncer.
 * Vercel Neon integration sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
 * Locally, copy both strings from the Neon dashboard (pooling on vs off).
 */
function migrationDatabaseUrl(): string | undefined {
  return (
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationDatabaseUrl(),
  },
});
