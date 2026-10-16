import type {
  ChatModel,
  ModelsResponse,
  TranscribeModel,
} from "@parley/shared/contract";
import { listChatModels } from "../../../shared/ai/ai_chat_client";
import { listTranscribeModels } from "../../../shared/ai/ai_transcribe_client";
import { authed } from "../middleware/auth.middleware";

export const handleGetModels = authed.createHandlers(async (c) => {
  return c.json({
    models: await listChatModels(),
  } satisfies ModelsResponse<ChatModel>);
});

export const handleGetTranscribeModels = authed.createHandlers(async (c) => {
  return c.json({
    models: await listTranscribeModels(),
  } satisfies ModelsResponse<TranscribeModel>);
});
