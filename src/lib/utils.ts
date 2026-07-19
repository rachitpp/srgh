// Small pure helpers shared across components.

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function fmt(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Mirror of the backend TABLE_KEYWORDS so "show rows / list all / records"
// requests go to /table (deterministic full rows) instead of /chat (LLM visuals).
// ⚠️ Changing this list means changing the backend's copy in server/main.py too.
export const TABLE_KEYWORDS = [
  "record",
  "records",
  "row",
  "rows",
  "tabular",
  "table format",
  "in table",
  "as table",
  "show me",
  "show all",
  "show data",
  "display data",
  "list all",
  "list data",
  "list record",
  "get me",
  "give me",
  "fetch",
  "retrieve",
  "top ",
  "first ",
  "last ",
  "sample",
];

export function isTableRequest(msg: string) {
  const m = msg.toLowerCase();
  return TABLE_KEYWORDS.some((k) => m.includes(k));
}

// A short label for a pinned widget: the insight sentence trimmed to its first
// clause, falling back to the metric tag when the answer has no text.
export function pinTitle(text: string, fallback: string) {
  const t = (text || "").split(/[.\n]/)[0].trim();
  if (!t) return fallback;
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}
