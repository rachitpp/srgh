import { useEffect, useRef } from "react";
import type React from "react";
import { GripHorizontal, X } from "lucide-react";
import type { Widget } from "../../types";
import { HtmlVisual } from "../HtmlVisual";
import { ErrorBoundary } from "../ErrorBoundary";
import { MIN_H, MIN_W, snap } from "./constants";

export function DashWidget({
  widget,
  onChange,
  onRemove,
}: {
  widget: Widget;
  onChange: (w: Widget) => void;
  onRemove: () => void;
}) {
  // Latest props are read through a ref so the window listeners (attached once)
  // always see current values without re-subscribing mid-drag.
  const latest = useRef({ widget, onChange });
  latest.current = { widget, onChange };
  const drag = useRef<{ mode: "move" | "resize"; px: number; py: number; orig: Widget } | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const s = drag.current;
      if (!s) return;
      const dx = e.clientX - s.px;
      const dy = e.clientY - s.py;
      if (s.mode === "move") {
        latest.current.onChange({
          ...s.orig,
          x: Math.max(0, snap(s.orig.x + dx)),
          y: Math.max(0, snap(s.orig.y + dy)),
        });
      } else {
        latest.current.onChange({
          ...s.orig,
          w: Math.max(MIN_W, snap(s.orig.w + dx)),
          h: Math.max(MIN_H, snap(s.orig.h + dy)),
        });
      }
    }
    function onUp() {
      drag.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    e.preventDefault();
    drag.current = { mode, px: e.clientX, py: e.clientY, orig: latest.current.widget };
    document.body.style.userSelect = "none";
  }

  return (
    <div
      className="absolute flex flex-col bg-card border border-border rounded-2xl shadow-sm transition-shadow duration-150 hover:shadow-md overflow-hidden"
      style={{ left: widget.x, top: widget.y, width: widget.w, height: widget.h }}
    >
      {/* Drag bar — deliberately carries NO answer text: a pinned widget is the
          visual on its own (the insight sentence stays in the chat). The metric
          dot keeps the domain colour-coding and the grip signals draggability. */}
      <div
        onPointerDown={(e) => begin("move", e)}
        className="shrink-0 flex items-center justify-between gap-2 px-3 h-8 border-b border-border/60 bg-muted/70 cursor-move select-none"
      >
        {/* widget.color is the metric-domain colour (data): a CSS var, per-mode. */}
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: widget.color || "var(--metric-service)" }}
        />
        <GripHorizontal size={13} className="text-muted-foreground/70 shrink-0" />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          aria-label="Remove from dashboard"
          title="Remove from dashboard"
          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 min-h-0 p-1">
        {/* A pinned widget that fails keeps its frame — the drag bar and remove
            button stay usable so the board can still be tidied up. */}
        <ErrorBoundary label="pinned chart">
          <HtmlVisual visual={{ id: widget.visualId, chart_html: widget.chartHtml }} fill />
        </ErrorBoundary>
      </div>
      {/* resize handle */}
      <div
        onPointerDown={(e) => begin("resize", e)}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, color-mix(in srgb, var(--muted-foreground) 45%, transparent) 50%)",
        }}
      />
    </div>
  );
}
