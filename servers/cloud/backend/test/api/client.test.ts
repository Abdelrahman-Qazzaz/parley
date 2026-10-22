import { describe, expect, it, vi } from "vitest";

/**
 * A built client of two files, for this file's app to serve. Hoisted: the
 * API's env is read while its modules load, before any hook runs.
 */
vi.hoisted(async () => {
  const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const dir = mkdtempSync(path.join(tmpdir(), "client-"));
  writeFileSync(
    path.join(dir, "index.html"),
    "<!doctype html><title>app</title>",
  );
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
  process.env.CLIENT_DIR = dir;
});

import { createApp } from "../../src/app";

async function get(urlPath: string) {
  return (await createApp()).request(`http://localhost${urlPath}`);
}

describe("the built client", () => {
  it("is served from the API's own origin", async () => {
    const res = await get("/assets/app.js");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("javascript");
    expect(await res.text()).toBe("console.log(1)");
  });

  it("answers the client's own routes with its page", async () => {
    const res = await get("/chat/550e8400-e29b-41d4-a716-446655440000");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<title>app</title>");
  });

  it("serves the page at the root, where the client starts", async () => {
    const res = await get("/");

    expect(await res.text()).toContain("<title>app</title>");
  });

  it("leaves any other path to the API, which 404s one it doesn't have", async () => {
    const res = await get("/no/such/path");

    expect(res.status).toBe(404);
  });

  it("leaves the API's routes to the API", async () => {
    const res = await get("/conversations");

    // Signed out, so the API's own answer rather than the page.
    expect(res.status).toBe(401);
  });
});
