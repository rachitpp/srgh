import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";

function setup(overrides: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  const onRetry = vi.fn();
  const props = {
    value: "",
    onChange,
    onSubmit,
    onRetry,
    inputRef: createRef<HTMLTextAreaElement>(),
    isLoading: false,
    online: true as boolean | null,
    ...overrides,
  };
  render(<Composer {...props} />);
  return { onSubmit, onChange, onRetry };
}

const box = () => screen.getByRole("textbox");
// The accessible name deliberately flips to "Sending…" mid-request, so match both.
const sendBtn = () => screen.getByRole("button", { name: /send message|sending/i });

describe("submitting", () => {
  it("submits on Enter", async () => {
    const { onSubmit } = setup({ value: "avg TAT" });
    await userEvent.type(box(), "{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("avg TAT");
  });

  it("does NOT submit on Shift+Enter — that inserts a newline", async () => {
    const { onSubmit } = setup({ value: "line one" });
    await userEvent.type(box(), "{Shift>}{Enter}{/Shift}");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits when the send button is clicked", async () => {
    const { onSubmit } = setup({ value: "revenue by payor" });
    await userEvent.click(sendBtn());
    expect(onSubmit).toHaveBeenCalledWith("revenue by payor");
  });

  it("reports each keystroke upward", async () => {
    const { onChange } = setup();
    await userEvent.type(box(), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });
});

describe("send button enablement", () => {
  it("is disabled when the field is empty", () => {
    setup({ value: "" });
    expect(sendBtn()).toBeDisabled();
  });

  it("is disabled for whitespace only, so blank queries can't be sent", () => {
    setup({ value: "    " });
    expect(sendBtn()).toBeDisabled();
  });

  it("is enabled once there is real text", () => {
    setup({ value: "hi" });
    expect(sendBtn()).toBeEnabled();
  });

  it("is disabled while a request is in flight", () => {
    setup({ value: "hi", isLoading: true });
    expect(sendBtn()).toBeDisabled();
  });

  it("announces itself as 'Sending…' mid-request, so the state is not colour-only", () => {
    setup({ value: "hi", isLoading: true });
    expect(screen.getByRole("button", { name: /sending/i })).toBeInTheDocument();
  });
});

describe("offline state", () => {
  it("disables the input and shows how to start the backend", () => {
    setup({ online: false });
    expect(box()).toBeDisabled();
    expect(screen.getByText(/python main\.py/)).toBeInTheDocument();
  });

  it("offers a retry that calls back", async () => {
    const { onRetry } = setup({ online: false });
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("hides the keyboard hints when offline", () => {
    setup({ online: false });
    expect(screen.queryByText(/to send/i)).not.toBeInTheDocument();
  });

  it("shows the keyboard hints when online", () => {
    setup({ online: true });
    expect(screen.getByText(/to send/i)).toBeInTheDocument();
  });

  it("treats an unknown (null) status as usable rather than offline", () => {
    setup({ online: null, value: "x" });
    expect(box()).toBeEnabled();
    expect(sendBtn()).toBeEnabled();
  });
});

describe("focus ring", () => {
  // The double-border bug: the textarea must opt out of the global
  // :focus-visible outline in styles/index.css, because the wrapper already
  // draws the accent border + glow. Without this attribute both render.
  it("marks the textarea as owning its own focus treatment", () => {
    setup();
    expect(box()).toHaveAttribute("data-custom-focus");
  });
});
