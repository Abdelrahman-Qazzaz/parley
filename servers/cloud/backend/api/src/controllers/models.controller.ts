import type { Context } from "hono";
import { listChatModels } from "../../../shared/ai/ai_chat_client";
import { listTranscribeModels } from "../../../shared/ai/ai_transcribe_client";

export async function handleGetModels(c: Context) {
  return c.json({ models: await listChatModels() });
}

export async function handleGetTranscribeModels(c: Context) {
  return c.json({ models: await listTranscribeModels() });
}
