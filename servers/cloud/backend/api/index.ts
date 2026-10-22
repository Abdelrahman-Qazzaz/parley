const env = getApiEnv();

import { getApiEnv } from "../shared/env";
import { events } from "./src/events";

import { mq } from "../shared/message-queue/messageQueue";
import { data } from "../shared/data";
import { sweeper } from "../shared/sweeper";
import { onShutdown } from "@parley/shared/shutdown";
import {
  getTranscriptionConcurrency,
  handleTranscribeJob,
} from "./src/transcribeJob";

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

/**
 * Every attempt at an audio job can be a billed Deepgram call (which retries
 * once on its own), so a failed job gets one more try, not several.
 */
const TRANSCRIBE_ATTEMPTS = 2;

await mq.consume(mq.queues.TRANSCRIBE, handleTranscribeJob, {
  attempts: TRANSCRIBE_ATTEMPTS,
  prefetch: await getTranscriptionConcurrency(),
});
// Captions are stored as they arrive, with no Deepgram call, so one at a time
// keeps up.
await mq.consume(mq.queues.CAPTION_TRANSCRIPT, handleTranscribeJob, {
  attempts: TRANSCRIBE_ATTEMPTS,
});
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

// Every instance schedules it; the sweep's own lock keeps them from
// overlapping.
const stopSweeper = sweeper.schedule();

/**
 * Stop taking work, then let go of the connections.
 *
 * Transcriptions in progress get the grace period to finish rather than
 * paying Deepgram twice for them. Abandoning one would still be correct: its
 * delivery goes unacked and the next process reclaims the job under a new
 * claim token, so a transcription that outlasts the grace is simply
 * redelivered.
 *
 * A reply streaming when this fires is not lost: the model run is deliberately
 * decoupled from the response stream, so the turn still completes and is
 * stored, and the client refetches it. The conversation claim it holds is
 * covered by its lease, so even a hard kill frees the conversation rather than
 * locking it.
 */
onShutdown(
  async () => {
    await Promise.all([mq.stopConsuming(), stopSweeper()]);
    // An open event stream would hold the server open until it ended.
    await events.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mq.close();
  },
  { graceMs: 30_000 },
);
