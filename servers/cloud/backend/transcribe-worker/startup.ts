import { transcription } from "../shared/ai";
import { bucket } from "../shared/storage";
import { pingDb } from "../shared/db";
import { mq } from "../shared/message-queue/messageQueue";
import { verifyServices } from "../shared/preflight";

export function verifyTranscribeWorkerServices(): Promise<void> {
  return verifyServices([
    { name: "RabbitMQ", check: mq.ping },
    { name: "Postgres", check: pingDb },
    { name: "Supabase Storage", check: bucket.ping },
    { name: "Deepgram", check: transcription.ping },
  ]);
}
