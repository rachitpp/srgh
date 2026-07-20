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
      <div className="flex-1 min-w-0 max-w-4xl">
        {/* metric-color spine — a quiet accent that colour-codes the answer by
            domain (matches the tag + the dashboard widget dots) for fast scanning.
            The metric colour is per-answer DATA (chosen by regex, shared with the
            backend charts), so it stays an inline style rather than a theme token. */}
        <div
          className="group bg-card border border-border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm"
          style={{ borderLeftWidth: 3, borderLeftColor: metric.color }}
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <span
              className="text-xxs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ color: metric.color, background: `${metric.color}14` }}
            >
              {metric.tag}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs text-muted-foreground font-mono">{fmt(msg.timestamp)}</span>
              {msg.text && <CopyButton text={msg.text} />}
            </div>
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
          {/* Data-source provenance — the header status pill already shows the
              live source, so we keep this per-answer note but reveal it only on
              hover to stop it repeating as noise under every card. */}
          {hasVisuals && sourceNote && (
            <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-200">
              <div className="overflow-hidden">
                <p className="px-4 pb-2.5 pt-1 text-2xs text-muted-foreground font-mono">{sourceNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
