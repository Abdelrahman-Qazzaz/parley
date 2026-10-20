const env = getApiEnv();

import { getApiEnv } from "../shared/env";
import { events } from "./src/events";

import { mq } from "../shared/message-queue/messageQueue";
import { data } from "../shared/data";
import { onShutdown } from "@parley/shared/shutdown";

import { serve } from "@hono/node-server";
import { createApp } from "./app";

// createApp() runs the fail-fast preflight: if any third-party dependency is
// down (incl. RabbitMQ, which it also connects), the API never starts.
const app = await createApp();
const port = env.PORT;

/**
 * How long an idle keep-alive connection stays open. Caddy reuses its
 * connections to the API, and if Node closes one first (by default after
 * about 6 s), a request Caddy sends on it at that moment is reset and the
 * user's request fails. So this outlasts the 60 s Caddy keeps an idle one
 * (deploy/parley.caddy); keep it above that. Shutdown isn't held up by it:
 * server.close() drops idle connections at once.
 */
const KEEP_ALIVE_TIMEOUT_MS = 65_000;

const server = serve({
  fetch: app.fetch,
  port,
  serverOptions: { keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS },
});

await mq.consume(
  mq.queues.TRANSCRIBE_DONE,
  ({ audioUploadId, userId }) => {
    events.send(userId, "jobUpdated", { audioUploadId });
  },
  { attempts: 1 },
);
// youtube-fetcher couldn't download/upload the audio: mark the job failed and
// notify the user. The row was created by POST /upload/youtube.
await mq.consume(
  mq.queues.YT_FETCH_FAILED,
  async ({ audioUploadId, userId, error }) => {
    await data.jobs.failAudioJobById(
      audioUploadId,
      error ?? "Failed to fetch YouTube audio",
    );
    events.send(userId, "jobUpdated", { audioUploadId });
  },
  { attempts: 2 },
);

/**
 * Stop taking work, then let go of the connections.
 *
 * A reply streaming when this fires is not lost: the model run is deliberately
 * decoupled from the response stream, so the turn still completes and is
 * stored, and the client refetches it. The conversation claim it holds is
 * covered by its lease, so even a hard kill frees the conversation rather than
 * locking it.
 */
onShutdown(async () => {
  await mq.stopConsuming();
  // An open event stream would hold the server open until it ended.
  await events.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mq.close();
});
