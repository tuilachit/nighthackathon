import type { Metadata } from "next";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Measure a space, search verified furniture, compare clearances, check the delivery opening, and buy with confidence.",
};

const STEPS = [
  {
    number: "01",
    title: "Measure",
    copy: "Enter the clear width, height, depth, and narrowest opening on the delivery path.",
    readout: "900 × 1800 × 350 mm",
  },
  {
    number: "02",
    title: "Search",
    copy: "Describe the furniture you want. Fitment checks only products with verified dimensions.",
    readout: "verified dimensions only",
  },
  {
    number: "03",
    title: "Compare",
    copy: "See cross-retailer choices against one measured envelope, including their minimum clearance.",
    readout: "+34 mm clearance",
  },
  {
    number: "04",
    title: "Check the doorway",
    copy: "A separate access check tests the product's smallest transport cross-section before it reaches the room.",
    readout: "820 mm access opening",
  },
  {
    number: "05",
    title: "Place or buy",
    copy: "Inspect a dimensionally scaled model in 3D or AR, then continue to the original retailer page.",
    readout: "scale 1 : 1",
  },
] as const;

export default function HowItWorksPage(): React.JSX.Element {
  return (
    <main className="fit-instrument min-h-svh px-4 py-5 sm:px-6 sm:py-7">
      <article className="mx-auto w-full max-w-[960px] border border-[#17221f]/25 bg-white">
        <header className="flex items-center justify-between border-b border-[#17221f]/25 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="fit-display text-lg font-bold tracking-[-0.035em]"
          >
            {PRODUCT_NAME.toUpperCase()}
          </Link>
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.1em] text-[#17221f]/60">
            Decision path
          </p>
        </header>

        <section className="border-b border-[#17221f]/25 px-4 py-8 sm:px-8 sm:py-10">
          <h1 className="fit-display max-w-[680px] text-[46px] font-bold leading-[0.92] tracking-[-0.055em] sm:text-[64px]">
            From empty space
            <br />
            to a measured decision.
          </h1>
          <p className="mt-5 max-w-[600px] text-base leading-7 text-[#17221f]/74">
            Five steps. The same verified dimensions drive search, comparison,
            access checking, and real-scale placement.
          </p>
        </section>

        <ol className="divide-y divide-[#17221f]/20">
          {STEPS.map((step) => (
            <li
              key={step.number}
              className="grid gap-4 px-4 py-6 sm:grid-cols-[54px_1fr_230px] sm:items-center sm:px-8"
            >
              <span className="fit-data text-xs font-bold text-[#17221f]/50">
                {step.number}
              </span>
              <div>
                <h2 className="fit-display text-2xl font-bold tracking-[-0.035em]">
                  {step.title}
                </h2>
                <p className="mt-1 max-w-[560px] text-sm leading-6 text-[#17221f]/72">
                  {step.copy}
                </p>
              </div>
              <div className="fit-dimension-annotation sm:text-right">
                <span className="fit-dimension-annotation__value fit-data text-[10px] font-bold uppercase tracking-[0.05em]">
                  {step.readout}
                </span>
              </div>
            </li>
          ))}
        </ol>

        <footer className="grid gap-3 border-t border-[#17221f]/25 p-4 sm:grid-cols-2 sm:p-6">
          <Link
            href="/fit?new=1"
            className="flex min-h-12 items-center justify-center rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white hover:bg-[#2a3b36]"
          >
            Measure your space
          </Link>
          <Link
            href="/fit?demo=1"
            className="flex min-h-12 items-center justify-center rounded-sm border border-[#17221f]/35 bg-white px-5 text-sm font-bold text-[#17221f] hover:border-[#17221f]"
          >
            Try a demo space
          </Link>
        </footer>
      </article>
    </main>
  );
}
