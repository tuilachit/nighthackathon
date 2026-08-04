"use client";

import Image from "next/image";
import { useState } from "react";
import type {
  EvaluatedProduct,
  SpaceMeasurement,
} from "@/lib/catalog-types";

interface ComparisonPanelProps {
  readonly entries: readonly EvaluatedProduct[];
  readonly measurement: SpaceMeasurement;
  readonly onClose: () => void;
  readonly onRemove: (productId: string) => void;
  readonly onView: (entry: EvaluatedProduct) => void;
  readonly onShare: () => Promise<{
    readonly copied: boolean;
    readonly url?: string;
  }>;
}

export function ComparisonPanel({
  entries,
  measurement,
  onClose,
  onRemove,
  onView,
  onShare,
}: ComparisonPanelProps): React.JSX.Element | null {
  const [shareStatus, setShareStatus] = useState<
    "idle" | "preparing" | "copied" | "ready" | "failed"
  >("idle");
  const [qrImageUrl, setQrImageUrl] = useState<string>();
  const [shareUrl, setShareUrl] = useState<string>();
  if (entries.length === 0) {
    return null;
  }

  return (
    <section
      id="fit-comparison"
      aria-labelledby="compare-title"
      className="scroll-mt-4 border border-[#17221f] bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="px-4 py-4">
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.12em] text-[#17221f]/65">
            Shared measured envelope
          </p>
          <h2 id="compare-title" className="fit-display mt-1 text-xl font-bold tracking-[-0.025em]">
            Clearance comparison
          </h2>
          <p className="fit-data mt-2 text-[10px] font-bold text-[#17221f]/65">
            {measurement.widthMm} W × {measurement.heightMm} H ×{" "}
            {measurement.depthMm} D mm
          </p>
        </div>
        <div className="mr-3 mt-3 flex items-center gap-2">
          <span className="fit-data border border-[#17221f]/30 bg-[#f4f7f5] px-2 py-1.5 text-xs font-bold">
            {entries.length}/3
          </span>
          <button
            type="button"
            onClick={() => {
              setShareStatus("preparing");
              void Promise.all([import("qrcode"), onShare()])
                .then(async ([QRCode, result]) => {
                  if (result.url === undefined) {
                    setShareStatus("failed");
                    return;
                  }
                  const svg = await QRCode.default.toString(result.url, {
                    type: "svg",
                    width: 960,
                    margin: 2,
                    errorCorrectionLevel: "M",
                    color: { dark: "#17221f", light: "#ffffff" },
                  });
                  setShareUrl(result.url);
                  setQrImageUrl(
                    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
                  );
                  setShareStatus(result.copied ? "copied" : "ready");
                })
                .catch(() => setShareStatus("failed"));
            }}
            disabled={shareStatus === "preparing"}
            className="min-h-11 px-2 text-xs font-bold underline decoration-[#17221f]/35 underline-offset-4"
          >
            {shareStatus === "preparing"
              ? "Preparing…"
              : shareStatus === "copied"
              ? "Link copied"
              : shareStatus === "ready"
                ? "QR ready"
              : shareStatus === "failed"
                ? "Try sharing again"
                : "Share"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-2 text-xs font-bold underline decoration-[#17221f]/35 underline-offset-4"
          >
            Close
          </button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {shareStatus === "copied"
          ? "Comparison link copied to clipboard."
          : shareStatus === "failed"
            ? "Could not copy the comparison link."
            : ""}
      </p>

      {qrImageUrl !== undefined && shareUrl !== undefined ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-qr-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#17221f]/95 p-4 sm:p-8"
        >
          <div className="flex max-h-full w-full max-w-[760px] flex-col items-center overflow-auto bg-white p-4 text-center text-[#17221f] sm:p-8">
            <div className="flex w-full items-start justify-between gap-4 border-b border-[#17221f]/25 pb-4 text-left">
              <div>
                <p className="fit-data text-[10px] font-bold uppercase tracking-[0.12em] text-[#17221f]/60">
                  Exact measured comparison
                </p>
                <h3
                  id="share-qr-title"
                  className="fit-display mt-1 text-2xl font-bold tracking-[-0.035em] sm:text-3xl"
                >
                  Scan to compare on your phone
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQrImageUrl(undefined)}
                className="min-h-11 shrink-0 px-2 text-xs font-bold underline decoration-[#17221f]/35 underline-offset-4"
              >
                Close
              </button>
            </div>
            <Image
              src={qrImageUrl}
              alt="QR code for this exact furniture comparison"
              width={640}
              height={640}
              unoptimized
              className="mt-5 aspect-square w-full max-w-[min(70vh,640px)] bg-white"
            />
            <p className="fit-data mt-4 max-w-full break-all text-[10px] font-semibold leading-4 text-[#17221f]/65">
              {shareUrl}
            </p>
          </div>
        </div>
      ) : null}

      <div className="fit-comparison-grid border-t border-[#17221f]/25">
        {entries.map((entry) => (
          <article
            key={entry.product.id}
            className="min-w-0 border-r border-[#17221f]/20 p-3 last:border-r-0"
          >
            <p className="fit-data text-[9px] font-bold uppercase tracking-[0.1em] text-[#17221f]/65">
              {entry.product.retailer}
            </p>
            <h3 className="mt-1 min-h-10 text-xs font-bold leading-tight">
              {entry.product.name}
            </h3>
            <p className="fit-data mt-2 text-[9px] font-semibold leading-4 text-[#17221f]/60">
              {entry.product.dimensions.widthMm} W ×{" "}
              {entry.product.dimensions.heightMm} H ×{" "}
              {entry.product.dimensions.depthMm} D
            </p>
            <div
              className="mt-3 border border-[#3f6b57]/30 bg-[#f4f7f5]/70 px-2 py-3 text-center text-[#3f6b57]"
              aria-label={`${entry.product.name} clearance drawing`}
            >
              <ComparisonDimension
                label="W clearance"
                value={entry.fit.widthClearanceMm}
              />
              <ComparisonDimension
                label="H clearance"
                value={entry.fit.heightClearanceMm}
              />
              <ComparisonDimension
                label="D clearance"
                value={entry.fit.depthClearanceMm}
              />
            </div>
            <p className="fit-data mt-3 text-2xl font-bold leading-none text-[#3f6b57]">
              {entry.fit.minimumClearanceMm}
              <span className="ml-1 text-[9px] tracking-normal text-[#17221f]/65">
                mm min
              </span>
            </p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => onView(entry)}
                className="min-h-11 rounded-sm bg-[#17221f] px-2 text-[11px] font-bold text-white hover:bg-[#26332f]"
              >
                View in room
              </button>
              <button
                type="button"
                onClick={() => onRemove(entry.product.id)}
                className="min-h-11 text-xs font-bold text-[#17221f] underline decoration-[#17221f]/40 underline-offset-4"
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      {entries.length >= 2 ? <ClearanceDifference entries={entries} /> : null}
    </section>
  );
}

function ComparisonDimension({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}): React.JSX.Element {
  return (
    <div className="mb-2 last:mb-0">
      <p className="fit-data text-[7px] font-bold uppercase tracking-[0.08em] text-[#17221f]/60">
        {label}
      </p>
      <div className="fit-dimension-annotation" aria-label={`${value} millimetres ${label}`}>
        <span className="fit-data fit-dimension-annotation__value bg-[#f4f7f5] text-[10px] font-bold">
          {value} mm
        </span>
      </div>
    </div>
  );
}

function ClearanceDifference({
  entries,
}: {
  readonly entries: readonly EvaluatedProduct[];
}): React.JSX.Element {
  const [first, second] = entries;
  if (first === undefined || second === undefined) {
    return <></>;
  }
  const difference = Math.abs(
    first.fit.minimumClearanceMm - second.fit.minimumClearanceMm,
  );
  const roomier =
    first.fit.minimumClearanceMm >= second.fit.minimumClearanceMm
      ? first
      : second;

  return (
    <div className="border-t border-[#17221f] bg-[#17221f] px-4 py-3 text-white">
      <p className="fit-data text-[8px] font-bold uppercase tracking-[0.12em] text-white/65">
        Minimum-clearance difference
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-xs font-semibold leading-5">
          {difference === 0
            ? "Both leave the same minimum clearance."
            : `${roomier.product.name} leaves more room.`}
        </p>
        <p className="fit-data whitespace-nowrap text-2xl font-bold">
          Δ {difference} mm
        </p>
      </div>
    </div>
  );
}
