import type { BuildPackArtifact } from "@/lib/build-pack";

export function BuildPackViewer({ artifacts }: { artifacts: BuildPackArtifact[] }) {
  return (
    <div className="space-y-4">
      {artifacts.map((artifact) => (
        <article key={artifact.path} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-4 py-3">
            <p className="font-mono text-xs font-bold text-blue-700">{artifact.path}</p>
          </header>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-4 text-xs leading-6 text-slate-800">
            <code>{artifact.body}</code>
          </pre>
        </article>
      ))}
    </div>
  );
}
