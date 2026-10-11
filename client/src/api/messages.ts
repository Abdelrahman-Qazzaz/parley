import type {
  ChatMessage,
  MessageAttachmentInput,
  MessageImage,
  MessagesResponse,
  MessageTranscript,
  ReplyStreamEvents,
  SendMessageBody,
} from "@summarizer/contract";
import { apiFetch, apiJson, jsonRequest } from "./http";
import type { Server } from "./server";

export type {
  ChatMessage,
  MessageAttachmentInput,
  MessageImage,
  MessagesResponse,
  MessageTranscript,
};

/**
 * How many turns the server replays (messages.controller.ts). The client needs
 * it to predict what a turn will actually send: the prompt is not just the
 * message being written, it is the replayed history as well, and a model has
 * to be able to serve the whole thing.
 */
export const MAX_CONTEXT_MESSAGES = 50;

export type SendMessageInput = SendMessageBody & { conversationId: string };

export async function fetchMessages(
  server: Server,
  conversationId: string,
): Promise<MessagesResponse> {
  const data = await apiJson<MessagesResponse>(
    server,
    `/conversations/${conversationId}/messages`,
  );
  if (!Array.isArray(data?.messages)) {
    throw new Error("Invalid messages response");
  }
  return data;
}

type StreamCallbacks = {
  onDelta: (delta: string) => void;
  onDone: (lastMessageId: string) => void;
};

function dispatchSseEvent(rawEvent: string, callbacks: StreamCallbacks): void {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return;

  // Checked field by field rather than trusted, since a stream can be cut off
  // or come from a proxy's error page.
  const data = JSON.parse(dataLines.join("\n")) as Partial<
    ReplyStreamEvents["delta"] &
      ReplyStreamEvents["done"] &
      ReplyStreamEvents["error"]
  >;
  if (eventName === "delta" && typeof data.delta === "string") {
    callbacks.onDelta(data.delta);
  } else if (eventName === "done" && typeof data.lastMessageId === "string") {
    callbacks.onDone(data.lastMessageId);
  } else if (eventName === "error") {
    throw new Error(
      typeof data.message === "string" ? data.message : "Model response failed",
    );
  }
}

/**
 * Sends the turn and reads the reply off the SSE body. EventSource can't POST,
 * so this is fetch + a reader. The run itself is server-side and finishes even
 * if this stream dies — a failure here means "refetch", not "the turn was lost".
 */
export async function streamMessage(
  server: Server,
  input: SendMessageInput,
  callbacks: StreamCallbacks,
): Promise<void> {
  const response = await apiFetch(
    server,
    `/conversations/${input.conversationId}/messages`,
    jsonRequest("POST", {
      messageContent: input.messageContent,
      chosenModelId: input.chosenModelId,
      attachments: input.attachments,
      lastMessageId: input.lastMessageId,
    } satisfies SendMessageBody),
  );

  if (!response.body) throw new Error("The response stream was empty");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const dispatch = (rawEvent: string) =>
    dispatchSseEvent(rawEvent, {
      onDelta: callbacks.onDelta,
      onDone: (lastMessageId) => {
        completed = true;
        callbacks.onDone(lastMessageId);
      },
    });

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) dispatch(event);
    if (done) break;
  }

  if (buffer.trim()) dispatch(buffer);
  if (!completed) throw new Error("The response stream ended unexpectedly");
}
