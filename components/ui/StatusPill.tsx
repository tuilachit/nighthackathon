interface StatusPillProps {
  readonly tone: "primary" | "success" | "warning" | "neutral";
  readonly children: React.ReactNode;
}

const TONE_CLASS_NAMES: Record<StatusPillProps["tone"], string> = {
  primary: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-600",
};

export function StatusPill({ tone, children }: StatusPillProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${TONE_CLASS_NAMES[tone]}`}
    >
      {children}
    </span>
  );
}
