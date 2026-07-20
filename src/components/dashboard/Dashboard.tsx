import type React from "react";
import { LayoutDashboard, Pin } from "lucide-react";
import type { Widget } from "../../types";
import { DashWidget } from "./DashWidget";
import { GRID } from "./constants";

// A PowerBI-style free canvas of pinned visuals. Widgets can be dragged and
// resized (snapped to a grid) but the operation is purely visual — it never
// touches the chart data, which lives untouched inside each widget's HTML.
export function Dashboard({
  widgets,
  setWidgets,
}: {
  widgets: Widget[];
  setWidgets: React.Dispatch<React.SetStateAction<Widget[]>>;
}) {
  const update = (w: Widget) => setWidgets((prev) => prev.map((x) => (x.wid === w.wid ? w : x)));
  const remove = (wid: string) => setWidgets((prev) => prev.filter((x) => x.wid !== wid));

  if (widgets.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center bg-background">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm bg-primary-soft">
          <LayoutDashboard size={28} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground mb-1.5">Your dashboard is empty</h2>
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            In the <span className="font-semibold">Chat</span> tab, hover any chart or table and click{" "}
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Pin size={11} /> Pin
            </span>{" "}
            to place it here, then drag and resize it freely.
          </p>
        </div>
      </div>
    );
  }

  const canvasH = Math.max(600, ...widgets.map((w) => w.y + w.h + 80));
  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      {/* dot grid — signals a movable canvas and makes the snap-to-grid legible.
          The dot colour is the --grid-dot token so it stays visible in dark mode. */}
      <div
        className="relative mx-auto"
        style={{
          minHeight: canvasH,
          maxWidth: 1400,
          backgroundImage: "radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)",
          backgroundSize: `${GRID}px ${GRID}px`,
        }}
      >
        {widgets.map((w) => (
          <DashWidget key={w.wid} widget={w} onChange={update} onRemove={() => remove(w.wid)} />
        ))}
      </div>
    </div>
  );
}
