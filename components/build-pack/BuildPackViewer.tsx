"use client";

import { useState } from "react";
import type { BuildPack } from "@/lib/prototype-types";

interface BuildPackViewerProps {
  readonly buildPack: BuildPack;
}

export function BuildPackViewer({ buildPack }: BuildPackViewerProps): React.JSX.Element {
  const [activePath, setActivePath] = useState<string>(buildPack.files[0]?.path ?? "");
  const activeFile = buildPack.files.find((file) => file.path === activePath) ?? buildPack.files[0];

  return (
    <div className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)] lg:grid lg:grid-cols-[280px_1fr]">
      <nav className="min-w-0 border-b border-black/10 bg-white p-2 lg:border-b-0 lg:border-r">
        <div className="mb-2 flex items-center gap-2 px-2 py-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="mono ml-2 text-[11px] font-semibold text-slate-500">reality-mvp/</span>
        </div>
        {buildPack.files.map((file) => (
          <button
            type="button"
            key={file.path}
            onClick={() => setActivePath(file.path)}
            className={`block w-full min-w-0 rounded-md border-l-2 px-3 py-2 text-left text-sm font-medium ${
              file.path === activeFile.path
                ? "border-black bg-black text-white"
                : "border-transparent text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="mono block truncate text-[11px]">{file.path}</span>
          </button>
        ))}
      </nav>

      <section className="min-w-0 overflow-hidden bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
          <div>
            <p className="mono break-all text-sm font-semibold text-slate-50">{activeFile.path}</p>
            <p className="text-xs text-slate-500">{activeFile.language}</p>
          </div>
        </div>

        {activeFile.warnings.length > 0 ? (
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
            {activeFile.warnings.map((warning) => (
              <p key={warning} className="text-xs leading-5 text-amber-200">
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        <pre className="noscroll max-h-[620px] overflow-auto bg-transparent p-4 text-xs leading-5 text-slate-100">
          <code>{activeFile.content}</code>
        </pre>
      </section>
    </div>
  );
}
