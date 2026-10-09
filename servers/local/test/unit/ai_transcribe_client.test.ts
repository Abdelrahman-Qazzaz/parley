import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeProcess, spawned, valueOf } from "../helpers/fakeProcess";

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));

import path from "node:path";
import {
  DEFAULT_TRANSCRIBE_MODEL,
  listTranscribeModels,
  isValidTranscribeModel,
  pingTranscribeAI,
  transcribeAI,
} from "../../shared/ai/ai_transcribe_client";
import { getBaseEnv } from "../../shared/env";

/** A segment as whisper.py prints it. */
const segment = (start: number, end: number, text: string) => ({
  line: { start, end, text },
});

const transcribe = () => transcribeAI("small", "/data/audios/talk");

beforeEach(() => {
  mockSpawn.mockReset();
});

describe("pingTranscribeAI", () => {
  it("has uv run the script's check", async () => {
    mockSpawn.mockImplementation(fakeProcess([]));

    await pingTranscribeAI();

    const { command, args } = spawned(mockSpawn);
    expect(command).toBe("uv");
    expect(args.slice(0, 3)).toEqual(["run", "--quiet", "--script"]);
    expect(path.basename(args[3] as string)).toBe("whisper.py");
    expect(args.slice(4)).toEqual(["--check"]);
  });

  it("fails with the exception Python ended on", async () => {
    mockSpawn.mockImplementation(
      fakeProcess([], {
        code: 1,
        stderr: "Traceback (most recent call last):\n  ...\nImportError: no\n",
      }),
    );

    await expect(pingTranscribeAI()).rejects.toThrow("ImportError: no");
  });
});

describe("transcribeAI", () => {
  it("transcribes the file with the model, keeping models in DATA_DIR", async () => {
    mockSpawn.mockImplementation(fakeProcess([segment(0, 2, " Hello.")]));

    expect(await transcribe()).toBe("Hello.");

    const { args } = spawned(mockSpawn);
    expect(valueOf(args, "--model")).toBe("small");
    expect(valueOf(args, "--models-dir")).toBe(
      path.join(getBaseEnv().DATA_DIR, "models"),
    );
    expect(args.at(-1)).toBe("/data/audios/talk");
  });

  it("joins segments into paragraphs where the speaker pauses", async () => {
    mockSpawn.mockImplementation(
      fakeProcess([
        segment(0, 2, " First thought."),
        segment(2.5, 4, " Still the same."),
        segment(7, 9, " After a pause."),
        segment(9, 9.5, "  "),
        segment(10, 11, " Same again."),
      ]),
    );

    expect(await transcribe()).toBe(
      "First thought. Still the same.\n\nAfter a pause. Same again.",
    );
  });

  it("ends a long paragraph at the next sentence end, pause or not", async () => {
    const long = `${"word ".repeat(100).trim()}`;
    mockSpawn.mockImplementation(
      fakeProcess([
        segment(0, 10, ` ${long}`),
        segment(10, 11, " still going,"),
        segment(11, 12, " until here."),
        segment(12, 13, " Next one."),
      ]),
    );

    expect(await transcribe()).toBe(
      `${long} still going, until here.\n\nNext one.`,
    );
  });

  it("is empty for audio with no speech", async () => {
    mockSpawn.mockImplementation(fakeProcess([]));

    expect(await transcribe()).toBe("");
  });

  it("fails with the whole exception, when its message runs over lines", async () => {
    mockSpawn.mockImplementation(
      fakeProcess([segment(0, 2, " Hello.")], {
        code: 1,
        stderr:
          "Traceback (most recent call last):\n  ...\nRuntimeError: Download failed:\nBlocked by network policy\n  detail: no matching allow rule\n",
      }),
    );

    await expect(transcribe()).rejects.toThrow(
      "RuntimeError: Download failed:\nBlocked by network policy\n  detail: no matching allow rule",
    );
  });

  it("fails with the last line of anything else it printed", async () => {
    mockSpawn.mockImplementation(
      fakeProcess([], {
        code: 2,
        stderr: "error: No such file\nhint: check it\n",
      }),
    );

    await expect(transcribe()).rejects.toThrow(/^hint: check it$/);
  });
});

describe("transcribeAI timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const MINUTE = 60_000;

  it("waits for the model to download before the first segment", async () => {
    mockSpawn.mockImplementation(
      fakeProcess([{ afterMs: 29 * MINUTE, ...segment(0, 1, " Hi.") }]),
    );
    const result = transcribe();

    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    expect(await result).toBe("Hi.");
  });

  it("gives up on a run that stalls between segments, and kills it", async () => {
    mockSpawn.mockImplementation(
      fakeProcess([segment(0, 1, " Hi.")], { end: false }),
    );
    const result = transcribe();
    const failed = expect(result).rejects.toMatchObject({
      name: "TimeoutError",
      message: "No progress for 600000 ms",
    });

    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    await failed;
    expect(spawned(mockSpawn).options.signal?.aborted).toBe(true);
  });
});

describe("the model catalog", () => {
  it("lists the Whisper models by name", async () => {
    expect((await listTranscribeModels()).map((model) => model.id)).toEqual([
      "tiny",
      "base",
      "small",
      "medium",
      "large-v3-turbo",
      "large-v3",
    ]);
  });

  it("accepts a listed model, the default among them", async () => {
    expect(await isValidTranscribeModel(DEFAULT_TRANSCRIBE_MODEL)).toBe(true);
    expect(await isValidTranscribeModel("large-v3-turbo")).toBe(true);
  });

  it("refuses a model it doesn't list", async () => {
    expect(await isValidTranscribeModel("nova-3-general")).toBe(false);
  });
});
