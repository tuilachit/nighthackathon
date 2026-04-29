"use client";

import { useEffect, useMemo, useState } from "react";
import { createDeterministicQrPattern } from "@/lib/qr";
import type { PrototypeSpec } from "@/lib/prototype-types";

interface PhoneHandoffProps {
  readonly prototype: PrototypeSpec;
}

export function PhoneHandoff({ prototype }: PhoneHandoffProps): React.JSX.Element {
  const [origin, setOrigin] = useState<string>("");
  const arPath = `/ar/${prototype.id}`;
  const arUrl = origin.length > 0 ? `${origin}${arPath}` : arPath;
  const pattern = useMemo(() => createDeterministicQrPattern(arUrl), [arUrl]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="grid h-36 w-36 shrink-0 self-center rounded-lg border border-slate-200 bg-white p-2 sm:self-auto"
          style={{ gridTemplateColumns: `repeat(${pattern.size}, minmax(0, 1fr))` }}
          aria-label={`QR-style phone handoff for ${arUrl}`}
        >
          {Array.from({ length: pattern.size * pattern.size }, (_, index) => {
            const row = Math.floor(index / pattern.size);
            const col = index % pattern.size;
            const active = pattern.modules.some((module) => module.row === row && module.col === col);
            return <span key={`${row}-${col}`} className={active ? "bg-slate-950" : "bg-white"} />;
          })}
        </div>

        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold text-slate-900">Phone handoff</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Open this seeded AR route on the demo phone. The visual code is deterministic for the URL; use the link
            below if your camera does not scan it.
          </p>
          <a href={arPath} className="mt-3 inline-flex break-all text-sm font-semibold text-[#2563EB]">
            {arUrl}
          </a>
        </div>
      </div>
    </section>
  );
}
