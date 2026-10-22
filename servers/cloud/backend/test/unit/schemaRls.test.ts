import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema";

describe("schema", () => {
  // Supabase's Data API lets anyone holding the project's public (anon) key
  // read and write every public table that has row-level security off. The
  // server connects as the table owner or with the service-role key, both of
  // which bypass RLS, so RLS with no policies only shuts that door.
  it("turns on row-level security for every table", () => {
    const tables = Object.values(schema).filter((value) => is(value, PgTable));
    const withoutRls = tables
      .map((table) => getTableConfig(table))
      .filter((config) => !config.enableRLS)
      .map((config) => config.name);

    expect(tables.length).toBeGreaterThan(0);
    expect(withoutRls).toEqual([]);
  });
});
