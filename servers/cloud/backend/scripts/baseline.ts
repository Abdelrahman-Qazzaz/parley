/**
 * Adopt a database whose schema was made with `drizzle-kit push` into
 * migrations.
 *
 * The tables exist but drizzle has no record of the migrations that make
 * them, so `migrate` would try to CREATE them over live data and fail. This
 * records each migration as already applied, matching exactly what drizzle's
 * migrator writes: sha256 of the .sql file, and the journal's `when` as
 * created_at. Everything generated later is newer and applies normally.
 *
 * It first checks that every table and column the migrations make is already
 * there (test/unit/migrations.test.ts keeps those the same as schema.ts's), so
 * run `npm run db` (push) first if the database is behind. A database
 * baselined before the migrations were squashed has their old rows; they're
 * left alone, since the migrator only reads the newest.
 *
 * Run once per database, then never again; running it again finds nothing to
 * record.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import postgres from "postgres";
import { getDatabaseUrl } from "../src/env";
import { MIGRATIONS_FOLDER } from "./migrations";

type JournalEntry = { idx: number; tag: string; when: number };

function readJournal(): JournalEntry[] {
  const path = `${MIGRATIONS_FOLDER}/meta/_journal.json`;
  const journal = JSON.parse(fs.readFileSync(path, "utf8")) as {
    entries: JournalEntry[];
  };
  return journal.entries;
}

function hashOf(tag: string): string {
  const sql = fs.readFileSync(`${MIGRATIONS_FOLDER}/${tag}.sql`, "utf8");
  return crypto.createHash("sha256").update(sql).digest("hex");
}

/**
 * "table.column" for every column the migrations make, from the snapshot
 * drizzle-kit keeps of the schema as of the newest one.
 */
function expectedColumns(newest: JournalEntry): string[] {
  const path = `${MIGRATIONS_FOLDER}/meta/${String(newest.idx).padStart(4, "0")}_snapshot.json`;
  const snapshot = JSON.parse(fs.readFileSync(path, "utf8")) as {
    tables: Record<string, { name: string; columns: Record<string, unknown> }>;
  };
  return Object.values(snapshot.tables).flatMap(({ name, columns }) =>
    Object.keys(columns).map((column) => `${name}.${column}`),
  );
}

const client = postgres(getDatabaseUrl(), { max: 1, prepare: false });

try {
  const entries = readJournal();
  if (entries.length === 0) {
    throw new Error("No migrations to baseline — run db:generate first.");
  }

  // Baselining a database that lacks part of the schema would mark it as
  // created without creating it, and the failure would surface much later.
  const present = new Set(
    (
      await client<{ column: string }[]>`
        select table_name || '.' || column_name as column
        from information_schema.columns where table_schema = 'public'
      `
    ).map((row) => row.column),
  );
  const expected = expectedColumns(entries[entries.length - 1]);
  const missing = expected.filter((column) => !present.has(column));
  if (missing.length === expected.length) {
    throw new Error(
      "This database has none of the schema. Run `npm run db:migrate` " +
        "against it instead; baselining would skip creating it.",
    );
  }
  if (missing.length > 0) {
    throw new Error(
      `This database is behind schema.ts — missing: ${missing.join(", ")}.\n` +
        "Run `npm run db` (push) against it first, then baseline.",
    );
  }

  await client`create schema if not exists drizzle`;
  await client`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `;

  const recorded = new Set(
    (
      await client<{ hash: string }[]>`
        select hash from drizzle.__drizzle_migrations
      `
    ).map((row) => row.hash),
  );
  const unrecorded = entries.filter(
    (entry) => !recorded.has(hashOf(entry.tag)),
  );
  if (unrecorded.length === 0) {
    console.log("Already baselined: every migration is recorded.");
  }

  for (const entry of unrecorded) {
    await client`
      insert into drizzle.__drizzle_migrations ("hash", "created_at")
      values (${hashOf(entry.tag)}, ${entry.when})
    `;
    console.log(`Recorded ${entry.tag} as already applied`);
  }
  if (unrecorded.length > 0) {
    console.log("`npm run db:migrate` will now report nothing to apply.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
