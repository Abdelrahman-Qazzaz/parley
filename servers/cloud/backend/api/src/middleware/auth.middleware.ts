import { createFactory, createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";

import { COOKIE_KEYS } from "../../../shared/keys";
import { logger } from "@parley/shared/logger";
import { verifyAccessToken } from "../auth/accessToken";

/** What requireAuth puts on the context of every route behind it. */
export type AuthEnv = {
  Variables: {
    userId: string;
    sessionExpiresAtEpochSeconds: number;
  };
};

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, COOKIE_KEYS.session);
  if (!token) return c.json({ message: "Unauthorized" }, 401);
  try {
    const { userId, expiresAtEpochSeconds } = await verifyAccessToken(token);
    c.set("userId", userId);
    c.set("sessionExpiresAtEpochSeconds", expiresAtEpochSeconds);
    await next();
  } catch (error) {
    logger.debug("Session token verification failed", { error: String(error) });
    return c.json({ message: "Unauthorized" }, 401);
  }
});

/**
 * Builds the handlers of a route behind requireAuth: `c.var.userId` is typed,
 * and validators listed ahead of the handler type `c.req.valid(...)`.
 * `authed.createHandlers(validate("json", schema), async (c) => …)`
 */
export const authed = createFactory<AuthEnv>();
