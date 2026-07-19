import { AlertCircle, FlaskConical, Pin } from "lucide-react";
import type { Message, Visual } from "../../types";
import { G, detectMetric } from "../../theme";
import { fmt, pinTitle } from "../../lib/utils";
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
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: G.brand }}
        >
          <FlaskConical size={15} className="text-white" />
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-4 py-3">
          <TypingDots />
        </div>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "#fee2e2" }}
        >
          <AlertCircle size={15} className="text-red-500" />
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg">
          <p className="text-sm text-red-700 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          <p className="text-xs text-red-400 mt-1">{fmt(msg.timestamp)}</p>
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
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: G.brand }}
      >
        <FlaskConical size={15} className="text-white" />
      </div>
      <div className="flex-1 min-w-0 max-w-4xl">
        {/* metric-color spine — a quiet accent that colour-codes the answer by
            domain (matches the tag + the dashboard widget dots) for fast scanning */}
        <div
          className="group bg-white border border-stone-200 rounded-2xl rounded-tl-sm overflow-hidden shadow-sm"
          style={{ borderLeftWidth: 3, borderLeftColor: metric.color }}
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ color: metric.color, background: `${metric.color}14` }}
            >
              {metric.tag}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-stone-700 font-mono">{fmt(msg.timestamp)}</span>
              {msg.text && <CopyButton text={msg.text} />}
            </div>
          </div>
          {msg.text && (
            <p className="px-4 pt-2.5 pb-3.5 text-[15px] font-medium text-stone-900 leading-relaxed whitespace-pre-wrap">
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
                className={`group/vis relative border-t border-stone-100 ${isChart ? "px-3 py-2" : ""}`}
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
                    className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/90 border border-stone-200 text-[11px] font-medium text-stone-800 opacity-0 group-hover/vis:opacity-100 hover:text-stone-900 hover:border-stone-300 transition-all backdrop-blur-sm"
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
                <p className="px-4 pb-2.5 pt-1 text-[11px] text-stone-700 font-mono">{sourceNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
