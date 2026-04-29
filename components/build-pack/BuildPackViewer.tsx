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
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-[#0F172A] shadow-sm lg:grid lg:grid-cols-[280px_1fr]">
      <nav className="border-b border-slate-800 bg-[#0B1220] p-2 lg:border-b-0 lg:border-r">
        <div className="mb-2 flex items-center gap-2 px-2 py-1">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="mono ml-2 text-[11px] font-semibold text-slate-400">reality-mvp/</span>
        </div>
        {buildPack.files.map((file) => (
          <button
            type="button"
            key={file.path}
            onClick={() => setActivePath(file.path)}
            className={`block w-full rounded-md border-l-2 px-3 py-2 text-left text-sm font-medium ${
              file.path === activeFile.path
                ? "border-[#2563EB] bg-blue-500/15 text-slate-50"
                : "border-transparent text-slate-300 hover:bg-slate-800/70"
            }`}
          >
            <span className="mono text-[11px]">{file.path}</span>
          </button>
        ))}
      </nav>

      <section className="min-w-0 overflow-hidden bg-[#0F172A]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#0B1220] px-4 py-3">
          <div>
            <p className="mono text-sm font-semibold text-slate-50">{activeFile.path}</p>
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

        <pre className="noscroll max-h-[620px] overflow-auto bg-[#0F172A] p-4 text-xs leading-5 text-slate-100">
          <code>{activeFile.content}</code>
        </pre>
      </section>
    </div>
  );
}
