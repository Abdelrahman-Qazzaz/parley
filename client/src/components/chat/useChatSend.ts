import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createConversation, type Conversation } from "../../api/conversations";
import { ApiError, errorMessage } from "../../api/http";
import {
  fetchMessages,
  streamMessage,
  type ChatMessage,
  type MessageAttachmentInput,
  type MessagesResponse,
} from "../../api/messages";
import { queryKeys } from "../../lib/queryClient";
import { useServer } from "../../hooks/server/useServer";
import { useToast } from "../../hooks/toast/useToast";
import { stageSource, type StagedSource } from "../../sources/types";
import type { PendingTurn } from "./types";
import { localId } from "../../lib/localId";

/** Deltas arrive faster than a long reply can be re-parsed; batch them. */
const FLUSH_INTERVAL_MS = 80;

/**
 * Collects streamed deltas, handing the text so far to `onFlush` at most once
 * per interval. `stop` drops a flush that is still pending, for the caller
 * that is about to write the finished text itself.
 */
function createDeltaBuffer(onFlush: (text: string) => void) {
  let text = "";
  let timer: number | null = null;

  return {
    get text() {
      return text;
    },
    push(delta: string) {
      text += delta;
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        onFlush(text);
      }, FLUSH_INTERVAL_MS);
    },
    stop() {
      if (timer !== null) window.clearTimeout(timer);
    },
  };
}

/** The record without `keys`, or the record itself when it had none of them. */
function without<T>(
  record: Record<string, T>,
  ...keys: (string | null | undefined)[]
): Record<string, T> {
  const present = keys.filter(
    (key): key is string => key != null && key in record,
  );
  if (present.length === 0) return record;

  const next = { ...record };
  for (const key of present) delete next[key];
  return next;
}

function messageAttachmentsOf(
  sources: StagedSource[],
): MessageAttachmentInput[] {
  const attachments: MessageAttachmentInput[] = [];
  for (const source of sources) {
    if (!source.sourceUploadId) continue;
    attachments.push(
      source.kind === "image"
        ? { type: "image", imageUploadId: source.sourceUploadId }
        : { type: "transcript", audioUploadId: source.sourceUploadId },
    );
  }
  return attachments;
}

/**
 * The turn as it will be stored, built from what the client already has: the
 * text it sent, the sources it staged, and the reply it just streamed. Writing
 * this into the cache is what saves re-downloading the whole conversation
 * after every message.
 *
 * The user message gets a local id because the server only returns the
 * assistant's. The query is marked stale straight after, so the next fetch
 * replaces both with the stored rows.
 */
function toStoredTurns(
  input: { content: string; modelId: string; sources: StagedSource[] },
  conversationId: string,
  assistantId: string,
  assistantContent: string,
): ChatMessage[] {
  const createdAt = new Date().toISOString();
  const user: ChatMessage = {
    id: `local:${localId()}`,
    role: "user",
    content: input.content,
    chosenModelId: null,
    conversationId,
    createdAt,
    attachments: input.sources
      .filter((source) => source.kind === "image" && source.sourceUploadId)
      .map((source) => ({
        imageUploadId: source.sourceUploadId as string,
        fileName: source.name,
        mimeType: source.file?.type ?? "",
        size: source.file?.size ?? 0,
        url: source.previewUrl ?? "",
      })),
    transcriptAttachments: input.sources.flatMap((source) =>
      source.kind !== "image" && source.sourceUploadId
        ? [
            {
              audioUploadId: source.sourceUploadId,
              fileName: source.name,
              source: source.kind,
            },
          ]
        : [],
    ),
  };
  const assistant: ChatMessage = {
    id: assistantId,
    role: "assistant",
    content: assistantContent,
    chosenModelId: input.modelId,
    conversationId,
    createdAt,
    attachments: [],
    transcriptAttachments: [],
  };
  return [user, assistant];
}

/**
 * A stored user message's attachments as composer sources, already uploaded
 * and transcribed, so an edit can resend them and a failed one can hand them
 * back to the composer like a failed send does.
 */
export function sourcesOfMessage(message: ChatMessage): StagedSource[] {
  return [
    ...message.transcriptAttachments.map((transcript) =>
      stageSource({
        kind: transcript.source,
        name: transcript.fileName,
        status: "ready",
        sourceUploadId: transcript.audioUploadId,
      }),
    ),
    ...message.attachments.map((image) =>
      stageSource({
        kind: "image",
        name: image.fileName,
        status: "ready",
        sourceUploadId: image.imageUploadId,
        previewUrl: image.url,
      }),
    ),
  ];
}

function toPendingTurn(
  content: string,
  sources: StagedSource[],
  replacesMessageId: string | null,
): PendingTurn {
  return {
    content,
    replacesMessageId,
    images: sources
      .filter((source) => source.kind === "image")
      .map((source) => ({
        imageUploadId: source.sourceUploadId ?? source.localId,
        fileName: source.name,
        url: source.previewUrl ?? "",
      })),
    transcripts: sources.flatMap((source) =>
      source.kind !== "image"
        ? [
            {
              audioUploadId: source.sourceUploadId ?? source.localId,
              fileName: source.name,
              source: source.kind,
            },
          ]
        : [],
    ),
    assistantContent: "",
  };
}

type TurnInput = {
  content: string;
  modelId: string;
  sources: StagedSource[];
  lastMessageId: string | null;
  /** Puts the message back in the composer when the turn didn't take. */
  onRestore: (
    content: string,
    sources: StagedSource[],
    draftKey: string,
  ) => void;
};

type SendInput = TurnInput & {
  conversationId: string | undefined;
  /** Called once the conversation exists, before the reply starts. */
  onConversation: (conversationId: string) => void;
};

type EditInput = TurnInput & {
  conversationId: string;
  /** The user message being replaced, along with everything after it. */
  message: ChatMessage;
};

/** Ids the client made up for a turn it wrote into the cache itself. */
function isLocalId(id: string) {
  return id.startsWith("local:");
}

/**
 * Owns the turns that are mid-flight. Keyed by conversation so a reply streaming
 * in one chat keeps streaming while you read or write in another.
 */
export function useChatSend() {
  const server = useServer();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pendingTurns, setPendingTurns] = useState<Record<string, PendingTurn>>(
    {},
  );
  const [sendingKeys, setSendingKeys] = useState<Record<string, boolean>>({});

  const dropPending = useCallback((conversationId: string) => {
    setPendingTurns((current) => without(current, conversationId));
  }, []);

  /**
   * The id the server knows a message by. A turn this client just sent sits
   * in the cache under a made-up id until the next fetch, so look it up by
   * position: the stored history lists the same messages in the same order.
   */
  const storedIdOf = useCallback(
    async (conversationId: string, message: ChatMessage) => {
      if (!isLocalId(message.id)) return message.id;

      const key = queryKeys.messages(server.id, conversationId);
      const position = (
        queryClient.getQueryData<MessagesResponse>(key)?.messages ?? []
      ).indexOf(message);
      const stored = await queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => fetchMessages(server, conversationId),
        staleTime: 0,
      });
      const match = stored.messages[position];
      if (position < 0 || match?.role !== "user" || isLocalId(match.id)) {
        throw new Error("This message changed. Reload the chat and try again.");
      }
      return match.id;
    },
    [queryClient, server],
  );

  /**
   * Streams one turn into `target` and writes it into the cache once stored.
   * An edit's turn replaces the edited message and everything after it, on
   * the server and in the cache alike.
   */
  const streamTurn = useCallback(
    async (
      target: string,
      input: TurnInput,
      replaces: { message: ChatMessage; storedId: string } | null,
    ) => {
      setPendingTurns((current) => ({
        ...current,
        [target]: toPendingTurn(
          input.content,
          input.sources,
          // The stored id: finding it may have refetched the history, which
          // replaces a local id the cache held for this message.
          replaces?.storedId ?? null,
        ),
      }));

      let storedAssistantId: string | null = null;
      const deltas = createDeltaBuffer((assistantContent) =>
        setPendingTurns((current) => {
          const turn = current[target];
          if (!turn) return current;
          return { ...current, [target]: { ...turn, assistantContent } };
        }),
      );

      try {
        await streamMessage(
          server,
          {
            conversationId: target,
            messageContent: input.content,
            chosenModelId: input.modelId,
            attachments: messageAttachmentsOf(input.sources),
            lastMessageId: input.lastMessageId,
            ...(replaces ? { replacesMessageId: replaces.storedId } : {}),
          },
          {
            onDelta: (delta) => deltas.push(delta),
            onDone: (lastMessageId) => {
              storedAssistantId = lastMessageId;
            },
          },
        );
      } finally {
        deltas.stop();
      }

      // Write the finished turn into the cache rather than refetching the
      // conversation: the whole history came down the wire after every
      // message, and it only grows. Cancel first so an in-flight fetch can't
      // land on top of this.
      await queryClient.cancelQueries({
        queryKey: queryKeys.messages(server.id, target),
      });
      queryClient.setQueryData<MessagesResponse>(
        queryKeys.messages(server.id, target),
        (current) => {
          const messages = current?.messages ?? [];
          const kept = replaces
            ? messages.slice(
                0,
                messages.findIndex(
                  (message) =>
                    message.id === replaces.message.id ||
                    message.id === replaces.storedId,
                ),
              )
            : messages;
          return {
            lastMessageId: storedAssistantId ?? current?.lastMessageId ?? null,
            messages: [
              ...kept,
              ...toStoredTurns(
                input,
                target,
                storedAssistantId ?? `local:${localId()}`,
                deltas.text,
              ),
            ],
          };
        },
      );
      dropPending(target);
      // Stale, but not refetched now: the next mount reconciles the local
      // user-message id against the stored one at no cost here.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messages(server.id, target),
        refetchType: "none",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversations(server.id),
      });
    },
    [dropPending, queryClient, server],
  );

  /**
   * A turn that didn't take, sent or edited alike: the composer gets the
   * message back and the chat is refetched to show what the server kept. A
   * failed edit's rewind stands, so the edited message is gone from the chat
   * and its text waits in the composer, as a failed send's does.
   */
  const recover = useCallback(
    (
      error: unknown,
      input: TurnInput,
      conversationId: string | undefined,
      fallback: string,
    ) => {
      if (conversationId) {
        dropPending(conversationId);
        // The run outlives this stream server-side; a refetch is how a reply
        // that finished anyway still reaches the screen.
        void queryClient.invalidateQueries({
          queryKey: queryKeys.messages(server.id, conversationId),
        });
      }
      input.onRestore(input.content, input.sources, conversationId ?? "new");
      toast.show({
        kind: "error",
        message:
          error instanceof ApiError && error.status === 409
            ? "This chat moved on. Its latest messages were reloaded — try again."
            : errorMessage(error, fallback),
      });
    },
    [dropPending, queryClient, server, toast],
  );

  const send = useCallback(
    async (input: SendInput) => {
      let conversationId = input.conversationId;
      const startedKey = conversationId ?? "new";
      setSendingKeys((current) => ({ ...current, [startedKey]: true }));

      try {
        if (!conversationId) {
          const created = await createConversation(server);
          const createdId = created.id;
          conversationId = createdId;
          queryClient.setQueryData<Conversation[]>(
            queryKeys.conversations(server.id),
            (current) => [
              created,
              ...(current ?? []).filter(
                (conversation) => conversation.id !== createdId,
              ),
            ],
          );
          setSendingKeys((current) => ({ ...current, [createdId]: true }));
          input.onConversation(createdId);
        }

        await streamTurn(conversationId, input, null);
      } catch (error) {
        recover(error, input, conversationId, "The message didn't send.");
      } finally {
        setSendingKeys((current) =>
          without(current, startedKey, conversationId),
        );
      }
    },
    [queryClient, recover, server, streamTurn],
  );

  /** Replaces a user message, and every turn after it, with a new turn. */
  const edit = useCallback(
    async (input: EditInput) => {
      const { conversationId } = input;
      setSendingKeys((current) => ({ ...current, [conversationId]: true }));

      try {
        const storedId = await storedIdOf(conversationId, input.message);
        await streamTurn(conversationId, input, {
          message: input.message,
          storedId,
        });
      } catch (error) {
        recover(error, input, conversationId, "The edit didn't send.");
      } finally {
        setSendingKeys((current) => without(current, conversationId));
      }
    },
    [recover, storedIdOf, streamTurn],
  );

  return { pendingTurns, sendingKeys, send, edit };
}
