import { describe, expect, it } from "vitest";
import {
  DATABASE_POOL,
  MIGRATION_CONNECTIONS,
  SESSION_POOLER_CLIENT_LIMIT,
} from "../../src/db/pool";

describe("database pool", () => {
  it("fits the session pooler beside a local API and a deploy's migration", () => {
    const deployedApi = DATABASE_POOL.size;
    const localApi = DATABASE_POOL.size;

    expect(deployedApi + localApi + MIGRATION_CONNECTIONS).toBeLessThanOrEqual(
      SESSION_POOLER_CLIENT_LIMIT,
    );
  });

  it("never warms more connections than it may hold", () => {
    expect(DATABASE_POOL.connectionsToWarm).toBeLessThanOrEqual(
      DATABASE_POOL.size,
    );
  });
});
