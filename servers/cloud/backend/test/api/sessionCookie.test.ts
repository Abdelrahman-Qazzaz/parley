import { describe, it, expect, afterEach, vi } from "vitest";
import { Hono, type Context } from "hono";
import { COOKIE_KEYS } from "../../src/cookies/session";

/**
 * The auth cookies' attributes decide whether login works at all, and they
 * are invisible until a browser silently drops the cookie. Pin them here.
 *
 * NODE_ENV is read through getEnv(), which caches on first call, so each
 * case resets the module graph and re-imports rather than mutating the env of
 * an already-initialised module.
 */
async function setCookieHeadersFor(
  nodeEnv: "production" | "development",
  act: (
    cookies: typeof import("../../src/cookies/session"),
    c: Context,
  ) => void,
): Promise<Record<string, string>> {
  vi.resetModules();
  process.env.NODE_ENV = nodeEnv;
  const cookies = await import("../../src/cookies/session");

  const app = new Hono();
  app.get("/", (c) => {
    act(cookies, c);
    return c.body(null);
  });

  const res = await app.request("http://localhost/");
  return Object.fromEntries(
    res.headers
      .getSetCookie()
      .map((header) => [header.split("=")[0], header.toLowerCase()]),
  );
}

const setBoth = (
  { setAuthCookies }: typeof import("../../src/cookies/session"),
  c: Context,
) =>
  setAuthCookies(c, {
    accessToken: "access-value",
    refreshToken: "refresh-value",
  });

describe("auth cookie attributes", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
    vi.resetModules();
  });

  it("are SameSite=Lax, HttpOnly and Secure in production", async () => {
    // The API serves the client there, so the cookies are first-party. Never
    // None: Safari drops third-party cookies.
    const headers = await setCookieHeadersFor("production", setBoth);
    for (const name of [COOKIE_KEYS.session, COOKIE_KEYS.refresh]) {
      expect(headers[name]).toContain("samesite=lax");
      expect(headers[name]).toContain("secure");
      expect(headers[name]).toContain("httponly");
    }
  });

  it("are SameSite=Lax and not Secure outside production", async () => {
    // Locally both sides are localhost over plain HTTP, where Secure would
    // stop the cookie being stored at all.
    const headers = await setCookieHeadersFor("development", setBoth);
    for (const name of [COOKIE_KEYS.session, COOKIE_KEYS.refresh]) {
      expect(headers[name]).toContain("samesite=lax");
      expect(headers[name]).not.toContain("secure");
    }
  });

  it("only send the refresh token to the endpoint that spends it", async () => {
    const headers = await setCookieHeadersFor("production", setBoth);
    expect(headers[COOKIE_KEYS.session]).toContain("path=/;");
    expect(headers[COOKIE_KEYS.refresh]).toContain("path=/auth/refresh");
  });

  it("clear with the same attributes they were set with", async () => {
    // A delete whose attributes do not match leaves the original cookie in
    // place, so logout would appear to work and not.
    const set = await setCookieHeadersFor("production", setBoth);
    const cleared = await setCookieHeadersFor(
      "production",
      ({ clearAuthCookies }, c) => clearAuthCookies(c),
    );
    for (const name of [COOKIE_KEYS.session, COOKIE_KEYS.refresh]) {
      const attributes = (header: string) =>
        header
          .split("; ")
          .slice(1)
          .filter((part) => !/^(max-age|expires)=/.test(part))
          .sort();
      expect(attributes(cleared[name])).toEqual(attributes(set[name]));
      expect(cleared[name]).toMatch(/max-age=0|expires=/);
    }
  });
});
