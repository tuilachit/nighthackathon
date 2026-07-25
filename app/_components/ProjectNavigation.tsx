"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const DEFAULT_ID = "reality-mvp-prototype";

const NAV_ITEMS: ReadonlyArray<{
  readonly href: string;
  readonly label: string;
}> = [
  { href: "/", label: "Create" },
  { href: "/fit", label: "Fit Search" },
  { href: `/result/${DEFAULT_ID}`, label: "Result" },
  { href: `/ar/${DEFAULT_ID}`, label: "AR" },
  { href: `/build-pack/${DEFAULT_ID}`, label: "Build Pack" },
];

export function ProjectNavigation(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Project sections"
      className="fixed right-3 top-3 z-50 flex max-w-[calc(100vw-1.5rem)] gap-1 overflow-x-auto rounded-lg border border-slate-200/70 bg-white/90 p-1 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
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
