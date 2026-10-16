import { createEventHub } from "@parley/shared/events";

/**
 * The GET /events streams this instance's clients hold open, by user id: a
 * user hears only their own jobs' events.
 */
export const events = createEventHub<string>();
