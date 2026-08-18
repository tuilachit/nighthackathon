import Link from "next/link";

interface JourneyRouteSlotProps {
  readonly kind: "space" | "space-review";
}

const CONTENT = {
  space: {
    title: "Measure your space",
    detail: "Enter the available width, height and depth. Add the narrowest access opening when you know it.",
    primaryHref: "/fit/space/review",
    primaryLabel: "Review measurements",
    secondaryHref: "/fit",
    secondaryLabel: "Back to Fitment",
  },
  "space-review": {
    title: "Review your measurements",
    detail: "Confirm the measured envelope before any retailer or model provider can be contacted.",
    primaryHref: "/fit/search",
    primaryLabel: "Continue to search",
    secondaryHref: "/fit/space",
    secondaryLabel: "Edit measurements",
  },
} as const;

/** Server-only route slot replaced by the journey screen during UI integration. */
export function JourneyRouteSlot({ kind }: JourneyRouteSlotProps): React.JSX.Element {
  const content = CONTENT[kind];
  return (
    <main
      id="fit-main"
      data-fit-route-surface={kind}
      className="min-h-screen bg-[#f4f7f5] px-4 pb-20 pt-20 text-[#17221f] sm:px-6"
    >
      <section className="mx-auto w-full max-w-[430px] border border-[#17221f]/30 bg-white p-5">
        <h1 className="fit-display text-2xl font-bold tracking-[-0.03em]">{content.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#17221f]/75">{content.detail}</p>
        <div className="mt-6 grid gap-2">
          <Link
            href={content.primaryHref}
            className="flex min-h-12 items-center justify-center bg-[#17221f] px-4 text-sm font-bold text-white"
          >
            {content.primaryLabel}
          </Link>
          <Link
            href={content.secondaryHref}
            className="flex min-h-12 items-center justify-center border border-[#17221f]/35 bg-white px-4 text-sm font-bold"
          >
            {content.secondaryLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
