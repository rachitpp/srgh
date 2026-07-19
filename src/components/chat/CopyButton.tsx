import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Hover-reveal copy control for an assistant answer's text. Shows a check for a
// beat after copying so the action has clear feedback.
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently no-op */
    }
  }

  return (
    <button
      onClick={() => void copy()}
      aria-label={copied ? "Copied" : "Copy answer"}
      title={copied ? "Copied" : "Copy answer"}
      className="flex items-center justify-center w-6 h-6 rounded-md text-stone-500 hover:text-stone-800 hover:bg-stone-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
    >
      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
    </button>
  );
}
