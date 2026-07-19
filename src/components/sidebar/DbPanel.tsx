import { useState } from "react";
import { AlertCircle, ChevronDown, Database, Loader2, Table } from "lucide-react";
import type { DbConfig, DbConnectPayload, DbStatus, DbType, LoadedInfo } from "../../types";
import { isApiError } from "../../types";
import { G } from "../../theme";
import { NetworkError, dbConnect, dbLoadAllTables, errorMessage } from "../../api/client";

export function DbPanel({
  onLoaded,
  onStatusChange,
}: {
  onLoaded: (i: LoadedInfo) => void;
  onStatusChange: (s: DbStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DbStatus>("disconnected");
  const [tables, setTables] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [cfg, setCfg] = useState<DbConfig>({
    db_type: "mysql",
    host: "localhost",
    port: "3306",
    user: "",
    password: "",
    database: "",
  });

  function setStat(s: DbStatus) {
    setStatus(s);
    onStatusChange(s);
  }

  function payload(): DbConnectPayload {
    // Trim host/user/database so a stray leading/trailing space can't break the
    // connection — Postgres' pg_hba matching is exact, so "staging " ≠ "staging".
    // Password is left untouched (spaces can be significant in a password).
    return {
      db_type: cfg.db_type,
      host: cfg.host.trim(),
      port: Number(cfg.port),
      user: cfg.user.trim(),
      password: cfg.password,
      database: cfg.database.trim(),
    };
  }

  /** Both actions fail the same way; only the wording differs. */
  function reportFailure(e: unknown, what: string) {
    setError(e instanceof NetworkError ? "Can't reach the backend." : `${what} — ${errorMessage(e)}`);
  }

  async function connect() {
    setStat("connecting");
    setError(null);
    setTables([]);
    try {
      const data = await dbConnect(payload());
      if (data.success) {
        setTables(data.tables ?? []);
        setStat("connected");
      } else {
        setError(data.error);
        setStat("error");
      }
    } catch (e) {
      reportFailure(e, "Connection failed");
      setStat("error");
    }
  }

  async function loadAll() {
    setLoadingAll(true);
    setError(null);
    try {
      const data = await dbLoadAllTables(payload());
      if (isApiError(data)) {
        setError(data.error);
        setLoadingAll(false);
        return;
      }
      const total = Object.values(data.row_counts ?? {}).reduce((a, b) => a + Number(b), 0);
      onLoaded({ source: "db", tables: data.tables ?? [], rows: total });
      setLoadingAll(false);
    } catch (e) {
      reportFailure(e, "Load failed");
      setLoadingAll(false);
    }
  }

  const dot: Record<DbStatus, string> = {
    disconnected: "#94a3b8",
    connecting: "#f59e0b",
    connected: "#10b981",
    error: "#ef4444",
  };
  const txt: Record<DbStatus, string> = {
    disconnected: "#64748b",
    connecting: "#b45309",
    connected: "#047857",
    error: "#dc2626",
  };
  const lbl: Record<DbStatus, string> = {
    disconnected: "Not connected",
    connecting: "Connecting…",
    connected: `${tables.length} tables found`,
    error: "Failed",
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: G.brandSoft }}
          >
            <Database size={14} className="text-stone-800" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-stone-900">Database</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot[status] }} />
              <span className="text-xs font-medium" style={{ color: txt[status] }}>
                {lbl[status]}
              </span>
            </div>
          </div>
        </div>
        <ChevronDown
          size={14}
          className={`text-stone-700 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-stone-100 px-4 pb-3.5 pt-2.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-stone-800 mb-0.5">Type</label>
              <select
                value={cfg.db_type}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    db_type: e.target.value as DbType,
                    port: e.target.value === "postgres" ? "5432" : "3306",
                  })
                }
                className="w-full bg-stone-50/50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm text-stone-800 focus:outline-none focus:border-stone-400"
              >
                <option value="mysql">MySQL</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </div>
            {(
              [
                { label: "Database", key: "database" },
                { label: "Host", key: "host" },
                { label: "Port", key: "port" },
                { label: "User", key: "user" },
                { label: "Password", key: "password", type: "password" },
              ] as { label: string; key: keyof DbConfig; type?: string }[]
            ).map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-stone-800 mb-0.5">{label}</label>
                <input
                  type={type ?? "text"}
                  value={cfg[key]}
                  onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
                  className="w-full bg-stone-50/50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm text-stone-800 focus:outline-none focus:border-stone-400"
                  placeholder={type === "password" ? "••••••••" : label.toLowerCase()}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          {status === "connected" && tables.length > 0 && (
            <div
              className="bg-stone-50 rounded-xl p-2.5 max-h-32 overflow-y-auto space-y-1"
              style={{ scrollbarWidth: "thin" }}
            >
              {tables.map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-stone-800">
                  <Table size={10} className="text-stone-700 shrink-0" />
                  <span className="font-mono truncate">{t}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-0.5 space-y-1.5">
            <button
              onClick={() => void connect()}
              disabled={status === "connecting"}
              className="w-full py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: G.accent }}
            >
              {status === "connecting" && <Loader2 size={13} className="animate-spin" />}
              {status === "connecting" ? "Connecting…" : status === "connected" ? "Reconnect" : "Connect"}
            </button>
            {status === "connected" && (
              <button
                onClick={() => void loadAll()}
                disabled={loadingAll}
                className="w-full py-2 text-sm font-semibold text-stone-800 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loadingAll && <Loader2 size={13} className="animate-spin" />}
                {loadingAll ? "Loading…" : "Load all tables"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
