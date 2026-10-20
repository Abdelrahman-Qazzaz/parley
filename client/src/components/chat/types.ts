import type { MessageTranscript } from "../../api/messages";

export type TurnImage = {
  imageUploadId: string;
  fileName: string;
  url: string;
};

/**
 * The turn being answered right now. It stands in for the pair the server will
 * persist, so the conversation reads the same before and after the refetch.
 */
export type PendingTurn = {
  /** An edit: this message and everything after it are being replaced. */
  replacesMessageId: string | null;
  content: string;
  images: TurnImage[];
  transcripts: MessageTranscript[];
  assistantContent: string;
  /**
   * The turn didn't take and the chat is being reloaded. Nothing stands in
   * for it, and the turns an edit replaced stay hidden until the reload shows
   * what the server kept, rather than flashing back in the meantime.
   */
  reloading: boolean;
};
