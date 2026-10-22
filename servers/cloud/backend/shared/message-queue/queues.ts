import { z } from "zod";
import type { UploadId } from "@parley/shared/types";

export const QUEUES = {
  TRANSCRIBE: "transcribe",
  YT_FETCH: "yt_fetch",
  YT_FETCH_FAILED: "yt_fetch_failed",
  CAPTION_TRANSCRIPT: "caption_transcript",
} as const;

export type Queue = (typeof QUEUES)[keyof typeof QUEUES];

const uploadId = z
  .string()
  .uuid()
  .transform((id) => id as UploadId);

/**
 * What each queue's messages carry. The Python fetcher publishes three of
 * these from its own code, so a consumer checks every message against its
 * schema rather than trusting the shape: one that doesn't fit is
 * dead-lettered before its handler runs.
 */
export const QUEUE_PAYLOAD_SCHEMAS = {
  [QUEUES.TRANSCRIBE]: z.object({
    audioUploadId: uploadId,
  }),

  [QUEUES.YT_FETCH]: z.object({
    audioUploadId: uploadId,
    userId: z.string(),
    url: z.string(),
    useCaptionsIfAvailable: z.boolean(),
  }),

  [QUEUES.YT_FETCH_FAILED]: z.object({
    audioUploadId: uploadId,
    userId: z.string(),
    error: z.string().optional(),
  }),

  [QUEUES.CAPTION_TRANSCRIPT]: z.object({
    audioUploadId: uploadId,
    /** The video's captions, used as the transcript instead of its audio. */
    transcript: z.string(),
  }),
} as const satisfies Record<Queue, z.ZodTypeAny>;

export type QueuePayloads = {
  [Q in Queue]: z.output<(typeof QUEUE_PAYLOAD_SCHEMAS)[Q]>;
};
