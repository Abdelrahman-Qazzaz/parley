import { authed } from "../middleware/auth.middleware";
import { events } from "../events";

/** GET /events — the signed-in user's job updates, while they hold it open. */
export const handleEvents = authed.createHandlers((c) =>
  events.stream(c, c.var.userId),
);
