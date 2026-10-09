import { defineConfig } from "drizzle-kit";

/**
 * For `drizzle-kit generate` only. The API applies the migrations itself at
 * startup.
 */
export default defineConfig({
  schema: "./shared/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
