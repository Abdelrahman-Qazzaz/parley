const env = getApiEnv();

import { getApiEnv } from "../shared/env";
import { startSocketServer } from "./src/sockets/socketManager";
import { EVERYONE, events } from "./src/events";

import { mq } from "../shared/message-queue/messageQueue";
import { resumeUnfinishedJobs } from "../shared/audioTranscription";
import { data } from "../shared/data";
import { closeDb, migrateDb } from "../shared/db";
import { onShutdown } from "@summarizer/shared/shutdown";
import { files } from "../shared/files";
import { logger } from "@summarizer/shared/logger";
import { handleTranscribeJob } from "./src/transcribeJob";
import { handleYoutubeFetch } from "./src/youtubeFetch";

import { serve } from "@hono/node-server";
import { createApp } from "./app";

await migrateDb();

// Before anything can write a file, so none is mid-write.
const orphans = await files.removeOrphans(
  await data.attachments.findAttachmentIds(),
);
if (orphans > 0) logger.info("Removed files no row uses", { count: orphans });

// createApp() runs the fail-fast preflight: if any third-party dependency is
// down, the API never starts.
const app = await createApp();
const port = env.PORT;

// Before the consumers start, so what the last run left unfinished goes first.
await resumeUnfinishedJobs();

// Listening starts here; the socket server then uses this same server,
// so the API and the websocket share one port. Only on the loopback
// interface: nothing on the network can reach it.
const hostname = "127.0.0.1";
const server = serve({ fetch: app.fetch, port, hostname }, () => {
  logger.info(`Listening on http://${hostname}:${port}`);
});
const io = startSocketServer(server);

mq.consume(
  mq.queues.TRANSCRIBE_DONE,
  ({ audioUploadId }) => {
    io.emit("jobUpdated", { audioUploadId });
    events.send(EVERYONE, "jobUpdated", { audioUploadId });
  },
  { attempts: 1 },
);
// The YouTube fetch retries on its own, so the message gets one attempt.
mq.consume(mq.queues.YT_FETCH, handleYoutubeFetch, { attempts: 1 });
// The fetch couldn't get the audio: mark the job failed and notify the user.
// The row was created by POST /upload/youtube.
mq.consume(
  mq.queues.YT_FETCH_FAILED,
  async ({ audioUploadId, error }) => {
    await data.jobs.failAudioJobById(
      audioUploadId,
      error ?? "Failed to fetch YouTube audio",
    );
    io.emit("jobUpdated", { audioUploadId });
    events.send(EVERYONE, "jobUpdated", { audioUploadId });
  },
  { attempts: 2 },
);

/**
 * Every attempt at an audio job transcribes the whole file again, which can
 * take minutes, so a failed job gets one more try, not several.
 */
const TRANSCRIBE_ATTEMPTS = 2;

mq.consume(mq.queues.TRANSCRIBE, handleTranscribeJob, {
  attempts: TRANSCRIBE_ATTEMPTS,
});
mq.consume(mq.queues.CAPTION_TRANSCRIPT, handleTranscribeJob, {
  attempts: TRANSCRIBE_ATTEMPTS,
});

/**
 * Stop taking work, then let go of the connections.
 *
 * The transcription in progress gets the grace period to finish rather than
 * running again from the start. Abandoning it would still be correct: the
 * next startup queues every unfinished job again, so a transcription that
 * outlasts the grace period simply runs again.
 *
 * A reply streaming when this fires is not lost: the model run is deliberately
 * decoupled from the response stream, so the turn still completes and is
 * stored, and the client refetches it. The conversation claim it holds is
 * covered by its lease, so even a hard kill frees the conversation rather than
 * locking it.
 */
onShutdown(
  async () => {
    await mq.stopConsuming();
    // An open event stream would hold the server open until it ended.
    await events.close();
    // io owns its HTTP server, so closing it closes both.
    // The second close is a belt-and-braces no-op and must not reject on
    // "server is not running".
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeDb();
  },
  { graceMs: 30_000 },
);
