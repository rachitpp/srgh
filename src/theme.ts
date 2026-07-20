// The metric-domain colour system. Pure data — no React.
//
// App chrome colours (surfaces, ink, the teal accent, brand tiles) are NOT here:
// they live as CSS variables in src/styles/theme.css and are used through semantic
// Tailwind utilities (bg-primary, bg-brand, text-muted-foreground…). What remains
// below are the per-answer DOMAIN colours — chosen at runtime by regex, matched to
// the backend's chart palette — which are genuine data, not theme chrome.

// Maps an answer to its metric domain so the insight card's tag + accent match
// the chart colors. The colours themselves are CSS variables (defined per mode in
// styles/theme.css) rather than hexes, so light and dark each get values stepped
// for their own surface instead of one set dimmed to fit both. `soft` is the 14%
// wash used behind tag pills.
export const METRIC_TAGS: { tag: string; color: string; soft: string; re: RegExp }[] = [
  {
    tag: "TAT",
    color: "var(--metric-tat)",
    soft: "var(--metric-tat-soft)",
    re: /\btat\b|turnaround|delay/i,
  },
  {
    tag: "Cost",
    color: "var(--metric-cost)",
    soft: "var(--metric-cost-soft)",
    re: /expense|expenditure|cost|spend/i,
  },
  {
    tag: "Revenue",
    color: "var(--metric-revenue)",
    soft: "var(--metric-revenue-soft)",
    re: /revenue|income|billed|billing|payor|collection/i,
  },
  {
    tag: "Service",
    color: "var(--metric-service)",
    soft: "var(--metric-service-soft)",
    re: /test|service|doctor|department|patient|sample|unit/i,
  },
];

export function detectMetric(text: string) {
  return (
    METRIC_TAGS.find((m) => m.re.test(text)) ?? {
      tag: "Insight",
      color: "var(--metric-service)",
      soft: "var(--metric-service-soft)",
    }
  );
}

// Quick queries grouped by metric domain. Each group's dot color matches the
// accent the backend uses for that metric's charts (see design tokens in
// server/main.py), and the queries are phrased to produce a mix of visuals:
// pie (part-of-whole), line (trend), bar (ranking), card (KPI), table ("list all").
export const QUERY_GROUPS: { label: string; color: string; queries: string[] }[] = [
  {
    label: "Revenue",
    color: "var(--metric-revenue)",
    queries: [
      "Revenue share of OPD vs IPD patients", // → pie
      "What is the revenue share by billing payor type?", // → pie
      "Monthly revenue trend for 2025", // → line
    ],
  },
  {
    label: "Turnaround Time",
    color: "var(--metric-tat)",
    queries: [
      "Average turnaround time (TAT)", // → card
      "Which department has the longest TAT?", // → bar
    ],
  },
  {
    label: "Cost",
    color: "var(--metric-cost)",
    queries: [
      "Expense breakdown by category", // → bar/pie
      "Compare monthly laboratory expenses", // → line
    ],
  },
  {
    label: "Masters",
    color: "var(--metric-service)",
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
