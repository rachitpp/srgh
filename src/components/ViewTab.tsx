import type { MessageSquare } from "lucide-react";
import { G } from "../theme";

export function ViewTab({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MessageSquare;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
      style={{
        background: active ? G.accent : "transparent",
        color: active ? "#ffffff" : "#475569",
        boxShadow: active ? "0 1px 2px rgba(15,23,42,0.12)" : undefined,
      }}
    >
      <Icon size={14} />
      {label}
      {badge ? (
        <span
          className="ml-0.5 min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums"
          style={{
            background: active ? "rgba(255,255,255,0.25)" : "#e2e8f0",
            color: active ? "#ffffff" : "#334155",
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
