"use client";

import { useMemo, useState } from "react";
import type {
  CatalogProduct,
  FitSearchExperienceProps,
  FurnitureQuery,
  ProductSelection,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/supabase/catalog-source";
import { CACHED_FURNITURE_QUERIES } from "@/lib/fit-config";
import { searchProducts } from "@/lib/product-ranker";
import {
  mergeFurnitureQueries,
  parseFurnitureQuery,
  parseFurnitureQueryValue,
} from "@/lib/query-parser";
import { ComparisonPanel } from "./ComparisonPanel";
import { MeasurementSummary } from "./MeasurementSummary";
import { ProductCard } from "./ProductCard";
import { QueryInput } from "./QueryInput";

interface FitSearchClientProps extends FitSearchExperienceProps {
  readonly products: readonly CatalogProduct[];
  readonly catalogSource?: CatalogSource;
  readonly retailerCount?: number;
}

interface QueryEnhancementResponse {
  readonly query?: unknown;
}

export function FitSearchExperience({
  measurement,
  initialQuery = CACHED_FURNITURE_QUERIES[0],
  onSelectProduct,
  products,
  catalogSource = "fallback",
  retailerCount = new Set(products.map((product) => product.retailer)).size,
}: FitSearchClientProps): React.JSX.Element {
  const [input, setInput] = useState(initialQuery);
  const [submittedText, setSubmittedText] = useState(initialQuery);
  const [query, setQuery] = useState<FurnitureQuery>(() => parseFurnitureQuery(initialQuery));
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [comparedIds, setComparedIds] = useState<readonly string[]>([]);
  const results = useMemo(
    () => searchProducts(products, measurement, query),
    [measurement, products, query],
  );
  const comparedEntries = useMemo(
    () => results.fits.filter((entry) => comparedIds.includes(entry.product.id)),
    [comparedIds, results.fits],
  );
  const filterChips = getFilterChips(query);

  async function handleSubmit(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }

    const localQuery = parseFurnitureQuery(trimmed);
    setSubmittedText(trimmed);
    setQuery(localQuery);
    setComparedIds([]);

    if (!needsEnhancement(localQuery)) {
      return;
    }

    setIsEnhancing(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch("/api/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as QueryEnhancementResponse;
      const enhancement = parseFurnitureQueryValue(data.query);
      if (enhancement !== undefined) {
        setQuery(mergeFurnitureQueries(localQuery, enhancement));
      }
    } catch {
      // Local parsing is the complete fallback and already rendered.
    } finally {
      window.clearTimeout(timeoutId);
      setIsEnhancing(false);
    }
  }

  function toggleComparison(productId: string): void {
    setComparedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : current.length < 3
          ? [...current, productId]
          : current,
    );
  }

  function handleSelection(selection: ProductSelection): void {
    onSelectProduct(selection);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8c7c61]">
          Night Hack · Fit first
        </p>
        <p className="mt-2 text-xs font-bold text-[#6f685d]" data-testid="catalog-status">
          {catalogSource === "supabase" ? "Live verified catalog" : "Offline-safe verified catalog"}
          {" · "}
          {products.length} products across {retailerCount} retailers
        </p>
        <h1 className="mt-2 max-w-2xl text-[40px] font-black leading-[0.94] tracking-[-0.055em] sm:text-6xl">
          Stop guessing.
          <br />
          Shop what fits.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#625b50]">
          We filter verified furniture by your actual space before style or price enters the ranking.
        </p>
      </header>

      <MeasurementSummary measurement={measurement} />
      <QueryInput
        value={input}
        isEnhancing={isEnhancing}
        onChange={setInput}
        onSubmit={(value) => void handleSubmit(value)}
      />

      <div aria-label="Parsed search filters" className="flex flex-wrap gap-2">
        {filterChips.length > 0 ? (
          filterChips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-[#d8d1c5] bg-white px-3 py-1.5 text-xs font-bold text-[#5c5549]"
            >
              {chip}
            </span>
          ))
        ) : (
          <span className="text-sm font-semibold text-[#766e61]">
            Searching verified storage furniture for “{submittedText}”
          </span>
        )}
      </div>

      <ComparisonPanel
        entries={comparedEntries}
        onRemove={(productId) => toggleComparison(productId)}
      />

      <ResultSection
        title={`${results.fits.length} verified fits`}
        description={
          measurement.accessWidthMm === undefined
            ? "Every product clears the measured envelope."
            : "Every product clears the measured envelope and the supplied access opening."
        }
        entries={results.fits}
      >
        {results.fits.map((entry) => (
          <ProductCard
            key={entry.product.id}
            entry={entry}
            status="fit"
            isCompared={comparedIds.includes(entry.product.id)}
            compareDisabled={comparedIds.length >= 3}
            onToggleCompare={() => toggleComparison(entry.product.id)}
            onSelect={() =>
              handleSelection({
                product: entry.product,
                fit: entry.fit,
                access: entry.access,
              })
            }
          />
        ))}
      </ResultSection>

      {measurement.accessWidthMm !== undefined && results.fitsSpaceButFailsAccess.length > 0 ? (
        <ResultSection
          title="Fits the space, access issue"
          description="These fit the destination envelope but not the supplied narrowest access opening."
          entries={results.fitsSpaceButFailsAccess}
          tone="warning"
        >
          {results.fitsSpaceButFailsAccess.map((entry) => (
            <ProductCard key={entry.product.id} entry={entry} status="access" />
          ))}
        </ResultSection>
      ) : null}

      <ResultSection
        title="Near misses"
        description="Kept separate so an almost-fit is never presented as safe."
        entries={results.nearMisses}
        tone="danger"
      >
        {results.nearMisses.slice(0, 6).map((entry) => (
          <ProductCard key={entry.product.id} entry={entry} status="near-miss" />
        ))}
      </ResultSection>
    </div>
  );
}

interface ResultSectionProps {
  readonly title: string;
  readonly description: string;
  readonly entries: readonly unknown[];
  readonly tone?: "default" | "warning" | "danger";
  readonly children: React.ReactNode;
}

function ResultSection({
  title,
  description,
  entries,
  tone = "default",
  children,
}: ResultSectionProps): React.JSX.Element {
  const accent =
    tone === "warning" ? "bg-[#c98428]" : tone === "danger" ? "bg-[#b75949]" : "bg-[#3d8a4b]";

  return (
    <section className="mt-2" aria-label={title}>
      <div className="mb-3 flex items-start gap-3">
        <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${accent}`} aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-black tracking-[-0.03em]">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#726a5e]">{description}</p>
        </div>
      </div>
      <div className="grid gap-3">{entries.length > 0 ? children : <EmptyResults />}</div>
    </section>
  );
}

function EmptyResults(): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-dashed border-[#cfc7ba] bg-white/60 p-5 text-sm font-semibold text-[#6f685d]">
      No products in this section. Try a broader category or budget.
    </div>
  );
}

function getFilterChips(query: FurnitureQuery): readonly string[] {
  return [
    ...(query.category === undefined ? [] : [query.category.replace("-", " ")]),
    ...(query.maxPrice === undefined ? [] : [`Under $${query.maxPrice}`]),
    ...query.materials,
    ...query.colors,
    ...query.styles,
  ];
}

function needsEnhancement(query: FurnitureQuery): boolean {
  return (
    query.category === undefined ||
    (query.materials.length === 0 &&
      query.colors.length === 0 &&
      query.styles.length === 0 &&
      query.keywords.length === 0)
  );
}
