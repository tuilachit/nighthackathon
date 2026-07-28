import { CACHED_FURNITURE_QUERIES } from "@/lib/fit-config";
import { VoiceRecorder } from "./VoiceRecorder";

interface QueryInputProps {
  readonly value: string;
  readonly isEnhancing: boolean;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (value: string) => void;
}

export function QueryInput({
  value,
  isEnhancing,
  onChange,
  onSubmit,
}: QueryInputProps): React.JSX.Element {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (value.trim().length > 0) {
      onSubmit(value);
    }
  }

  return (
    <section aria-labelledby="query-title" className="rounded-md border border-[#17221f]/35 bg-white p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="fit-data text-[9px] font-bold uppercase tracking-[0.12em] text-[#17221f]/65">
            Search intent
          </p>
          <h2 id="query-title" className="fit-display mt-1 text-xl font-bold tracking-[-0.025em]">
            What should fit here?
          </h2>
        </div>
        <span className="fit-data text-[10px] font-semibold uppercase tracking-[0.06em] text-[#17221f]/65">
          {isEnhancing ? "Refining…" : "Local-first"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <label htmlFor="furniture-query" className="sr-only">
          Describe the furniture you want
        </label>
        <div className="flex flex-col gap-2 rounded-sm border border-[#17221f]/35 bg-[#f4f7f5] p-2 focus-within:border-[#17221f] focus-within:ring-1 focus-within:ring-[#17221f] sm:flex-row">
          <input
            id="furniture-query"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Warm oak narrow bookshelf under $300"
            className="fit-data min-h-12 min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold outline-none placeholder:text-[#17221f]/65"
          />
          <button
            type="submit"
            disabled={value.trim().length === 0}
            className="min-h-12 rounded-sm bg-[#17221f] px-5 text-sm font-bold text-white hover:bg-[#26332f] disabled:cursor-not-allowed disabled:bg-[#17221f]/40"
          >
            Find what fits
          </button>
        </div>
        <div className="mt-3">
          <VoiceRecorder onTranscript={onChange} />
        </div>
      </form>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {CACHED_FURNITURE_QUERIES.map((query) => (
          <button
            type="button"
            key={query}
            className="fit-data min-h-11 shrink-0 rounded-sm border border-[#17221f]/25 bg-white px-3 py-2 text-left text-[10px] font-bold text-[#17221f]/80 hover:border-[#17221f]"
            onClick={() => {
              onChange(query);
              onSubmit(query);
            }}
          >
            {query}
          </button>
        ))}
      </div>
    </section>
  );
}
