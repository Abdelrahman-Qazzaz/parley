import { logger, messageOf } from "@parley/shared/logger";
import { mq } from "./message-queue/messageQueue";
import { pingDb } from "./db";
import { bucket } from "./storage";
import { cache } from "./cache";
import { chat, transcription } from "./ai";
import { workos } from "./auth/auth";
import { UPLOAD_CONFIRM_WINDOW_MS } from "./uploads";

type ServiceCheck = {
  /** Human-readable service name, shown in the startup error. */
  name: string;
  /** Lightweight call that rejects if the service is unavailable. */
  check: () => Promise<unknown>;
};

/**
 * Runs every health check and aborts startup if any third-party service is
 * unavailable. Checks run concurrently so a single boot reports *all* failing
 * services at once rather than one at a time.
 */
async function verifyServices(checks: ServiceCheck[]): Promise<void> {
  const results = await Promise.allSettled(checks.map((c) => c.check()));

  const failures = results.flatMap((result, i) =>
    result.status === "rejected"
      ? [{ name: checks[i].name, reason: result.reason }]
      : [],
  );

  if (failures.length > 0) {
    for (const { name, reason } of failures)
      logger.error(`Service unavailable at startup: ${name}`, reason);

    const detail = failures
      .map(({ name, reason }) => {
        return `  - ${name}: ${messageOf(reason)}`;
      })
      .join("\n");
    throw new Error(
      `Startup aborted — the following services are unavailable:\n${detail}`,
    );
  }
}

/**
 * Fail-fast preflight for the API: aborts startup if any third-party
 * dependency is unavailable.
 */
export function verifyApiServices(): Promise<void> {
  return verifyServices([
    { name: "RabbitMQ", check: mq.ping },
    { name: "Postgres", check: pingDb },
    { name: "Supabase Storage", check: bucket.ping },
    // The size and type limits on what the upload URLs accept.
    {
      name: "Supabase Storage bucket settings",
      check: bucket.verifySettings,
    },
    // An upload URL has to expire inside the window its upload can be
    // confirmed in.
    {
      name: "Supabase Storage upload URLs",
      check: () => bucket.verifyUploadUrlLifetime(UPLOAD_CONFIRM_WINDOW_MS),
    },
    { name: "Upstash Redis", check: cache.ping },
    { name: "WorkOS", check: workos.ping },
    { name: "OpenRouter", check: chat.ping },
    { name: "Deepgram", check: transcription.ping },
  ]);
}
