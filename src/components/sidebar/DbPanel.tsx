import { useState } from "react";
import { AlertCircle, ChevronDown, Database, Loader2, Table } from "lucide-react";
import type { DbConfig, DbConnectPayload, DbStatus, DbType, LoadedInfo } from "../../types";
import { isApiError } from "../../types";
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

  // Status colours are theme tokens (CSS vars) so they re-theme with the app.
  const dot: Record<DbStatus, string> = {
    disconnected: "var(--muted-foreground)",
    connecting: "var(--warning)",
    connected: "var(--success)",
    error: "var(--destructive)",
  };
  const txt: Record<DbStatus, string> = {
    disconnected: "var(--muted-foreground)",
    connecting: "var(--warning)",
    connected: "var(--success)",
    error: "var(--destructive)",
  };
  const lbl: Record<DbStatus, string> = {
    disconnected: "Not connected",
    connecting: "Connecting…",
    connected: `${tables.length} tables found`,
    error: "Failed",
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-brand-soft">
            <Database size={14} className="text-brand-soft-foreground" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">Database</p>
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
          className={`text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 pb-3.5 pt-2.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-foreground mb-0.5">Type</label>
              <select
                value={cfg.db_type}
                onChange={(e) =>
                  setCfg({
                    ...cfg,
                    db_type: e.target.value as DbType,
                    port: e.target.value === "postgres" ? "5432" : "3306",
                  })
                }
                className="w-full bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring"
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
                <label className="block text-xs font-medium text-foreground mb-0.5">{label}</label>
                <input
                  type={type ?? "text"}
                  value={cfg[key]}
                  onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
                  className="w-full bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring"
                  placeholder={type === "password" ? "••••••••" : label.toLowerCase()}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
              <AlertCircle size={12} />
              {error}
            </div>
          )}

          {status === "connected" && tables.length > 0 && (
            <div
              className="bg-muted rounded-xl p-2.5 max-h-32 overflow-y-auto space-y-1"
              style={{ scrollbarWidth: "thin" }}
            >
              {tables.map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-foreground">
                  <Table size={10} className="text-muted-foreground shrink-0" />
                  <span className="font-mono truncate">{t}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-0.5 space-y-1.5">
            <button
              onClick={() => void connect()}
              disabled={status === "connecting"}
              className="w-full py-2 text-sm font-semibold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {status === "connecting" && <Loader2 size={13} className="animate-spin" />}
              {status === "connecting" ? "Connecting…" : status === "connected" ? "Reconnect" : "Connect"}
            </button>
            {status === "connected" && (
              <button
                onClick={() => void loadAll()}
                disabled={loadingAll}
                className="w-full py-2 text-sm font-semibold text-foreground border border-border rounded-xl hover:bg-muted transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
