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
    <section aria-labelledby="query-title" className="rounded-[28px] border border-[#ded8cd] bg-white p-5 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-[#887f71]">Step 2</p>
          <h2 id="query-title" className="mt-1 text-2xl font-black tracking-[-0.03em]">
            What should fit here?
          </h2>
        </div>
        <span className="text-xs font-semibold text-[#887f71]">
          {isEnhancing ? "Refining…" : "Local-first"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <label htmlFor="furniture-query" className="sr-only">
          Describe the furniture you want
        </label>
        <div className="flex flex-col gap-2 rounded-2xl border border-[#cfc7ba] bg-[#fbfaf7] p-2 focus-within:border-[#a47b38] sm:flex-row">
          <input
            id="furniture-query"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Warm oak narrow bookshelf under $300"
            className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-base font-semibold outline-none placeholder:text-[#9b9386]"
          />
          <button
            type="submit"
            disabled={value.trim().length === 0}
            className="min-h-12 rounded-xl bg-[#1c1b18] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#aaa399]"
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
            className="shrink-0 rounded-full border border-[#ded8cd] bg-[#fbfaf7] px-3 py-2 text-left text-xs font-bold text-[#595247] hover:border-[#a47b38]"
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
