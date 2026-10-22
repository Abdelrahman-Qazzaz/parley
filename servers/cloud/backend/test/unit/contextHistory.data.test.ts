import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("../../src/db", async () => ({
  db: { execute: mockExecute },
  ...(await import("../../src/db/schema")),
}));

import { messages } from "../../src/data/messages.data";

const createdAt = new Date("2026-08-31T00:00:00.000Z");

function historyRow(
  partial: Partial<{
    messageId: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    attachmentId: string | null;
    attachmentKind: "image" | "audio" | null;
    signedUrl: string | null;
    signedUrlExpiresAt: string | null;
    transcriptContent: string | null;
  }> = {},
) {
  return {
    messageId: "message-1",
    role: "user" as const,
    content: "Question",
    createdAt: createdAt.toISOString(),
    attachmentId: null,
    attachmentKind: null,
    signedUrl: null,
    signedUrlExpiresAt: null,
    transcriptContent: null,
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findContextHistory", () => {
  it("groups each turn with its transcripts and stored images, newest first", async () => {
    mockExecute.mockResolvedValueOnce([
      historyRow({
        messageId: "message-2",
        role: "assistant",
        content: "Answer",
      }),
      historyRow({
        attachmentId: "audio-1",
        attachmentKind: "audio",
        transcriptContent: "First transcript",
      }),
      historyRow({
        attachmentId: "audio-2",
        attachmentKind: "audio",
        transcriptContent: "Second transcript",
      }),
      historyRow({
        attachmentId: "image-1",
        attachmentKind: "image",
        signedUrl: "old-url",
        signedUrlExpiresAt: createdAt.toISOString(),
      }),
    ]);

    await expect(
      messages.findContextHistory({
        userId: "user-1",
        conversationId: "conversation-1",
        maximumMessageCount: 49,
      }),
    ).resolves.toEqual([
      {
        id: "message-2",
        role: "assistant",
        content: "Answer",
        createdAt,
        transcriptContents: [],
        images: [],
      },
      {
        id: "message-1",
        role: "user",
        content: "Question",
        createdAt,
        transcriptContents: ["First transcript", "Second transcript"],
        images: [
          {
            imageUploadId: "image-1",
            signedUrl: "old-url",
            signedUrlExpiresAt: createdAt,
          },
        ],
      },
    ]);
  });

  it("reads the window in one query, leaving admission to the caller", async () => {
    mockExecute.mockResolvedValueOnce([]);

    await expect(
      messages.findContextHistory({
        userId: "user-1",
        conversationId: "conversation-1",
        maximumMessageCount: 49,
      }),
    ).resolves.toEqual([]);

    expect(mockExecute).toHaveBeenCalledOnce();
    const query = new PgDialect().sqlToQuery(mockExecute.mock.calls[0][0]);
    expect(query.sql).toContain("context_window_message_count");
    expect(query.sql).toContain("recent_messages as");
    expect(query.sql).not.toContain("current_turn");
  });
});
