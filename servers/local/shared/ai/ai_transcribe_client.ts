import { spawn } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { TranscribeModel } from "@summarizer/shared/contract";
import { getBaseEnv } from "../env";
import { withTimeout } from "@summarizer/shared/withTimeout";

/**
 * Transcription runs on this machine: faster-whisper, in whisper.py, which uv
 * runs with the dependencies the script declares. The build puts the script
 * next to the bundle, so it sits beside this module either way.
 */
const SCRIPT_PATH = fileURLToPath(new URL("./whisper.py", import.meta.url));

/** Transcription couldn't finish; the message is what Whisper said went wrong. */
class WhisperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisperError";
  }
}

/**
 * What a failed run said went wrong. Python ends with the exception, whose
 * message can run over several lines, so it's everything from the exception
 * line on; anything else is reported by its last line.
 */
function errorOf(stderr: string) {
  const lines = stderr.trim().split("\n");
  const exception = lines.findLastIndex((line) =>
    /^[\w.]+(Error|Exception)\b/.test(line),
  );
  return lines.slice(exception === -1 ? -1 : exception).join("\n");
}

/** Where models are kept once downloaded. */
function modelsDir() {
  return path.join(getBaseEnv().DATA_DIR, "models");
}

/**
 * Runs whisper.py with `args` under uv, passing each line it prints to
 * `onLine`. Aborting `abortSignal` kills the run and rejects with the
 * signal's reason. A failed run rejects with the error it printed.
 */
async function runWhisper(
  args: readonly string[],
  {
    abortSignal,
    onLine = () => {},
  }: { abortSignal?: AbortSignal; onLine?: (line: string) => void } = {},
): Promise<void> {
  const child = spawn(
    getBaseEnv().UV_PATH,
    ["run", "--quiet", "--script", SCRIPT_PATH, ...args],
    {
      stdio: ["ignore", "pipe", "pipe"],
      // Download progress bars would bury the error a failed run prints.
      env: { ...process.env, HF_HUB_DISABLE_PROGRESS_BARS: "1" },
      ...(abortSignal ? { signal: abortSignal } : {}),
    },
  );

  // A run that can't start, or is killed, reports why here; it still closes.
  let failure: unknown;
  child.on("error", (error) => (failure ??= error));
  const closed = new Promise<number | null>((resolve) =>
    child.on("close", resolve),
  );
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));

  try {
    for await (const line of createInterface({ input: child.stdout })) {
      onLine(line);
    }
    const code = await closed;

    if (abortSignal?.aborted) throw abortSignal.reason;
    if (failure) throw failure;
    if (code !== 0) {
      throw new WhisperError(
        errorOf(stderr) || `whisper.py exited with code ${code}`,
      );
    }
  } finally {
    // Whatever stopped reading the transcript, the run doesn't outlive it.
    if (child.exitCode === null) child.kill();
  }
}

/**
 * Startup health check: fails if uv can't run the script or install what it
 * needs. The first one installs faster-whisper, so no job waits on that.
 */
export async function pingTranscribeAI(): Promise<void> {
  await runWhisper(["--check"]);
}

/** A pause at least this long between segments starts a new paragraph. */
const PARAGRAPH_PAUSE_SECONDS = 2;

/**
 * A paragraph this long ends at the next sentence end. A talk can run for
 * minutes without a pause that long, which would otherwise make it one block.
 */
const PARAGRAPH_TARGET_CHARS = 500;

/** Whether text ends a sentence, closing quotes and brackets aside. */
const endsSentence = (text: string) => /[.!?]["')\]]*$/.test(text);

type Segment = { start: number; end: number; text: string };

// How long a transcription takes depends on the audio's length and this
// machine's speed, so the total is generous. What's held tight is silence: a
// run that prints nothing for this long has stalled. The first segment also
// waits on the model being downloaded and loaded.
const TRANSCRIBE_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours
const FIRST_SEGMENT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const BETWEEN_SEGMENTS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * The audio file at `audioPath`, transcribed, in paragraphs: where the
 * speaker pauses, or at a sentence end once a paragraph is long enough.
 * Whisper reads the format from the file's contents.
 */
export async function transcribeAI(
  model: string,
  audioPath: string,
): Promise<string> {
  const paragraphs: string[] = [];
  let lastEnd = 0;

  await withTimeout(
    {
      timeoutMs: TRANSCRIBE_TIMEOUT_MS,
      firstProgressTimeoutMs: FIRST_SEGMENT_TIMEOUT_MS,
      progressTimeoutMs: BETWEEN_SEGMENTS_TIMEOUT_MS,
    },
    ({ abortSignal, markProgress }) =>
      runWhisper(["--model", model, "--models-dir", modelsDir(), audioPath], {
        abortSignal,
        onLine: (line) => {
          markProgress();
          const segment = JSON.parse(line) as Segment;
          const text = segment.text.trim();
          if (!text) return;

          const paragraph = paragraphs.at(-1);
          const startsParagraph =
            paragraph === undefined ||
            segment.start - lastEnd >= PARAGRAPH_PAUSE_SECONDS ||
            (paragraph.length >= PARAGRAPH_TARGET_CHARS &&
              endsSentence(paragraph));
          if (startsParagraph) paragraphs.push(text);
          else paragraphs[paragraphs.length - 1] = `${paragraph} ${text}`;
          lastEnd = segment.end;
        },
      }),
  );

  return paragraphs.join("\n\n");
}

/**
 * The Whisper models faster-whisper downloads by name, smallest and fastest
 * first. Larger ones transcribe better and take longer.
 */
const TRANSCRIBE_MODELS: readonly TranscribeModel[] = [
  { id: "tiny", name: "Whisper Tiny" },
  { id: "base", name: "Whisper Base" },
  { id: "small", name: "Whisper Small" },
  { id: "medium", name: "Whisper Medium" },
  { id: "large-v3-turbo", name: "Whisper Large v3 Turbo" },
  { id: "large-v3", name: "Whisper Large v3" },
];

export async function listTranscribeModels(): Promise<TranscribeModel[]> {
  return [...TRANSCRIBE_MODELS];
}

/** Whether a model id can be used for transcription. */
export async function isValidTranscribeModel(
  modelId: string,
): Promise<boolean> {
  return TRANSCRIBE_MODELS.some((model) => model.id === modelId);
}

/** Fast enough on a CPU for long audio, and accurate enough to summarize. */
export const DEFAULT_TRANSCRIBE_MODEL = "small";
