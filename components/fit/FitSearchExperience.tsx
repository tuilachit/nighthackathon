"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  CatalogProduct,
  FitSearchExperienceProps,
  FurnitureQuery,
  ProductSelection,
} from "@/lib/catalog-types";
import type { CatalogSource } from "@/lib/catalog-source";
import { CACHED_FURNITURE_QUERIES } from "@/lib/fit-config";
import { buildFitShareUrl } from "@/lib/fit-share-state";
import type { SavedSpace } from "@/lib/saved-spaces";
import { searchProducts } from "@/lib/product-ranker";
import {
  mergeFurnitureQueries,
  parseFurnitureQuery,
  parseFurnitureQueryValue,
} from "@/lib/query-parser";
import { ComparisonPanel } from "./ComparisonPanel";
import { ComparisonTray } from "./ComparisonTray";
import { MeasurementSummary } from "./MeasurementSummary";
import { ProductCard } from "./ProductCard";
import { QueryInput } from "./QueryInput";

interface FitSearchClientProps extends FitSearchExperienceProps {
  readonly products: readonly CatalogProduct[];
  readonly catalogSource?: CatalogSource;
  readonly retailerCount?: number;
  readonly onEditMeasurement?: () => void;
  readonly savedSpaces?: readonly SavedSpace[];
  readonly activeSpaceId?: string;
  readonly onSelectSpace?: (spaceId: string) => void;
  readonly onRenameSpace?: (spaceId: string, name: string) => void;
  readonly onDeleteSpace?: (spaceId: string) => void;
  readonly onNewSpace?: () => void;
  readonly initialComparedProductIds?: readonly string[];
}

interface QueryEnhancementResponse {
  readonly query?: unknown;
}

const COLLAPSED_FIT_LIMIT = 6;

export function FitSearchExperience({
  measurement,
  initialQuery = CACHED_FURNITURE_QUERIES[0],
  onSelectProduct,
  products,
  catalogSource,
  retailerCount = new Set(products.map((product) => product.retailer)).size,
  onEditMeasurement,
  savedSpaces,
  activeSpaceId,
  onSelectSpace,
  onRenameSpace,
  onDeleteSpace,
  onNewSpace,
  initialComparedProductIds = [],
}: FitSearchClientProps): React.JSX.Element {
  const [input, setInput] = useState(initialQuery);
  const [submittedText, setSubmittedText] = useState(initialQuery);
  const [query, setQuery] = useState<FurnitureQuery>(() => parseFurnitureQuery(initialQuery));
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [comparedIds, setComparedIds] = useState<readonly string[]>(
    initialComparedProductIds,
  );
  const [isComparisonOpen, setIsComparisonOpen] = useState(
    initialComparedProductIds.length > 0,
  );
  const [showAllFits, setShowAllFits] = useState(false);
  const results = useMemo(
    () => searchProducts(products, measurement, query),
    [measurement, products, query],
  );
  const comparedEntries = useMemo(
    () =>
      comparedIds.flatMap((productId) => {
        const entry = results.fits.find(
          (candidate) => candidate.product.id === productId,
        );
        return entry === undefined ? [] : [entry];
      }),
    [comparedIds, results.fits],
  );
  const filterChips = getFilterChips(query);
  const visibleFits = showAllFits
    ? results.fits
    : results.fits.slice(0, COLLAPSED_FIT_LIMIT);
  const resolvedCatalogSource =
    catalogSource ?? (products.length > 0 ? "bundled" : "unavailable");

  useEffect(() => {
    if (!isComparisonOpen || comparedEntries.length === 0) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      const comparison = window.document.getElementById("fit-comparison");
      if (typeof comparison?.scrollIntoView === "function") {
        comparison.scrollIntoView({ block: "start" });
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [comparedEntries.length, isComparisonOpen]);

  async function handleSubmit(value: string): Promise<void> {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }

    const localQuery = parseFurnitureQuery(trimmed);
    setSubmittedText(trimmed);
    setQuery(localQuery);
    setComparedIds([]);
    setIsComparisonOpen(false);
    setShowAllFits(false);

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

  function openComparison(): void {
    if (comparedIds.length === 0) {
      const ikea = results.fits.find(
        (entry) => entry.product.retailer === "IKEA",
      );
      const target = results.fits.find(
        (entry) => entry.product.retailer === "Target",
      );
      setComparedIds(
        [ikea?.product.id, target?.product.id].filter(
          (productId): productId is string => productId !== undefined,
        ),
      );
    }
    setIsComparisonOpen(true);
  }

  function handleSelection(selection: ProductSelection): void {
    onSelectProduct(selection);
  }

  async function shareComparison(): Promise<boolean> {
    if (comparedEntries.length === 0) {
      return false;
    }
    const shareUrl = buildFitShareUrl(window.location.origin, {
      measurement,
      query: submittedText,
      comparedProductIds: comparedEntries.map((entry) => entry.product.id),
    });
    return copyText(shareUrl);
  }

  if (resolvedCatalogSource === "unavailable") {
    return (
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-5">
        <ExperienceHeader
          catalogSource={resolvedCatalogSource}
          productCount={0}
          retailerCount={0}
        />
        <MeasurementSummary
          measurement={measurement}
          onEdit={onEditMeasurement}
          savedSpaces={savedSpaces}
          activeSpaceId={activeSpaceId}
          onSelectSpace={onSelectSpace}
          onRenameSpace={onRenameSpace}
          onDeleteSpace={onDeleteSpace}
          onNewSpace={onNewSpace}
        />
        <section
          role="alert"
          data-testid="catalog-unavailable"
          className="rounded-md border border-l-[3px] border-[#8a632d] bg-white p-5"
        >
          <h2 className="fit-display text-xl font-bold tracking-[-0.02em]">
            Live catalog temporarily unavailable
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#17221f]/75">
            We could not load a complete verified catalog of at least 100 real products
            across all three retailers. No placeholder products are being shown.
          </p>
          <p className="mt-3 text-sm font-bold text-[#8a632d]">
            Refresh after the catalog sync completes.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-col gap-5">
      <ExperienceHeader
        catalogSource={resolvedCatalogSource}
        productCount={products.length}
        retailerCount={retailerCount}
      />

      <MeasurementSummary
        measurement={measurement}
        onEdit={onEditMeasurement}
        savedSpaces={savedSpaces}
        activeSpaceId={activeSpaceId}
        onSelectSpace={onSelectSpace}
        onRenameSpace={onRenameSpace}
        onDeleteSpace={onDeleteSpace}
        onNewSpace={onNewSpace}
      />
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
              className="fit-data border border-[#17221f]/25 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#17221f]/75"
            >
              {chip}
            </span>
          ))
        ) : (
          <span className="text-sm font-semibold text-[#17221f]/70">
            Searching verified storage furniture for “{submittedText}”
          </span>
        )}
      </div>

      <ComparisonTray
        entries={comparedEntries}
        onOpen={openComparison}
      />
      {isComparisonOpen ? (
        <ComparisonPanel
          entries={comparedEntries}
          measurement={measurement}
          onClose={() => setIsComparisonOpen(false)}
          onRemove={(productId) => toggleComparison(productId)}
          onShare={shareComparison}
        />
      ) : null}

      <ResultSection
        title="Verified fits"
        description={
          measurement.accessWidthMm === undefined
            ? "Every product clears the measured envelope."
            : "Every product clears the measured envelope and the supplied access opening."
        }
        entries={results.fits}
      >
        {visibleFits.map((entry) => (
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
        {results.fits.length > COLLAPSED_FIT_LIMIT ? (
          <button
            type="button"
            aria-expanded={showAllFits}
            onClick={() => setShowAllFits((current) => !current)}
            className="min-h-12 border border-[#3f6b57] bg-white px-4 text-sm font-bold text-[#315544] hover:bg-[#3f6b57]/10"
          >
            {showAllFits
              ? "Show fewer fits"
              : `Show all ${results.fits.length} fits`}
          </button>
        ) : null}
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

function ExperienceHeader({
  catalogSource,
  productCount,
  retailerCount,
}: {
  readonly catalogSource: CatalogSource;
  readonly productCount: number;
  readonly retailerCount: number;
}): React.JSX.Element {
  return (
    <header className="border-b border-[#17221f]/30 pb-5">
      <div className="flex items-start justify-between gap-4">
        <p className="fit-display text-xl font-bold tracking-[-0.035em]">
          FIT / FIRST
        </p>
        <p
          className="fit-data max-w-[210px] text-right text-[9px] font-bold uppercase leading-4 tracking-[0.05em] text-[#17221f]/65"
          data-testid="catalog-status"
        >
          {catalogSource === "bundled"
            ? `${productCount} verified products / ${retailerCount} retailers / offline ready`
            : "0 products / catalog unavailable"}
        </p>
      </div>
      <h1 className="fit-display mt-5 text-[38px] font-bold leading-[0.98] tracking-[-0.05em]">
        Measured space in.
        <br />
        Only verified fits out.
      </h1>
      <p className="mt-4 max-w-md text-sm leading-6 text-[#17221f]/70">
        Verified dimensions are checked before style, retailer, or price
        enters the ranking.
      </p>
    </header>
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
  const tierClasses =
    tone === "warning"
      ? "border-[#8a632d] text-[#8a632d]"
      : tone === "danger"
        ? "border-[#8a4e48] text-[#8a4e48]"
        : "border-[#3f6b57] text-[#3f6b57]";

  return (
    <section className={`mt-2 border-t-2 pt-3 ${tierClasses}`} aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="text-[#17221f]">
          <h2 className="fit-display text-xl font-bold tracking-[-0.025em]">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#17221f]/65">{description}</p>
        </div>
        <span className="fit-data min-w-10 border border-current px-2 py-1 text-center text-sm font-bold">
          {entries.length}
        </span>
      </div>
      <div className="grid gap-3">{entries.length > 0 ? children : <EmptyResults />}</div>
    </section>
  );
}

function EmptyResults(): React.JSX.Element {
  return (
    <div className="rounded-sm border border-dashed border-[#17221f]/35 bg-white p-5 text-sm font-semibold text-[#17221f]/70">
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

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}
