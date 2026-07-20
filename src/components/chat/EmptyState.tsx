import { Microscope } from "lucide-react";
import { FLAT_SUGGESTIONS } from "../../theme";

export function EmptyState({
  hasData,
  online,
  onPrompt,
}: {
  hasData: boolean;
  online: boolean | null;
  onPrompt: (p: string) => void;
}) {
  return (
    <div className="m-auto flex flex-col items-center gap-7 px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm bg-primary-soft">
          <Microscope size={30} className="text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">SGRH Lab Assistant</h2>
          <p className="text-[15px] text-muted-foreground max-w-md leading-relaxed mx-auto">
            {online === false
              ? "Backend offline — start the FastAPI server, then upload a file or connect a database."
              : hasData
                ? "Ask anything about your lab data — summaries, KPIs, charts, tables, and turnaround times."
                : "Upload a CSV/Excel file or connect a database in the sidebar to begin."}
          </p>
        </div>
      </div>
      {online !== false && (
        <div className="w-full max-w-lg">
          <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-3 text-center">
            {hasData ? "Try asking" : "Example questions"}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {FLAT_SUGGESTIONS.slice(0, 6).map(({ q, color, label }) => (
              <button
                key={q}
                onClick={() => onPrompt(q)}
                className="flex flex-col gap-1.5 text-left px-3.5 py-3 rounded-2xl border border-border bg-card shadow-sm hover:border-muted-foreground/30 hover:shadow-md hover:-translate-y-px transition-all duration-150 group"
              >
                {/* The dot carries the metric identity (a per-mode CSS var); the
                    label stays on a text token. Tinting small caps with the series
                    colour costs real legibility — Cost sits at 1.95:1 on the dark
                    card — and the dot beside it already says which domain it is. */}
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-xxs font-bold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </span>
                </span>
                <span className="text-xs text-foreground/90 group-hover:text-foreground leading-snug transition-colors">
                  {q}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
