import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * The SQL that creates shared/db/schema.ts's tables, from `drizzle-kit
 * export`, for the integration suites to run in their own schema.
 *
 * drizzle-kit's bin.cjs isn't an exported path, and the npm workspace
 * installs drizzle-kit at the repo root rather than in this package, so it's
 * found beside the package's main entry instead of at a fixed path.
 */
export function exportSchemaSql(): string {
  const require = createRequire(import.meta.url);
  const bin = path.join(
    path.dirname(require.resolve("drizzle-kit")),
    "bin.cjs",
  );
  return execFileSync(
    process.execPath,
    [
      bin,
      "export",
      "--dialect",
      "postgresql",
      "--schema",
      "./shared/db/schema.ts",
    ],
    { encoding: "utf8" },
  );
}
