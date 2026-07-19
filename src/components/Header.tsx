import { FlaskConical, LayoutDashboard, MessageSquare } from "lucide-react";
import type { DbStatus, LoadedInfo } from "../types";
import { G } from "../theme";
import { ViewTab } from "./ViewTab";

interface HeaderProps {
  view: "chat" | "dashboard";
  onViewChange: (v: "chat" | "dashboard") => void;
  widgetCount: number;
  online: boolean | null;
  loaded: LoadedInfo | null;
  dbStatus: DbStatus;
}

export function Header({ view, onViewChange, widgetCount, online, loaded, dbStatus }: HeaderProps) {
  const hasData = !!loaded;

  // Single consolidated status — quiet when everything is fine, red only when
  // the backend is down. Details live in the hover tooltip.
  const offline = online === false;
  const dot = offline ? "#dc2626" : online === null ? "#a8a29e" : hasData ? "#059669" : "#a8a29e";
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
    <header
      className="relative z-20 shrink-0 border-b border-stone-200 bg-white flex items-center justify-between px-6 h-16"
      style={{ boxShadow: "0 2px 8px -3px rgba(41,37,36,0.10)" }}
    >
      <div className="flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: G.brand }}>
          <FlaskConical size={16} className="text-white" />
        </div>
        <div>
          <span className="text-[17px] font-bold tracking-tight text-stone-900">SGRH Lab Assistant</span>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
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
          className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border cursor-default tabular-nums"
          style={{
            color: offline ? "#b91c1c" : "#44403c",
            background: offline ? "#fef2f2" : "#ffffff",
            borderColor: offline ? "#fecaca" : "#e7e5e4",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
          {label}
        </span>
      </div>
    </header>
  );
}
