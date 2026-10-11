import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { COOKIE_KEYS } from "../../../shared/keys";
import { getApiEnv } from "../../../shared/env";

/**
 * The API serves the client in production, so the cookie only ever travels
 * to its own site and `Lax` is enough. A browser won't send it with another
 * site's POST at all, which a third-party (`None`) cookie needed `csrf()` in
 * app.ts to make up for. Safari refuses third-party cookies outright.
 *
 * `Secure` in production only: locally the client and the API share
 * `localhost` over plain HTTP, where it would stop the cookie being stored.
 */
function sessionCookieOptions(path = "/") {
  return {
    httpOnly: true,
    secure: getApiEnv().NODE_ENV === "production",
    sameSite: "Lax" as const,
    path,
  };
}

/**
 * The refresh token is only ever read by the endpoint that spends it, so
 * the browser sends it there and nowhere else.
 */
const REFRESH_COOKIE_PATH = "/auth/refresh";

export function setSessionToken(c: Context, token: string): void {
  setCookie(c, COOKIE_KEYS.session, token, sessionCookieOptions());
}

export function setRefreshToken(c: Context, token: string): void {
  setCookie(
    c,
    COOKIE_KEYS.refresh,
    token,
    sessionCookieOptions(REFRESH_COOKIE_PATH),
  );
}

/**
 * The attributes have to match the ones the cookie was set with, or the
 * browser treats this as a different cookie and keeps the original.
 */
export function clearSessionToken(c: Context): void {
  deleteCookie(c, COOKIE_KEYS.session, sessionCookieOptions());
}

export function clearRefreshToken(c: Context): void {
  deleteCookie(
    c,
    COOKIE_KEYS.refresh,
    sessionCookieOptions(REFRESH_COOKIE_PATH),
  );
}
