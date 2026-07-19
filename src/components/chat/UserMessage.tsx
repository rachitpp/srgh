import type { Message } from "../../types";
import { fmt } from "../../lib/utils";

export function UserMessage({ msg }: { msg: Message }) {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div className="max-w-[70%] space-y-1">
        {/* Soft neutral bubble — keeps the person's questions light so the
            agent's answers (charts, insights) carry the visual weight. */}
        <div className="rounded-2xl rounded-tr-sm px-4 py-3 bg-stone-100 border border-stone-200">
          <p className="text-[15px] text-stone-900 leading-relaxed">{msg.text}</p>
        </div>
        <div className="text-xs text-stone-700 text-right pr-1">{fmt(msg.timestamp)}</div>
      </div>
      <div className="w-9 h-9 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-stone-800">
        U
      </div>
    </div>
  );
}
