import { chatModelsEndpoint, transcriptionModelsEndpoint } from "../config";
import { apiJson } from "./http";

/** A chat model as the API describes it. */
export type ChatModel = {
  id: string;
  name: string;
  /** The longest prompt it takes, in tokens, when known. */
  contextTokens: number | null;
  acceptsImages: boolean;
};

/** A transcription model as the API describes it. */
export type TranscriptionModel = { id: string; name: string };

export const DEFAULT_TEXT_MODEL = "openai/gpt-4o-mini";
export const DEFAULT_TRANSCRIPTION_MODEL = "nova-3-general";

async function fetchModels<T>(endpoint: string): Promise<T[]> {
  const data = await apiJson<{ models: T[] }>(endpoint);
  if (!Array.isArray(data?.models)) throw new Error("Invalid models response");
  return data.models;
}

export function fetchChatModels(): Promise<ChatModel[]> {
  return fetchModels<ChatModel>(chatModelsEndpoint());
}

export function fetchTranscriptionModels(): Promise<TranscriptionModel[]> {
  return fetchModels<TranscriptionModel>(transcriptionModelsEndpoint());
}

/** Fall back to the first available model when the preferred one isn't offered. */
export function resolveDefaultModel(
  modelIds: string[],
  preferredModelId: string,
): string | null {
  if (modelIds.includes(preferredModelId)) return preferredModelId;
  return modelIds[0] ?? null;
}

/* ------------------------------------------------------------------ naming */

// OpenRouter ids are "<provider>/<model>" and its names are "Provider: Model",
// so both the grouping key and a clean display name come from the catalog
// itself. This map only covers the fallback path, where a name arrives without
// its prefix.
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "meta-llama": "Meta",
  mistralai: "Mistral",
  deepseek: "DeepSeek",
  "x-ai": "xAI",
  qwen: "Qwen",
  cohere: "Cohere",
  perplexity: "Perplexity",
  microsoft: "Microsoft",
  nvidia: "NVIDIA",
  amazon: "Amazon",
  ai21: "AI21",
};

export function providerSlug(modelId: string): string {
  const [slug] = modelId.split("/");
  return slug && slug !== modelId ? slug : "other";
}

function labelForSlug(slug: string): string {
  if (PROVIDER_LABELS[slug]) return PROVIDER_LABELS[slug];
  return slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** "Anthropic: Claude Sonnet 4.5" becomes { provider, name } for display. */
export function describeModel(model: ChatModel): {
  provider: string;
  name: string;
} {
  const raw = model.name.trim() || model.id;
  const separator = raw.indexOf(": ");
  if (separator > 0) {
    return {
      provider: raw.slice(0, separator).trim(),
      name: raw.slice(separator + 2).trim(),
    };
  }
  return { provider: labelForSlug(providerSlug(model.id)), name: raw };
}

/* ---------------------------------------------------- message requirements */

/**
 * What the message being written needs from a model. Derived from what the
 * composer is actually carrying, so the picker can hide models that would be
 * rejected — the API refuses a turn whose model can't read an attached image,
 * and a transcript longer than the context window can't be answered.
 */
export type MessageRequirements = {
  image: boolean;
  /** Rough token estimate of the prompt this turn will send. */
  tokens: number;
};

/** Four characters per token is the usual English approximation. */
export const CHARS_PER_TOKEN = 4;

export function meetsRequirements(
  model: ChatModel,
  requirements: MessageRequirements,
): boolean {
  if (requirements.image && !model.acceptsImages) return false;
  // An unknown context length is not evidence the model is too small.
  if (model.contextTokens !== null && requirements.tokens > model.contextTokens)
    return false;
  return true;
}
