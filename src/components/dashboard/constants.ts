// Geometry for the free-form dashboard canvas. Shared by the canvas, the
// widgets, and App's pin action (which places new widgets on the same grid).

export const GRID = 16; // snap step, px
export const MIN_W = 240; // smallest a widget can shrink to
export const MIN_H = 140;

export const snap = (n: number) => Math.round(n / GRID) * GRID;

// Sensible starting footprint for a freshly pinned visual, by chart kind.
export function defaultSize(id: string): { w: number; h: number } {
  if (id === "table") return { w: 576, h: 432 };
  if (id === "card") return { w: 304, h: 160 };
  return { w: 448, h: 352 }; // bar / pie / line
}
