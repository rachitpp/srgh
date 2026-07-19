import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Message } from "../../types";
import { AgentMessage } from "./AgentMessage";

const base = (over: Partial<Message> = {}): Message => ({
  id: "1",
  role: "agent",
  text: "",
  timestamp: new Date(2026, 0, 1, 9, 30),
  ...over,
});

describe("render branches", () => {
  it("shows only a typing indicator while loading — no answer text", () => {
    const { container } = render(<AgentMessage msg={base({ loading: true, text: "ignored" })} />);
    expect(screen.queryByText("ignored")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-bounce")).toBeTruthy();
  });

  it("renders an error message plainly, with no metric tag", () => {
    render(<AgentMessage msg={base({ error: true, text: "Backend unreachable" })} />);
    expect(screen.getByText("Backend unreachable")).toBeInTheDocument();
    expect(screen.queryByText(/insight|revenue/i)).not.toBeInTheDocument();
  });

  it("renders the insight text for a normal answer", () => {
    render(<AgentMessage msg={base({ text: "Average TAT is 4.2 hours." })} />);
    expect(screen.getByText("Average TAT is 4.2 hours.")).toBeInTheDocument();
  });
});

describe("metric tagging", () => {
  // The tag drives the card's accent colour and the pinned widget's dot, so
  // classification is user-visible, not cosmetic bookkeeping.
  it.each([
    ["Turnaround time rose this week", "TAT"],
    ["Total expense by category", "Cost"],
    ["Revenue share by payor", "Revenue"],
    ["Tests per department", "Service"],
    ["Nothing recognisable here", "Insight"],
  ])("tags %j as %s", (text, tag) => {
    render(<AgentMessage msg={base({ text })} />);
    expect(screen.getByText(tag)).toBeInTheDocument();
  });
});

describe("pinning", () => {
  const withVisual = base({
    text: "Revenue rose 12%. Driven by OPD.",
    visuals: [{ id: "bar", chart_html: "<div>chart</div>" }],
  });

  it("offers no pin control when the handler is absent", () => {
    render(<AgentMessage msg={withVisual} />);
    expect(screen.queryByRole("button", { name: /pin to dashboard/i })).not.toBeInTheDocument();
  });

  it("pins with the visual and a title trimmed to the first clause", async () => {
    const onPin = vi.fn();
    render(<AgentMessage msg={withVisual} onPin={onPin} />);
    await userEvent.click(screen.getByRole("button", { name: /pin to dashboard/i }));
    expect(onPin).toHaveBeenCalledWith(withVisual.visuals![0], "Revenue rose 12%");
  });

  it("shows one pin control per visual", () => {
    const msg = base({
      text: "Two charts",
      visuals: [
        { id: "bar", chart_html: "<div/>" },
        { id: "pie", chart_html: "<div/>" },
      ],
    });
    render(<AgentMessage msg={msg} onPin={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /pin to dashboard/i })).toHaveLength(2);
  });
});

describe("source note", () => {
  it("is shown when the answer carries visuals", () => {
    const msg = base({ text: "x", visuals: [{ id: "card", chart_html: "<div/>" }] });
    render(<AgentMessage msg={msg} sourceNote="file · 2 tables · 900 rows" />);
    expect(screen.getByText("file · 2 tables · 900 rows")).toBeInTheDocument();
  });

  it("is omitted for a text-only answer", () => {
    render(<AgentMessage msg={base({ text: "no visuals" })} sourceNote="file · 2 tables · 900 rows" />);
    expect(screen.queryByText("file · 2 tables · 900 rows")).not.toBeInTheDocument();
  });
});
