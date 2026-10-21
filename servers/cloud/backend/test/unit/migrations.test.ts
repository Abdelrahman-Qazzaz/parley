import fs from "node:fs";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { describe, expect, it } from "vitest";
import * as schema from "../../shared/db/schema";
import { MIGRATIONS_FOLDER } from "../../scripts/migrations";

type Journal = { entries: { idx: number; tag: string }[] };

/** The schema as of the newest migration, which drizzle-kit snapshots. */
function latestSnapshot() {
  const journal = JSON.parse(
    fs.readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"),
  ) as Journal;
  const { idx } = journal.entries[journal.entries.length - 1];
  const file = `${MIGRATIONS_FOLDER}/meta/${String(idx).padStart(4, "0")}_snapshot.json`;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Parameters<
    typeof generateMigration
  >[0];
}

describe("migrations", () => {
  // Deploys build the database from drizzle/, not from schema.ts. A change
  // to schema.ts without `npm run db:generate` would reach every developer's
  // database through `npm run db` and never reach a deploy's.
  it("match schema.ts", async () => {
    const snapshot = latestSnapshot();
    const current = generateDrizzleJson(schema, snapshot.id);

    // A rename makes drizzle-kit ask which it was, and with no terminal to ask
    // in it rejects instead, which fails this the same way.
    await expect(generateMigration(snapshot, current)).resolves.toEqual([]);
  });
});
