import { useEffect, useState } from "react";
import type React from "react";
import { Loader2, Search, Send, Server } from "lucide-react";
import { G } from "../../theme";

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  /** Owned by the parent so the sidebar / empty-state can focus the field. */
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
  online: boolean | null;
  onRetry: () => void;
}

export function Composer({ value, onChange, onSubmit, inputRef, isLoading, online, onRetry }: ComposerProps) {
  const [focused, setFocused] = useState(false);
  const canSend = online !== false;
  // Active = focused or holding text. Drives one accent border + one glow.
  const active = canSend && (focused || !!value);

  // Auto-grow the input to fit its content (capped by max-h), so typed or
  // pasted text always sits with equal padding above and below.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value, inputRef]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(value);
    }
  }

  return (
    <div
      className="relative z-10 shrink-0 border-t border-stone-200 bg-white px-6 py-4"
      style={{ boxShadow: "0 -3px 10px -4px rgba(41,37,36,0.07)" }}
    >
      {online === false && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 mb-3">
          <Server size={12} className="shrink-0 text-amber-500" />
          Backend offline. Run <span className="font-mono">python main.py</span> in the{" "}
          <span className="font-mono">server/</span> folder, then
          <button onClick={onRetry} className="underline font-semibold ml-1">
            retry
          </button>
          .
        </div>
      )}

      {/* One ring only — the border and the glow are the same accent, never
          stacked with a Tailwind ring. */}
      <div
        className="flex items-end gap-2 border rounded-2xl bg-white transition-all duration-200"
        style={{
          borderColor: active ? G.accent : "#e7e5e4",
          boxShadow: active ? "0 0 0 3px rgba(15,118,110,0.12)" : "0 1px 3px rgba(15,23,42,0.06)",
        }}
      >
        {/* self-start + pt-4 keeps the glyph optically centred on the FIRST
            text line (py-3.5 + half of the 20px line box − half the icon),
            so it stays put as the textarea grows downward. */}
        <div
          className="self-start shrink-0 flex items-center pl-4 pt-4 transition-colors"
          style={{ color: active ? G.accent : "#a8a29e" }}
        >
          <Search size={16} />
        </div>

        {/* data-custom-focus → opt out of the global :focus-visible outline in
            styles/index.css; the wrapper above already renders the accent
            border + glow, so a second ring would double up. */}
        <textarea
          ref={inputRef}
          value={value}
          data-custom-focus
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={!canSend || isLoading}
          placeholder={
            canSend ? "Ask anything about your lab data in plain English…" : "Start the backend to begin"
          }
          rows={1}
          className="flex-1 bg-transparent resize-none overflow-y-auto py-3.5 pr-2 text-sm leading-5 text-stone-900 placeholder-stone-700 focus:outline-none max-h-40"
          style={{ scrollbarWidth: "none" }}
        />

        {/* pb-1.5 = (3rem input height − 2.25rem button) / 2 → button is
            vertically centered on one line, bottom-anchored when multiline */}
        <div className="flex items-center px-2 pb-1.5">
          <button
            onClick={() => onSubmit(value)}
            disabled={!canSend || !value.trim() || isLoading}
            aria-label={isLoading ? "Sending…" : "Send message"}
            title="Send message"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: G.accent }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {canSend && (
        <div className="flex items-center justify-end gap-1.5 mt-2 px-1 text-[11px] font-medium text-stone-500">
          <kbd className="font-mono px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600 text-[10px]">
            Enter
          </kbd>
          <span>to send</span>
          <span className="text-stone-300">·</span>
          <kbd className="font-mono px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600 text-[10px]">
            Shift + Enter
          </kbd>
          <span>for new line</span>
        </div>
      )}
    </div>
  );
}
