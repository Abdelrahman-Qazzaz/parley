import { createEventHub } from "@parley/shared/events";

/** The local server has one user, so every open stream hears every event. */
export const EVERYONE = "everyone";

/** The GET /events streams this server's clients hold open. */
export const events = createEventHub<typeof EVERYONE>();
