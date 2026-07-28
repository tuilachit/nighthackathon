"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DEFAULT_ID = "reality-mvp-prototype";

const NAV_ITEMS: ReadonlyArray<{
  readonly href: string;
  readonly label: string;
}> = [
  { href: "/fit", label: "Fit Search" },
  { href: `/result/${DEFAULT_ID}`, label: "Result" },
  { href: `/ar/${DEFAULT_ID}`, label: "AR" },
  { href: `/build-pack/${DEFAULT_ID}`, label: "Build Pack" },
];

export function ProjectNavigation(): React.JSX.Element {
  const pathname = usePathname();
  const isFitRoute = pathname.startsWith("/fit");

  return (
    <nav
      aria-label="Project sections"
      className={
        isFitRoute
          ? "absolute right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] gap-1 overflow-x-auto rounded-sm border border-[#17221f]/25 bg-[#f4f7f5] p-1 text-[10px] font-semibold text-[#17221f]/65"
          : "fixed right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] gap-1 overflow-x-auto rounded-lg border border-slate-200/70 bg-white/90 p-1 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur"
      }
    >
      {NAV_ITEMS.map((item) => {
        const isActive = pathname.startsWith(item.href);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={
              isFitRoute
                ? isActive
                  ? "whitespace-nowrap rounded-sm bg-[#17221f] px-3 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
                  : "whitespace-nowrap rounded-sm px-3 py-2 hover:bg-white hover:text-[#17221f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17221f]"
                : isActive
                  ? "whitespace-nowrap rounded-md bg-slate-950 px-3 py-2 text-white"
                  : "whitespace-nowrap rounded-md px-3 py-2 hover:bg-slate-100 hover:text-slate-950"
            }
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
