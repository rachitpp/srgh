import { describe, expect, it } from "vitest";
import { fmt, isTableRequest, pinTitle, uid } from "./utils";

describe("isTableRequest", () => {
  // Decides /table (exact, complete rows) vs /chat (LLM insight + visuals).
  // A false negative silently truncates the user's data behind an LLM summary.

  it.each([
    "List all biochemistry test sets",
    "show me the records",
    "give me the top 10 rows",
    "display data as table",
    "retrieve first 5",
  ])("routes %j to /table", (q) => expect(isTableRequest(q)).toBe(true));

  it.each([
    "What is the average turnaround time?",
    "Which department is slowest?",
    "Revenue share of OPD vs IPD patients",
  ])("routes %j to /chat", (q) => expect(isTableRequest(q)).toBe(false));

  it("is case-insensitive", () => {
    expect(isTableRequest("LIST ALL DOCTORS")).toBe(true);
  });

  it("matches 'top ' only with its trailing space, so 'topic' is not a table request", () => {
    expect(isTableRequest("what is the top department")).toBe(true);
    expect(isTableRequest("summarise this topic")).toBe(false);
  });
});

describe("pinTitle", () => {
  it("keeps a short first clause", () => {
    expect(pinTitle("Revenue rose 12%. Driven by OPD.", "Insight")).toBe("Revenue rose 12%");
  });

  it("splits on a newline as well as a period", () => {
    expect(pinTitle("First line\nSecond line", "Insight")).toBe("First line");
  });

  it("falls back when the text is empty or whitespace", () => {
    expect(pinTitle("", "Revenue")).toBe("Revenue");
    expect(pinTitle("   ", "Revenue")).toBe("Revenue");
  });

  it("truncates past 60 chars with an ellipsis", () => {
    const out = pinTitle("x".repeat(100), "Insight");
    // 58, not 60: the implementation slices to 57 and appends a single-character
    // "…". The 57 looks written for a three-dot "..." (57 + 3 = 60) that was later
    // swapped for the single glyph. Harmless — asserted here so the real length is
    // documented rather than rediscovered.
    expect(out).toHaveLength(58);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves a 60-char clause untruncated", () => {
    const exact = "y".repeat(60);
    expect(pinTitle(exact, "Insight")).toBe(exact);
  });
});

describe("uid", () => {
  it("is 8 chars and collision-free across many draws", () => {
    const ids = new Set(Array.from({ length: 5000 }, uid));
    expect(ids.size).toBe(5000);
    expect([...ids].every((i) => i.length === 8)).toBe(true);
  });
});

describe("fmt", () => {
  it("renders hours and minutes only", () => {
    expect(fmt(new Date(2026, 0, 1, 14, 5))).toMatch(/\d{1,2}:05/);
  });
});
