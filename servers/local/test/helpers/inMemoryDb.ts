import { openDatabase } from "../../shared/db/connect";
import * as schema from "../../shared/db/schema";

/**
 * shared/db against a fresh in-memory database, opened and migrated the way
 * the API opens and migrates the real one. For `vi.mock("../../shared/db",
 * ...)`: each test file gets its own.
 */
export async function inMemoryDbModule() {
  const database = openDatabase(":memory:");
  await database.migrate();
  return {
    ...schema,
    db: database.db,
    migrateDb: async () => {},
    closeDb: database.close,
  };
}

/**
 * Empties every table, parents last: conversations take their messages and
 * links with them, attachments their jobs, transcripts and reservations.
 */
export async function deleteAllRows(
  db: Awaited<ReturnType<typeof inMemoryDbModule>>["db"],
) {
  await db.delete(schema.Conversations);
  await db.delete(schema.Attachments);
}
