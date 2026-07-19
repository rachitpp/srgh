// Design tokens and the metric-domain colour system. Pure data — no React.

// Clean clinical palette — white content canvas, cool light-grey chrome, a single
// teal accent. Cool slate ink instead of warm charcoal. No gradients, no glow.
export const G = {
  brand: "#0f172a", // cool slate ink — logo tiles, message avatars
  brandSoft: "#eef2f7", // cool light grey for icon tiles / soft fills
  page: "#ffffff", // clean white content canvas
  accent: "#0f766e", // clinical teal — the single action/identity accent
  accentSoft: "#e6f4f2", // soft teal wash for accented tiles / highlights
  panel: "#f4f6f9", // cool light grey sidebar — recessed a step below content
};

// Maps an answer to its metric domain so the insight card's tag + accent match
// the chart colors (same hex values as the sidebar groups / server tokens).
export const METRIC_TAGS: { tag: string; color: string; re: RegExp }[] = [
  { tag: "TAT", color: "#996A26", re: /\btat\b|turnaround|delay/i },
  { tag: "Cost", color: "#983B40", re: /expense|expenditure|cost|spend/i },
  { tag: "Revenue", color: "#1A7350", re: /revenue|income|billed|billing|payor|collection/i },
  { tag: "Service", color: "#0A5F67", re: /test|service|doctor|department|patient|sample|unit/i },
];

export function detectMetric(text: string) {
  return METRIC_TAGS.find((m) => m.re.test(text)) ?? { tag: "Insight", color: "#0A5F67" };
}

// Quick queries grouped by metric domain. Each group's dot color matches the
// accent the backend uses for that metric's charts (see design tokens in
// server/main.py), and the queries are phrased to produce a mix of visuals:
// pie (part-of-whole), line (trend), bar (ranking), card (KPI), table ("list all").
export const QUERY_GROUPS: { label: string; color: string; queries: string[] }[] = [
  {
    label: "Revenue",
    color: "#1A7350",
    queries: [
      "Revenue share of OPD vs IPD patients", // → pie
      "What is the revenue share by billing payor type?", // → pie
      "Monthly revenue trend for 2025", // → line
    ],
  },
  {
    label: "Turnaround Time",
    color: "#996A26",
    queries: [
      "Average turnaround time (TAT)", // → card
      "Which department has the longest TAT?", // → bar
    ],
  },
  {
    label: "Cost",
    color: "#983B40",
    queries: [
      "Expense breakdown by category", // → bar/pie
      "Compare monthly laboratory expenses", // → line
    ],
  },
  {
    label: "Masters",
    color: "#0A5F67",
    queries: [
      "List all biochemistry test sets", // → table
      "Count of doctors by specialty", // → pie
      "List all treating units", // → table
      "List all P&L groups", // → table
    ],
  },
];

// Flat view (query + its group color + label) for the empty-state grid.
export const FLAT_SUGGESTIONS = QUERY_GROUPS.flatMap((g) =>
  g.queries.map((q) => ({ q, color: g.color, label: g.label })),
);
