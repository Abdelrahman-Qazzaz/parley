import type { Context } from "hono";
import { CTX_KEYS } from "../../../shared/keys";
import { events } from "../events";

/** GET /events — the signed-in user's job updates, while they hold it open. */
export function handleEvents(c: Context) {
  const userId: string = c.get(CTX_KEYS.userId);
  return events.stream(c, userId);
}
