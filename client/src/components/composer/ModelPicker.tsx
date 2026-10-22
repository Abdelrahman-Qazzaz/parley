import { useMemo, useState } from "react";
import {
  describeModel,
  describePricing,
  meetsRequirements,
  priceTier,
  providerSlug,
  type ChatModel,
  type MessageRequirements,
  type ModelPricing,
} from "../../api/models";
import { fuzzyScoreAny } from "../../lib/fuzzy";
import { Icon } from "../ui/Icon";
import { useDismissable } from "../ui/useDismissable";

type ModelPickerProps = {
  models: ChatModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  /** What the message being written needs; models that can't serve it are hidden. */
  requirements: MessageRequirements;
  loading: boolean;
  error: string | null;
};

type Entry = {
  id: string;
  model: ChatModel;
  provider: string;
  name: string;
  slug: string;
  score: number;
};

function formatContext(tokens: number | null): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

/**
 * The model's price tier as dollar signs, the ones it doesn't reach dimmed,
 * with the exact price on hover. Nothing for a model with no per-token price.
 */
function PriceTier({ pricing }: { pricing: ModelPricing | null }) {
  const tier = priceTier(pricing);
  if (!pricing || !tier) return null;
  const exact = describePricing(pricing);

  if (tier.kind === "free") {
    return (
      <span
        title={exact}
        className="shrink-0 font-mono text-[10px] text-signal"
      >
        free
      </span>
    );
  }
  return (
    <span
      title={exact}
      aria-label={`Price: ${exact}`}
      className="shrink-0 font-mono text-[11px] tracking-tight"
    >
      <span aria-hidden className="text-muted">
        {"$".repeat(tier.dollars)}
      </span>
      <span aria-hidden className="text-faint opacity-50">
        {"$".repeat(3 - tier.dollars)}
      </span>
      {tier.premium && (
        <span aria-hidden className="text-muted">
          +
        </span>
      )}
    </span>
  );
}

export function ModelPicker({
  models,
  value,
  onChange,
  requirements,
  loading,
  error,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const menuRef = useDismissable<HTMLDivElement>(open, () => setOpen(false));

  // Requirement filtering happens before anything the user drives, so the
  // provider counts and the search both describe what is actually selectable.
  const eligible = useMemo(
    () =>
      models
        .filter((model) => meetsRequirements(model, requirements))
        .map((model) => {
          const { provider: label, name } = describeModel(model);
          return {
            id: model.id,
            model,
            provider: label,
            name,
            slug: providerSlug(model.id),
            score: 0,
          } satisfies Entry;
        }),
    [models, requirements],
  );

  const providers = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const entry of eligible) {
      const current = counts.get(entry.slug);
      counts.set(entry.slug, {
        label: entry.provider,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...counts.entries()]
      .map(([slug, meta]) => ({ slug, ...meta }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [eligible]);

  const matches = useMemo(() => {
    const query = search.trim();
    const scored = eligible.flatMap((entry) => {
      if (provider && entry.slug !== provider) return [];
      const score = fuzzyScoreAny(
        [entry.name, entry.id, entry.provider],
        query,
      );
      return score === null ? [] : [{ ...entry, score }];
    });
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        a.provider.localeCompare(b.provider) ||
        a.name.localeCompare(b.name),
    );
    return scored;
  }, [eligible, provider, search]);

  // Grouping only makes sense while browsing: a search is ranked by relevance
  // across every provider, and a chosen provider is already one group.
  const grouped = useMemo(() => {
    if (search.trim() || provider) return null;
    const groups = new Map<string, Entry[]>();
    for (const entry of matches) {
      const list = groups.get(entry.provider) ?? [];
      list.push(entry);
      groups.set(entry.provider, list);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...groups.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
  }, [matches, provider, search]);

  const selected = eligible.find((entry) => entry.id === value);
  // Only worth saying when it actually cost the user options.
  const excluded = models.length - eligible.length;

  if (error) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-live">
        <Icon name="alert" className="h-3.5 w-3.5" />
        {error}
      </span>
    );
  }

  const row = (entry: Entry) => {
    const limit = formatContext(entry.model.contextTokens);
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => {
          onChange(entry.id);
          setOpen(false);
          setSearch("");
        }}
        className="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-sunk"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-ink">{entry.name}</span>
            <PriceTier pricing={entry.model.pricing} />
          </span>
          <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-faint">
            <span className="truncate">{entry.id}</span>
            {limit && <span className="shrink-0">· {limit}</span>}
          </span>
        </span>

        <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
          {entry.model.acceptsImages && (
            <Icon name="eye" className="h-3.5 w-3.5 text-faint" />
          )}
          {entry.id === value && (
            <Icon name="check" className="h-4 w-4 text-signal" />
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={loading}
        aria-label="Choose the chat model"
        aria-expanded={open}
        className="flex max-w-[15rem] items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-muted transition-colors hover:bg-sunk hover:text-ink disabled:opacity-40"
      >
        <span className="truncate">
          {loading ? "loading models…" : (selected?.name ?? "no model")}
        </span>
        <Icon name="chevronDown" className="h-3.5 w-3.5 shrink-0" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute bottom-10 left-0 z-30 flex h-[26rem] w-[34rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
            <Icon name="search" className="h-4 w-4 shrink-0 text-faint" />
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search models"
              aria-label="Search models"
              className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
            />
            <span className="shrink-0 font-mono text-[10px] text-faint">
              {matches.length}
            </span>
          </div>

          {excluded > 0 && (
            <p className="shrink-0 border-b border-line bg-signal-tint px-3 py-1.5 text-[11px] text-signal-strong">
              {requirements.image
                ? `${excluded} models hidden — this conversation carries an image`
                : `${excluded} models hidden — this conversation is too long for them`}
            </p>
          )}

          <div className="flex min-h-0 flex-1">
            <div className="w-36 shrink-0 overflow-y-auto border-r border-line py-1">
              <button
                type="button"
                onClick={() => setProvider(null)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] transition-colors ${
                  provider === null
                    ? "bg-signal-tint text-signal-strong"
                    : "text-muted hover:bg-sunk hover:text-ink"
                }`}
              >
                <span className="truncate">All</span>
                <span className="font-mono text-[10px]">{eligible.length}</span>
              </button>
              {providers.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  onClick={() => setProvider(item.slug)}
                  title={item.label}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] transition-colors ${
                    provider === item.slug
                      ? "bg-signal-tint text-signal-strong"
                      : "text-muted hover:bg-sunk hover:text-ink"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className="font-mono text-[10px]">{item.count}</span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {matches.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-faint">
                  No model matches that.
                </p>
              ) : grouped ? (
                grouped.map(([label, entries]) => (
                  <div key={label}>
                    <p className="eyebrow sticky top-0 bg-surface px-3 py-1.5 text-faint">
                      {label}
                    </p>
                    {entries.map(row)}
                  </div>
                ))
              ) : (
                matches.map(row)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
