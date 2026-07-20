import type { Message } from "../../types";
import { fmt } from "../../lib/utils";

export function UserMessage({ msg }: { msg: Message }) {
  return (
    <div className="group flex items-start gap-3 justify-end">
      <div className="max-w-[70%]">
        {/* Soft neutral bubble — keeps the person's questions light so the
            agent's answers (charts, insights) carry the visual weight. */}
        <div className="rounded-2xl rounded-tr-sm px-4 py-3 bg-muted border border-border">
          <p className="text-[15px] text-foreground leading-relaxed">{msg.text}</p>
        </div>
        {/* Hover-revealed, matching the answer cards — a persistent clock here
            would otherwise be the only one left in the thread. Fades rather than
            expands so hovering never reflows the messages below it. */}
        <p className="pt-1 pr-1 text-2xs text-muted-foreground font-mono text-right opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {fmt(msg.timestamp)}
        </p>
      </div>
      <div className="w-9 h-9 rounded-2xl bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-foreground">
        U
      </div>
    </div>
  );
}
