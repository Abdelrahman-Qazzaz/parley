import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shared/db", async () =>
  (await import("../helpers/inMemoryDb")).inMemoryDbModule(),
);

import {
  AudioTranscriptionJobs,
  db,
  TranscriptContents,
} from "../../shared/db";
import { deleteAllRows } from "../helpers/inMemoryDb";
import { jobs } from "../../shared/data/jobs.data";
import { transcripts } from "../../shared/data/transcripts.data";

/** A queued audio job, claimed, as the transcription handler holds it. */
async function claimedJob() {
  const audioUploadId = randomUUID();
  await jobs.createAudioJob({
    audioUploadId,
    source: "audio",
    fileName: "talk.mp3",
    mimeType: "audio/mpeg",
    sizeBytes: 5,
    transcriptModelId: "small",
  });
  const job = await jobs.claimAudioJob(audioUploadId);
  return { audioUploadId, claimToken: job!.claimToken };
}

beforeEach(async () => {
  await deleteAllRows(db);
});

describe("saveCompletedTranscript", () => {
  it("stores the transcript and completes the job", async () => {
    const { audioUploadId, claimToken } = await claimedJob();

    expect(
      await transcripts.saveCompletedTranscript(
        audioUploadId,
        "Hello there",
        claimToken,
      ),
    ).toBe(true);

    expect(await db.select().from(TranscriptContents)).toEqual([
      { audioUploadId, content: "Hello there", charCount: 11 },
    ]);
    const [job] = await db.select().from(AudioTranscriptionJobs);
    expect(job?.status).toBe("completed");
  });

  it("stores nothing for a claim that's no longer the job's", async () => {
    const { audioUploadId } = await claimedJob();

    expect(
      await transcripts.saveCompletedTranscript(
        audioUploadId,
        "stale transcript",
        randomUUID(),
      ),
    ).toBe(false);

    expect(await db.select().from(TranscriptContents)).toEqual([]);
    const [job] = await db.select().from(AudioTranscriptionJobs);
    expect(job?.status).toBe("processing");
  });
});

describe("findTranscripts", () => {
  it("finds the transcripts asked for, by upload id", async () => {
    const first = await claimedJob();
    const second = await claimedJob();
    await transcripts.saveCompletedTranscript(
      first.audioUploadId,
      "first",
      first.claimToken,
    );
    await transcripts.saveCompletedTranscript(
      second.audioUploadId,
      "second",
      second.claimToken,
    );

    expect(await transcripts.findTranscripts([first.audioUploadId])).toEqual(
      new Map([[first.audioUploadId, "first"]]),
    );
  });

  it("finds nothing when asked for nothing", async () => {
    expect(await transcripts.findTranscripts([])).toEqual(new Map());
  });
});
