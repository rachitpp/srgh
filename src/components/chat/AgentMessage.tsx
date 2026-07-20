import { AlertCircle, FlaskConical, Pin } from "lucide-react";
import type { Message, Visual } from "../../types";
import { detectMetric } from "../../theme";
import { cn, fmt, pinTitle } from "../../lib/utils";
import { HtmlVisual } from "../HtmlVisual";
import { ErrorBoundary } from "../ErrorBoundary";
import { CopyButton } from "./CopyButton";
import { TypingDots } from "./TypingDots";

export function AgentMessage({
  msg,
  sourceNote,
  onPin,
}: {
  msg: Message;
  sourceNote?: string;
  onPin?: (v: Visual, title: string) => void;
}) {
  if (msg.loading) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-brand">
          <FlaskConical size={15} className="text-brand-foreground" />
        </div>
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
          <TypingDots />
        </div>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-destructive/15">
          <AlertCircle size={15} className="text-destructive" />
        </div>
        <div className="bg-destructive/10 border border-destructive/20 rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg">
          <p className="text-sm text-destructive leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          <p className="text-xs text-destructive/70 mt-1">{fmt(msg.timestamp)}</p>
        </div>
      </div>
    );
  }

  // Insight card — every answer framed like an analytics product: metric tag +
  // timestamp header, the insight sentence as the headline, visuals in the body,
  // and a quiet data-source footer.
  const metric = detectMetric(msg.text || "");
  const hasVisuals = !!msg.visuals?.length;
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-brand">
        <FlaskConical size={15} className="text-brand-foreground" />
      </div>
      {/* Visual answers need the width for charts and wide tables. A text-only
          answer does not: letting it stretch to max-w-4xl strands the timestamp
          a screen away from a one-line reply. Dropping flex-1 lets the card size
          to its content and only wrap once it hits the reading-width cap. */}
      <div className={cn("min-w-0", hasVisuals ? "flex-1 max-w-4xl" : "max-w-2xl")}>
        {/* metric-color spine — a quiet accent that colour-codes the answer by
            domain (matches the tag + the dashboard widget dots) for fast scanning.
            The metric colour is per-answer DATA (chosen by regex, shared with the
            backend charts), so it stays inline — but resolves a per-mode CSS var. */}
        <div
          className="group bg-card border border-border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm"
          style={{ borderLeftWidth: 3, borderLeftColor: metric.color }}
        >
          <div className="flex items-center justify-between gap-6 px-4 pt-3">
            <span
              className="text-xxs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ color: metric.color, background: metric.soft }}
            >
              {metric.tag}
            </span>
            {msg.text && <CopyButton text={msg.text} />}
          </div>
          {msg.text && (
            <p className="px-4 pt-2.5 pb-3.5 text-[15px] font-medium text-foreground leading-relaxed whitespace-pre-wrap">
              {msg.text}
            </p>
          )}
          {msg.visuals?.map((v, i) => {
            // Charts get a small inset so they sit framed inside the card;
            // tables stay full-bleed so wide columns can scroll edge to edge.
            const isChart = v.id === "bar" || v.id === "pie" || v.id === "line";
            return (
              <div
                key={i}
                className={cn("group/vis relative border-t border-border/60", isChart && "px-3 py-2")}
              >
                {/* Per-visual, not per-message: one malformed chart degrades to
                    a small notice while the answer text and any sibling visuals
                    still render. */}
                <ErrorBoundary label="chart">
                  <HtmlVisual visual={v} bare />
                </ErrorBoundary>
                {onPin && (
                  <button
                    onClick={() => onPin(v, pinTitle(msg.text, metric.tag))}
                    aria-label="Pin to dashboard"
                    title="Pin to dashboard"
                    className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-card/90 border border-border text-2xs font-medium text-foreground opacity-0 group-hover/vis:opacity-100 hover:border-muted-foreground/30 transition-all backdrop-blur-sm"
                  >
                    <Pin size={11} /> Pin
                  </button>
                )}
              </div>
            );
          })}
          {/* Answer metadata — time, and the data-source provenance when there are
              visuals. Both are reference material rather than content: the chat is
              not persisted (it lives in React state only), so every timestamp is
              from the session you are already watching. Revealing them on hover
              keeps them available without repeating under every card. */}
          {/* Fades rather than expands. Animating the height (grid-rows 0fr→1fr)
              reflows everything below the card on hover, so pointing at one answer
              nudges the next one down the page. The row keeps its space at all
              times and only the ink changes. */}
          <p className="px-4 pb-2.5 pt-1 text-2xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {fmt(msg.timestamp)}
            {hasVisuals && sourceNote ? ` · ${sourceNote}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
