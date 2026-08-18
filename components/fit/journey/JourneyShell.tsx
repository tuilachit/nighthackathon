import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/site-config";

interface JourneyShellProps {
  readonly title: string;
  readonly support: string;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly status?: string;
  readonly children: React.ReactNode;
}

/** Keeps every journey route to one concise, mobile-first decision surface. */
export function JourneyShell({
  title,
  support,
  backHref,
  backLabel = "Back",
  status,
  children,
}: JourneyShellProps): React.JSX.Element {
  return (
    <main
      id="fit-main"
      className="min-h-svh bg-[#f4f7f5] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 text-[#17221f] sm:px-6 sm:pt-6"
    >
      <div className="mx-auto flex min-h-[calc(100svh-2rem)] w-full max-w-[430px] flex-col border border-[#17221f]/25 bg-white sm:min-h-[calc(100svh-3rem)]">
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[#17221f]/20 px-4">
          {backHref === undefined ? (
            <span className="fit-display text-base font-bold tracking-[-0.035em]">
              {PRODUCT_NAME.toUpperCase()}
            </span>
          ) : (
            <Link
              href={backHref}
              className="inline-flex min-h-11 items-center text-sm font-bold underline decoration-[#17221f]/30 underline-offset-4 hover:decoration-[#17221f]"
            >
              {backLabel}
            </Link>
          )}
          {status === undefined ? null : (
            <span className="fit-data text-right text-[9px] font-bold uppercase tracking-[0.08em] text-[#17221f]/65">
              {status}
            </span>
          )}
        </header>

        <section className="flex flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
          <h1 className="fit-display text-[34px] font-bold leading-[0.98] tracking-[-0.05em]">
            {title}
          </h1>
          <p className="mt-3 max-w-[36ch] text-sm leading-6 text-[#17221f]/72">
            {support}
          </p>
          <div className="mt-6 flex flex-1 flex-col">{children}</div>
        </section>
      </div>
    </main>
  );
}

export function JourneyLoading({
  label = "Loading your space",
}: {
  readonly label?: string;
}): React.JSX.Element {
  return (
    <main
      id="fit-main"
      aria-busy="true"
      className="min-h-svh bg-[#f4f7f5] px-4 py-4 text-[#17221f]"
    >
      <span className="sr-only">{label}</span>
    </main>
  );
}
