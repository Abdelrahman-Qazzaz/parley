import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { COOKIE_KEYS } from "../../shared/keys";

/**
 * The session cookie's attributes decide whether login works at all, and they
 * are invisible until a browser silently drops the cookie. Pin them here.
 *
 * NODE_ENV is read through getApiEnv(), which caches on first call, so each
 * case resets the module graph and re-imports rather than mutating the env of
 * an already-initialised module.
 */
async function setCookieHeaderFor(
  nodeEnv: "production" | "development",
): Promise<string> {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;
  const { setSessionToken } = await import("../../api/src/cookies/session");

  const app = new Hono();
  app.get("/", (c) => {
    setSessionToken(c, "token-value");
    return c.body(null);
  });

  const res = await app.request("http://localhost/");
  return res.headers.get("Set-Cookie") ?? "";
}

describe("session cookie attributes", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
    vi.resetModules();
  });

  it("is SameSite=Lax and Secure in production", async () => {
    // The API serves the client there, so the cookie is first-party. Never
    // None: Safari drops third-party cookies.
    const header = (await setCookieHeaderFor("production")).toLowerCase();
    expect(header).toContain(`${COOKIE_KEYS.session.toLowerCase()}=`);
    expect(header).toContain("samesite=lax");
    expect(header).toContain("secure");
    expect(header).toContain("httponly");
  });

  it("is SameSite=Lax and not Secure outside production", async () => {
    // Locally both sides are localhost over plain HTTP, where Secure would
    // stop the cookie being stored at all.
    const header = (await setCookieHeaderFor("development")).toLowerCase();
    expect(header).toContain("samesite=lax");
    expect(header).not.toContain("secure");
  });

  it("clears with the same attributes it was set with", async () => {
    // A delete whose attributes do not match leaves the original cookie in
    // place, so logout would appear to work and not.
    vi.resetModules();
    process.env.NODE_ENV = "production";
    const { clearSessionToken } = await import("../../api/src/cookies/session");

    const app = new Hono();
    app.get("/", (c) => {
      clearSessionToken(c);
      return c.body(null);
    });

    const header = (
      (await app.request("http://localhost/")).headers.get("Set-Cookie") ?? ""
    ).toLowerCase();
    expect(header).toContain("samesite=lax");
    expect(header).toContain("secure");
    expect(header).toMatch(/max-age=0|expires=/);
  });
});
