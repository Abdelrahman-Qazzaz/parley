import { verifyServices } from "../shared/preflight";
import { mq } from "../shared/message-queue/messageQueue";
import { pingDb } from "../shared/db";
import { bucket } from "../shared/storage";
import { cache } from "../shared/cache";
import { chat } from "../shared/ai";
import { workos } from "./src/auth/auth";
import { UPLOAD_CONFIRM_WINDOW_MS } from "../shared/uploads";

/**
 * Fail-fast preflight for the API: aborts startup if any third-party
 * dependency is unavailable.
 */
export function verifyApiServices(): Promise<void> {
  return verifyServices([
    { name: "RabbitMQ", check: mq.ping },
    { name: "Postgres", check: pingDb },
    { name: "Supabase Storage", check: bucket.ping },
    // Also only the API's concern: the limits guard the uploads it hands out.
    {
      name: "Supabase Storage bucket settings",
      check: bucket.verifySettings,
    },
    // Only the API hands out upload URLs, so only it needs their lifetime to
    // fit inside the window an upload can be confirmed in.
    {
      name: "Supabase Storage upload URLs",
      check: () => bucket.verifyUploadUrlLifetime(UPLOAD_CONFIRM_WINDOW_MS),
    },
    { name: "Upstash Redis", check: cache.ping },
    { name: "WorkOS", check: workos.ping },
    { name: "OpenRouter", check: chat.ping },
  ]);
}
