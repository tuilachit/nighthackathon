"use client";

import { useState } from "react";
import type { SpaceMeasurement } from "@/lib/catalog-types";
import type {
  CachePolicy,
  CreateLiveSearchRequest,
  LiveRetailer,
} from "@/lib/live-search/types";
import { validateCreateLiveSearchRequest } from "@/lib/live-search/validation";

type IntentMode = "describe" | "link";

interface SearchIntentFormProps {
  readonly measurement: SpaceMeasurement;
  readonly initialMode?: IntentMode;
  readonly initialValue?: string;
  readonly busy?: boolean;
  readonly offline?: boolean;
  readonly error?: string;
  readonly challenge?: React.ReactNode;
  onSubmit(request: CreateLiveSearchRequest): void;
}

/** Collects one live-search intent without creating a session before submit. */
export function SearchIntentForm({
  measurement,
  initialMode = "describe",
  initialValue = "",
  busy = false,
  offline = false,
  error,
  challenge,
  onSubmit,
}: SearchIntentFormProps): React.JSX.Element {
  const [mode, setMode] = useState<IntentMode>(initialMode);
  const [value, setValue] = useState(initialValue);
  const [retailers, setRetailers] = useState<readonly LiveRetailer[]>([
    "ikea-au",
    "kmart-au",
  ]);
  const [cachePolicy, setCachePolicy] =
    useState<CachePolicy>("prefer-recent");
  const [localError, setLocalError] = useState<string>();

  function chooseMode(nextMode: IntentMode): void {
    setMode(nextMode);
    setLocalError(undefined);
  }

  function toggleRetailer(retailer: LiveRetailer): void {
    setRetailers((current) =>
      current.includes(retailer)
        ? current.filter((entry) => entry !== retailer)
        : [...current, retailer],
    );
    setLocalError(undefined);
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (offline) {
      setLocalError("Reconnect before checking retailer pages.");
      return;
    }
    const trimmed = value.trim();
    const request: CreateLiveSearchRequest = {
      intent:
        mode === "describe"
          ? { kind: "prompt", text: trimmed, retailers }
          : { kind: "product-link", url: trimmed },
      measurement,
      cachePolicy,
    };
    const validation = validateCreateLiveSearchRequest(request);
    if (!validation.ok || validation.value === undefined) {
      setLocalError(readableValidationError(mode, retailers.length));
      return;
    }
    setLocalError(undefined);
    onSubmit(validation.value);
  }

  return (
    <form className="flex flex-1 flex-col" onSubmit={submit}>
      <div
        className="grid grid-cols-2 border border-[#17221f]/25 p-1"
        aria-label="Search mode"
      >
        <button
          type="button"
          aria-pressed={mode === "describe"}
          className={`min-h-11 px-3 text-sm font-bold ${
            mode === "describe" ? "bg-[#17221f] text-white" : "bg-white"
          }`}
          onClick={() => chooseMode("describe")}
        >
          Describe
        </button>
        <button
          type="button"
          aria-pressed={mode === "link"}
          className={`min-h-11 px-3 text-sm font-bold ${
            mode === "link" ? "bg-[#17221f] text-white" : "bg-white"
          }`}
          onClick={() => chooseMode("link")}
        >
          Paste product link
        </button>
      </div>

      <label htmlFor="fit-search-intent" className="mt-5 text-sm font-bold">
        {mode === "describe" ? "What do you need?" : "Product link"}
      </label>
      {mode === "describe" ? (
        <textarea
          id="fit-search-intent"
          rows={4}
          value={value}
          maxLength={500}
          placeholder="A narrow oak bookshelf under $300"
          className="mt-2 min-h-28 resize-none border border-[#17221f]/35 bg-white px-3 py-3 text-base leading-6 outline-none focus:border-[#17221f]"
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setLocalError(undefined);
          }}
        />
      ) : (
        <input
          id="fit-search-intent"
          type="url"
          inputMode="url"
          value={value}
          placeholder="https://retailer.com/product"
          className="mt-2 min-h-12 border border-[#17221f]/35 bg-white px-3 text-base outline-none focus:border-[#17221f]"
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setLocalError(undefined);
          }}
        />
      )}

      <details className="mt-4 border-y border-[#17221f]/20 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-bold">
          Search options
          <span className="fit-data text-[10px] text-[#17221f]/65">
            {mode === "describe" ? `${retailers.length} retailers` : "exact link"}
            {cachePolicy === "force-refresh" ? " · live" : " · recent first"}
          </span>
        </summary>
        <div className="grid gap-4 pb-3 pt-2">
          {mode === "describe" ? (
            <fieldset>
              <legend className="text-xs font-bold">Retailers</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <RetailerChoice
                  label="IKEA Australia"
                  checked={retailers.includes("ikea-au")}
                  onChange={() => toggleRetailer("ikea-au")}
                />
                <RetailerChoice
                  label="Kmart Australia"
                  checked={retailers.includes("kmart-au")}
                  onChange={() => toggleRetailer("kmart-au")}
                />
              </div>
            </fieldset>
          ) : null}
          <fieldset>
            <legend className="text-xs font-bold">Source freshness</legend>
            <div className="mt-2 grid gap-2">
              <label className="flex min-h-11 items-center gap-3 border border-[#17221f]/20 px-3 text-sm font-semibold">
                <input
                  type="radio"
                  name="cache-policy"
                  checked={cachePolicy === "prefer-recent"}
                  onChange={() => setCachePolicy("prefer-recent")}
                />
                Recent first
              </label>
              <label className="flex min-h-11 items-center gap-3 border border-[#17221f]/20 px-3 text-sm font-semibold">
                <input
                  type="radio"
                  name="cache-policy"
                  checked={cachePolicy === "force-refresh"}
                  onChange={() => setCachePolicy("force-refresh")}
                />
                Check retailer now
              </label>
            </div>
          </fieldset>
        </div>
      </details>

      {challenge === undefined ? null : <div className="mt-4">{challenge}</div>}
      {localError === undefined && error === undefined ? null : (
        <p className="mt-4 border-l-2 border-[#8a4e48] pl-3 text-sm font-semibold text-[#8a4e48]" role="alert">
          {localError ?? error}
        </p>
      )}

      <div className="mt-auto pt-8">
        <button
          type="submit"
          disabled={busy || offline}
          className="min-h-12 w-full rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2a3b36] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {busy ? "Starting search…" : "Find products that fit"}
        </button>
        <p className="mt-3 text-center text-xs leading-5 text-[#17221f]/65">
          {offline
            ? "Loaded spaces remain available offline."
            : "Fresh checks usually take under a minute."}
        </p>
      </div>
    </form>
  );
}

function RetailerChoice({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: () => void;
}): React.JSX.Element {
  return (
    <label className="flex min-h-11 items-center gap-2 border border-[#17221f]/20 px-3 text-xs font-bold">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function readableValidationError(mode: IntentMode, retailerCount: number): string {
  if (mode === "describe") {
    return retailerCount === 0
      ? "Choose at least one retailer."
      : "Describe the furniture you want to find.";
  }
  return "Paste a complete HTTPS product link.";
}
