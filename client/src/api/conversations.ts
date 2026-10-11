import { conversationEndpoint, conversationsEndpoint } from "../config";
import type {
  Conversation,
  ConversationsResponse,
  RenameConversationBody,
} from "@summarizer/contract";
import { apiFetch, apiJson, jsonRequest } from "./http";

export type { Conversation };

export async function fetchConversations(): Promise<Conversation[]> {
  const data = await apiJson<ConversationsResponse>(conversationsEndpoint());
  if (!Array.isArray(data?.conversations)) {
    throw new Error("Invalid conversations response");
  }
  return data.conversations;
}

export async function createConversation(): Promise<Conversation> {
  return apiJson<Conversation>(conversationsEndpoint(), { method: "POST" });
}

export async function renameConversation(
  conversationId: string,
  title: string,
): Promise<Conversation> {
  return apiJson<Conversation>(
    conversationEndpoint(conversationId),
    jsonRequest("PATCH", {
      conversationTitle: title,
    } satisfies RenameConversationBody),
  );
}

export async function deleteConversation(
  conversationId: string,
): Promise<void> {
  await apiFetch(conversationEndpoint(conversationId), { method: "DELETE" });
}
