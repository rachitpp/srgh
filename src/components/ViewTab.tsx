import type { MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";

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
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon size={14} />
      {label}
      {badge ? (
        <span
          className={cn(
            "ml-0.5 min-w-4 h-4 px-1 rounded-full text-xxs font-bold flex items-center justify-center tabular-nums",
            active ? "bg-white/25 text-primary-foreground" : "bg-secondary text-secondary-foreground",
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
