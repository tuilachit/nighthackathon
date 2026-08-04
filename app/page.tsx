import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/site-config";

const DEMO_RECORDING_PATH = "docs/assets/fitment-demo.gif";

export default function RootPage(): React.JSX.Element {
  return (
    <main className="fit-instrument min-h-svh px-4 py-5 sm:px-6 sm:py-7">
      <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-[960px] flex-col border border-[#17221f]/25 bg-white sm:min-h-[calc(100svh-3.5rem)]">
        <header className="flex items-center justify-between border-b border-[#17221f]/25 px-4 py-3 sm:px-6">
          <p className="fit-display text-lg font-bold tracking-[-0.035em]">
            {PRODUCT_NAME.toUpperCase()}
          </p>
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.1em] text-[#17221f]/60">
            Measure · compare · place
          </p>
        </header>

        <div className="grid flex-1 items-stretch lg:grid-cols-[1.02fr_0.98fr]">
          <section className="flex flex-col justify-between px-4 py-7 sm:px-8 sm:py-10 lg:border-r lg:border-[#17221f]/25">
            <div>
              <h1 className="fit-display max-w-[650px] text-[52px] font-bold leading-[0.88] tracking-[-0.065em] sm:text-[72px]">
                Furniture,
                <br />
                measured true.
              </h1>
              <p className="mt-6 max-w-[520px] text-base leading-7 text-[#17221f]/74 sm:text-lg">
                only shows you furniture that actually fits, your space and
                your front door
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:max-w-[520px]">
              <Link
                href="/fit?new=1"
                className="flex min-h-12 items-center justify-center rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white transition-colors hover:bg-[#2a3b36]"
              >
                Measure your space
              </Link>
              <Link
                href="/fit?demo=1"
                className="flex min-h-12 items-center justify-center rounded-sm border border-[#17221f]/35 bg-white px-5 text-sm font-bold text-[#17221f] transition-colors hover:border-[#17221f]"
              >
                Try a demo space
              </Link>
            </div>
            <Link
              href="/how-it-works"
              className="fit-data mt-5 inline-flex min-h-11 items-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#17221f] underline decoration-[#17221f]/35 underline-offset-4 hover:decoration-[#17221f]"
            >
              How Fitment works
            </Link>
          </section>

          <figure
            aria-label="Demo video placeholder"
            className="relative m-4 flex min-h-[225px] flex-col justify-between overflow-hidden border border-[#17221f]/30 bg-[#f4f7f5] p-4 sm:m-6 sm:min-h-[300px] sm:p-6"
          >
            <figcaption className="fit-data flex items-start justify-between gap-4 text-[9px] font-bold uppercase leading-4 tracking-[0.1em] text-[#17221f]/60">
              <span>Phone walkthrough</span>
              <span className="max-w-[190px] break-all text-right">
                {DEMO_RECORDING_PATH}
              </span>
            </figcaption>

            <div className="mx-auto w-full max-w-[430px]">
              <div className="fit-data mb-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold uppercase tracking-[0.06em] text-[#17221f]/64">
                <span>Space</span>
                <span>Door</span>
                <span>Product</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="h-20 border border-[#17221f]/28 bg-white" />
                <div className="mx-auto h-20 w-10 border-x border-t border-[#8a632d]" />
                <div className="mx-auto h-20 w-14 border border-[#3f6b57] bg-white" />
              </div>
              <div className="fit-dimension-annotation mt-4 text-center">
                <span className="fit-dimension-annotation__value fit-data text-[11px] font-bold uppercase tracking-[0.05em]">
                  34 mm clearance
                </span>
              </div>
            </div>

            <p className="fit-data text-[9px] font-bold uppercase tracking-[0.1em] text-[#3f6b57]">
              The dimension is the decision
            </p>
          </figure>
        </div>
      </div>
    </main>
  );
}
