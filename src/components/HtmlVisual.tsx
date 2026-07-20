import { useEffect, useRef } from "react";
import type { Visual } from "../types";
import { uid } from "../lib/utils";

// Plotly arrives via a <script> tag inside the backend's HTML, so it exists only
// at runtime and has no import to type it. Declaring the sliver we call keeps the
// resize path checked instead of casting window to `any`.
declare global {
  interface Window {
    Plotly?: { Plots?: { resize(el: HTMLElement): void } };
  }
}

// Renders raw HTML returned by the backend and (re-)executes any <script> tags
// so Plotly.newPlot(...) actually runs. Setting innerHTML alone won't run scripts.
export function HtmlVisual({
  visual,
  bare = false,
  fill = false,
}: {
  visual: Visual;
  bare?: boolean;
  fill?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Re-key the chart id to be unique to THIS mounted instance. The server
    // ships each chart with an id like `chart_ab12` referenced both by the div
    // and the Plotly.newPlot(...) call. If the same visual is rendered twice
    // (e.g. once in chat and once pinned to the dashboard), getElementById would
    // resolve both scripts to the first div — so we rewrite every occurrence of
    // the original id token to a fresh one before injecting.
    let html = visual.chart_html;
    const idMatch = html.match(/chart_[\w-]+/);
    if (idMatch) html = html.split(idMatch[0]).join(`chart_${uid()}`);
    el.innerHTML = html;
    el.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      old.getAttributeNames().forEach((n) => {
        const v = old.getAttribute(n);
        if (v !== null) s.setAttribute(n, v);
      });
      s.textContent = old.textContent;
      old.parentNode?.replaceChild(s, old);
    });
  }, [visual.chart_html]);

  // Reflow the chart when its CONTAINER resizes. Plotly's `responsive:true` only
  // listens to window-resize events, so dragging a dashboard card's corner (which
  // changes the div but not the window) would otherwise leave the plot frozen at
  // its original size. A ResizeObserver watches the div directly and asks Plotly
  // to re-fit on every size change.
  useEffect(() => {
    const el = ref.current;
    if (!el || !fill) return;
    const ro = new ResizeObserver(() => {
      const plot = el.querySelector<HTMLElement>(".js-plotly-plot");
      // Read Plotly per-tick: the script that defines it is injected with the
      // chart HTML, so it may not exist yet when this effect first runs.
      if (plot) window.Plotly?.Plots?.resize(plot);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, visual.chart_html]);

  const id = visual.id;
  const isChart = id === "bar" || id === "pie" || id === "line";
  // fill → the parent (a dashboard cell) controls the size; the chart stretches
  // to 100% and the ResizeObserver above reflows Plotly to match.
  // A pie carries the same information at any size, so 400px just buys dead space
  // either side of the circle; bar/line genuinely use the extra height for
  // categories and time steps.
  const height = fill ? "100%" : id === "table" ? 460 : id === "pie" ? 340 : isChart ? 400 : undefined;

  const body = (
    <div
      ref={ref}
      className={fill ? "h-full w-full overflow-auto" : undefined}
      style={{ width: "100%", height, minHeight: !fill && id === "card" ? 96 : undefined }}
    />
  );
  // bare → rendered inside an insight card that already has a border; fill →
  // rendered inside a dashboard widget shell that owns the chrome.
  if (bare || fill) return body;
  return <div className="bg-card border border-border rounded-2xl overflow-hidden">{body}</div>;
}
