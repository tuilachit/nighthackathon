import { getIosModelSource, getPrimaryModelSource, isSupportedModelAssetSource } from "@/lib/assets";
import type { PrototypeSpec } from "@/lib/prototype-types";

interface PreflightPanelProps {
  readonly prototype: PrototypeSpec;
}

interface PreflightItem {
  readonly label: string;
  readonly detail: string;
  readonly ready: boolean;
}

export function PreflightPanel({ prototype }: PreflightPanelProps): React.JSX.Element {
  const modelSource = getPrimaryModelSource(prototype.model);
  const iosSource = getIosModelSource(prototype.model);
  const items: readonly PreflightItem[] = [
    { label: "Result route", detail: `/result/${prototype.id}`, ready: true },
    { label: "AR route", detail: `/ar/${prototype.id}`, ready: true },
    { label: "AR GLB", detail: modelSource, ready: isSupportedModelAssetSource(modelSource, "glb") },
    {
      label: "iOS Quick Look asset",
      detail: iosSource ?? "USDZ not configured yet",
      ready: iosSource !== undefined && isSupportedModelAssetSource(iosSource, "usdz"),
    },
    { label: "Build Pack", detail: `/build-pack/${prototype.id}`, ready: true },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Demo preflight</h2>
          <p className="mt-1 text-sm text-slate-500">Check these before handing the phone to a judge.</p>
        </div>
        <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          Phone test required
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.ready ? "bg-[#10B981]" : "bg-[#F59E0B]"}`} />
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
              <p className="mt-1 break-all text-xs leading-5 text-slate-600">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
