import { useEffect, useState } from "react";
import type React from "react";
import { Loader2, Search, Send, Server } from "lucide-react";
import { cn } from "../../lib/utils";

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
    <div className="relative z-10 shrink-0 border-t border-border bg-card px-6 py-4">
      {online === false && (
        <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-2xl px-4 py-2.5 mb-3">
          <Server size={12} className="shrink-0 text-warning" />
          Backend offline. Run <span className="font-mono">python main.py</span> in the{" "}
          <span className="font-mono">server/</span> folder, then
          <button onClick={onRetry} className="underline font-semibold ml-1">
            retry
          </button>
          .
        </div>
      )}

      {/* One ring only — the border and the glow are the same accent (theme
          tokens), never stacked with a second Tailwind ring. */}
      <div
        className={cn(
          "flex items-end gap-2 border rounded-2xl bg-card transition-all duration-200",
          active ? "border-primary ring-[3px] ring-primary/15" : "border-border shadow-sm",
        )}
      >
        {/* self-start + pt-4 keeps the glyph optically centred on the FIRST
            text line (py-3.5 + half of the 20px line box − half the icon),
            so it stays put as the textarea grows downward. */}
        <div
          className={cn(
            "self-start shrink-0 flex items-center pl-4 pt-4 transition-colors",
            active ? "text-primary" : "text-muted-foreground/70",
          )}
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
          className="flex-1 bg-transparent resize-none overflow-y-auto py-3.5 pr-2 text-sm leading-5 text-foreground placeholder-muted-foreground focus:outline-none max-h-40"
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
            className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {canSend && (
        <div className="flex items-center justify-end gap-1.5 mt-2 px-1 text-2xs font-medium text-muted-foreground">
          <kbd className="font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground text-xxs">
            Enter
          </kbd>
          <span>to send</span>
          <span className="text-muted-foreground/40">·</span>
          <kbd className="font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground text-xxs">
            Shift + Enter
          </kbd>
          <span>for new line</span>
        </div>
      )}
    </div>
  );
}
