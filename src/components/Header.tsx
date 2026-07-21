import { LayoutDashboard, MessageSquare, Moon, Sun } from "lucide-react";
import type { DbStatus, LoadedInfo } from "../types";
import { cn } from "../lib/utils";
import { useThemeMode } from "../lib/theme-mode";
import { ViewTab } from "./ViewTab";
import sgrhLogo from "../assets/sgrh-logo.png";

interface HeaderProps {
  view: "chat" | "dashboard";
  onViewChange: (v: "chat" | "dashboard") => void;
  widgetCount: number;
  online: boolean | null;
  loaded: LoadedInfo | null;
  dbStatus: DbStatus;
}

export function Header({ view, onViewChange, widgetCount, online, loaded, dbStatus }: HeaderProps) {
  const { mode, toggle } = useThemeMode();
  const hasData = !!loaded;

  // Single consolidated status — quiet when everything is fine, red only when
  // the backend is down. Details live in the hover tooltip. The dot colour is a
  // theme token (a CSS var) so it re-themes with the rest of the app.
  const offline = online === false;
  const dot = offline
    ? "var(--destructive)"
    : online === null
      ? "var(--muted-foreground)"
      : hasData
        ? "var(--success)"
        : "var(--muted-foreground)";
  // `loaded` needs no non-null assertion here: TypeScript narrows it through the
  // `hasData` alias, so a real null would be caught rather than asserted away.
  const label =
    online === null
      ? "Checking…"
      : offline
        ? "Backend offline"
        : loaded
          ? `${loaded.tables.length} ${loaded.tables.length === 1 ? "table" : "tables"} · ${loaded.rows.toLocaleString()} rows`
          : "Connected · no data loaded";
  const detail = [
    `AI backend: ${online === null ? "checking" : online ? "online" : "offline"}`,
    loaded ? `Source: ${loaded.source === "db" ? "database" : "file upload"}` : "No dataset loaded",
    dbStatus === "connected" ? "Database: live" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <header className="relative z-20 shrink-0 border-b border-border bg-card flex items-center justify-between px-6 h-16 shadow-sm">
      {/* The logo artwork is dark ink on white, so it keeps its own white plate in
          both themes rather than disappearing against the dark surface. */}
      <div className="flex items-center">
        <img
          src={sgrhLogo}
          alt="Sir Ganga Ram Hospital — Information Technology Department"
          className="h-9 w-auto rounded-lg bg-white px-2 py-1 object-contain"
        />
      </div>

      <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
        <ViewTab
          active={view === "chat"}
          onClick={() => onViewChange("chat")}
          icon={MessageSquare}
          label="Chat"
        />
        <ViewTab
          active={view === "dashboard"}
          onClick={() => onViewChange("dashboard")}
          icon={LayoutDashboard}
          label="Dashboard"
          badge={widgetCount}
        />
      </div>

      <div className="flex items-center gap-3">
        <span
          title={detail}
          className={cn(
            "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border cursor-default tabular-nums",
            offline
              ? "text-destructive bg-destructive/10 border-destructive/20"
              : "text-muted-foreground bg-card border-border",
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
          {label}
        </span>
        <button
          onClick={toggle}
          aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
