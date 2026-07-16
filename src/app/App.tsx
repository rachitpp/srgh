import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileSpreadsheet,
  FlaskConical,
  Info,
  Loader2,
  Microscope,
  Send,
  Server,
  Settings,
  Table,
  Trash2,
  Upload,
  X,
} from "lucide-react";

// ── backend base url ──────────────────────────────────────────────────────────
// Override with VITE_API_BASE in a project-root .env if the server isn't on :8000.
const API_BASE =
  ((import.meta as any).env?.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

// ── types ─────────────────────────────────────────────────────────────────────

type MsgRole = "user" | "agent";
type DbType = "mysql" | "postgres";
type DbStatus = "disconnected" | "connecting" | "connected" | "error";

interface Visual {
  id: string; // "card" | "bar" | "pie" | "line" | "table"
  chart_html: string;
}

interface Message {
  id: string;
  role: MsgRole;
  text: string;
  visuals?: Visual[];
  error?: boolean;
  timestamp: Date;
  loading?: boolean;
}

interface LoadedInfo {
  source: "file" | "db";
  tables: string[];
  rows: number;
}

interface DbConfig {
  db_type: DbType;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

// Sober, neutral palette — flat dark charcoal accent, plain light-grey surfaces.
// No gradients, no glow: understated and professional.
const G = {
  brand: "#24292f",
  brandSoft: "#f1f2f3",
  page: "#f7f7f8",
};

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmt(d: Date) { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

async function postForm(path: string, form: FormData) {
  const res = await fetch(API_BASE + path, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}
async function postJson(path: string, body: unknown) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

// Mirror of the backend TABLE_KEYWORDS so "show rows / list all / records"
// requests go to /table (deterministic full rows) instead of /chat (LLM visuals).
const TABLE_KEYWORDS = [
  "record", "records", "row", "rows", "tabular",
  "table format", "in table", "as table",
  "show me", "show all", "show data", "display data",
  "list all", "list data", "list record",
  "get me", "give me", "fetch", "retrieve",
  "top ", "first ", "last ", "sample",
];
function isTableRequest(msg: string) {
  const m = msg.toLowerCase();
  return TABLE_KEYWORDS.some((k) => m.includes(k));
}

// ── ui pieces ─────────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-2 h-2 rounded-full bg-gray-400 inline-block animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

// Renders raw HTML returned by the backend and (re-)executes any <script> tags
// so Plotly.newPlot(...) actually runs. Setting innerHTML alone won't run scripts.
function HtmlVisual({ visual }: { visual: Visual }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = visual.chart_html;
    el.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      old.getAttributeNames().forEach((n) => {
        const v = old.getAttribute(n);
        if (v !== null) s.setAttribute(n, v);
      });
      s.textContent = old.textContent;
      old.parentNode?.replaceChild(s, old);
    });
  }, [visual.chart_html]);

  const id = visual.id;
  const isChart = id === "bar" || id === "pie" || id === "line";
  const height = id === "table" ? 440 : isChart ? 340 : undefined;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div ref={ref} style={{ width: "100%", height, minHeight: id === "card" ? 96 : undefined }} />
    </div>
  );
}

function AgentMessage({ msg }: { msg: Message }) {
  if (msg.loading) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: G.brand }}>
          <FlaskConical size={15} className="text-white" />
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3">
          <TypingDots />
        </div>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#fee2e2" }}>
          <AlertCircle size={15} className="text-red-500" />
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl rounded-tl-sm px-4 py-3 max-w-lg">
          <p className="text-sm text-red-700 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          <p className="text-xs text-red-400 mt-1">{fmt(msg.timestamp)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: G.brand }}>
        <FlaskConical size={15} className="text-white" />
      </div>
      <div className="flex-1 min-w-0 space-y-3 max-w-2xl">
        {msg.text && (
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3.5">
            <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
          </div>
        )}
        {msg.visuals?.map((v, i) => <HtmlVisual key={i} visual={v} />)}
        <div className="text-xs text-gray-400 pl-1">{fmt(msg.timestamp)}</div>
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: Message }) {
  return (
    <div className="flex items-start gap-3 justify-end">
      <div className="max-w-[70%] space-y-1">
        <div className="rounded-2xl rounded-tr-sm px-4 py-3" style={{ background: G.brand }}>
          <p className="text-[15px] text-white leading-relaxed">{msg.text}</p>
        </div>
        <div className="text-xs text-gray-400 text-right pr-1">{fmt(msg.timestamp)}</div>
      </div>
      <div className="w-9 h-9 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-gray-500">U</div>
    </div>
  );
}

// ── server status panel ───────────────────────────────────────────────────────

function ServerStatusPanel({ online }: { online: boolean | null }) {
  const dot = online === null ? "#f59e0b" : online ? "#10b981" : "#ef4444";
  const lbl = online === null ? "Checking…" : online ? "Connected" : "Offline";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-2.5 border-b border-gray-50">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f2f3f4" }}>
          <Server size={14} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">AI Backend</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />
            <span className="text-xs" style={{ color: dot }}>{lbl}</span>
          </div>
        </div>
        {online && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-400 font-mono truncate">{API_BASE}</p>
        {online === false && (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-2">
            <Info size={12} className="shrink-0 mt-0.5 text-amber-500" />
            Can't reach the server. Start it: <span className="font-mono">python main.py</span> in the <span className="font-mono">server/</span> folder.
          </div>
        )}
      </div>
    </div>
  );
}

// ── upload panel ──────────────────────────────────────────────────────────────

function UploadPanel({ onLoaded, onCleared }: { onLoaded: (i: LoadedInfo) => void; onCleared: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [rows, setRows] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) { setFile(f); setColumns(null); setError(null); setShowPreview(false); }
  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }

  async function parse() {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await postForm("/upload", form);
      if (data.error) { setError(data.error); setLoading(false); return; }
      // Backend now loads EVERY sheet as its own table; fall back to single-table
      // shape for older backends / plain CSVs.
      const tables: string[] = data.tables ?? [file.name];
      const total: number = data.total_rows ?? data.row_count ?? 0;
      setColumns(data.columns ?? []);
      setRows(total);
      setTableCount(tables.length);
      setLoading(false);
      onLoaded({ source: "file", tables, rows: total });
    } catch (e: any) {
      setLoading(false);
      setError(`Upload failed — is the backend running? (${e.message})`);
    }
  }

  function clear() {
    setFile(null); setColumns(null); setError(null); setRows(0); setTableCount(0); setShowPreview(false);
    if (inputRef.current) inputRef.current.value = "";
    onCleared();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-2.5 border-b border-gray-50">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#f2f3f4" }}>
          <FileSpreadsheet size={14} className="text-gray-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">Upload Dataset</p>
          <p className="text-xs text-gray-400">.xlsx · .xls · .csv</p>
        </div>
        {columns && (
          <button onClick={clear} className="text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <div className="px-4 py-4">
        {!file && !columns ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed rounded-2xl px-4 py-7 flex flex-col items-center gap-2.5 cursor-pointer transition-all duration-200"
            style={{ borderColor: dragging ? "#374151" : "#d7dadd", background: dragging ? "rgba(55,65,81,0.05)" : "rgba(55,65,81,0.02)" }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: G.brandSoft }}>
              <Upload size={18} className="text-gray-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Drop your file here</p>
              <p className="text-xs text-gray-400 mt-0.5">or click to browse</p>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : columns ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
              <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{file?.name}</p>
                <p className="text-xs text-gray-500">
                  {tableCount > 1
                    ? `${tableCount} tables · ${rows.toLocaleString()} rows`
                    : `${rows.toLocaleString()} rows · ${columns.length} columns`}
                </p>
              </div>
            </div>
            <button onClick={() => setShowPreview((s) => !s)} className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <span className="font-medium">Preview columns</span>
              <ChevronRight size={12} className={`transition-transform ${showPreview ? "rotate-90" : ""}`} />
            </button>
            {showPreview && (
              <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1" style={{ scrollbarWidth: "thin" }}>
                {columns.map((col) => (
                  <div key={col} className="flex items-center text-xs">
                    <span className="font-mono text-gray-700 truncate">{col}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 bg-gray-50/60 border border-gray-100 rounded-xl px-3 py-2.5">
              <FileSpreadsheet size={14} className="text-gray-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{file?.name}</p>
                <p className="text-xs text-gray-400">{((file?.size ?? 0) / 1024).toFixed(1)} KB</p>
              </div>
              {!loading && <button onClick={clear} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                <AlertCircle size={12} />{error}
              </div>
            )}
            {!loading ? (
              <button onClick={parse} className="w-full py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background: G.brand }}>
                Upload & Load
              </button>
            ) : (
              <button disabled className="w-full py-2.5 text-sm font-semibold text-white rounded-xl opacity-60 flex items-center justify-center gap-2" style={{ background: G.brand }}>
                <Loader2 size={13} className="animate-spin" /> Uploading…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── db panel (real — talks to backend) ────────────────────────────────────────

function DbPanel({ onLoaded, onStatusChange }: { onLoaded: (i: LoadedInfo) => void; onStatusChange: (s: DbStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DbStatus>("disconnected");
  const [tables, setTables] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [cfg, setCfg] = useState<DbConfig>({ db_type: "mysql", host: "localhost", port: "3306", user: "", password: "", database: "" });

  function setStat(s: DbStatus) { setStatus(s); onStatusChange(s); }
  function body() {
    return { db_type: cfg.db_type, host: cfg.host, port: Number(cfg.port), user: cfg.user, password: cfg.password, database: cfg.database };
  }

  async function connect() {
    setStat("connecting"); setError(null); setTables([]);
    try {
      const data = await postJson("/db/connect", body());
      if (data.success) { setTables(data.tables ?? []); setStat("connected"); }
      else { setError(data.error ?? "Connection failed"); setStat("error"); }
    } catch (e: any) {
      setError(`Can't reach backend (${e.message})`); setStat("error");
    }
  }

  async function loadAll() {
    setLoadingAll(true); setError(null);
    try {
      const data = await postJson("/db/load-all-tables", { ...body(), limit_per_table: 500 });
      if (data.error) { setError(data.error); setLoadingAll(false); return; }
      const total = Object.values(data.row_counts ?? {}).reduce((a: number, b: any) => a + Number(b), 0);
      onLoaded({ source: "db", tables: data.tables ?? [], rows: total });
      setLoadingAll(false);
    } catch (e: any) {
      setError(`Load failed (${e.message})`); setLoadingAll(false);
    }
  }

  const dot: Record<DbStatus, string> = { disconnected: "#d1d5db", connecting: "#f59e0b", connected: "#10b981", error: "#ef4444" };
  const lbl: Record<DbStatus, string> = { disconnected: "Not connected", connecting: "Connecting…", connected: `${tables.length} tables found`, error: "Failed" };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50/40 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: G.brandSoft }}>
            <Database size={14} className="text-gray-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-800">Database</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot[status] }} />
              <span className="text-xs" style={{ color: dot[status] }}>{lbl[status]}</span>
            </div>
          </div>
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <select value={cfg.db_type} onChange={(e) => setCfg({ ...cfg, db_type: e.target.value as DbType, port: e.target.value === "postgres" ? "5432" : "3306" })}
                className="w-full bg-gray-50/50 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-gray-300">
                <option value="mysql">MySQL</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </div>
            {([
              { label: "Database", key: "database" },
              { label: "Host", key: "host" },
              { label: "Port", key: "port" },
              { label: "User", key: "user" },
              { label: "Password", key: "password", type: "password" },
            ] as { label: string; key: keyof DbConfig; type?: string }[]).map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <input type={type ?? "text"} value={(cfg as any)[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
                  className="w-full bg-gray-50/50 border border-gray-100 rounded-xl px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-gray-300"
                  placeholder={type === "password" ? "••••••••" : label.toLowerCase()} />
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertCircle size={12} />{error}
            </div>
          )}

          {status === "connected" && tables.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-2.5 max-h-32 overflow-y-auto space-y-1" style={{ scrollbarWidth: "thin" }}>
              {tables.map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Table size={10} className="text-gray-400 shrink-0" />
                  <span className="font-mono truncate">{t}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-1 space-y-2">
            <button onClick={connect} disabled={status === "connecting"}
              className="w-full py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: G.brand }}>
              {status === "connecting" && <Loader2 size={13} className="animate-spin" />}
              {status === "connecting" ? "Connecting…" : status === "connected" ? "Reconnect" : "Connect"}
            </button>
            {status === "connected" && (
              <button onClick={loadAll} disabled={loadingAll}
                className="w-full py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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

// ── empty state ───────────────────────────────────────────────────────────────

// One+ suggestion per loaded sheet, chosen so the routing produces a mix of
// visuals: pie (part-of-whole), line/bar (trend & ranking), card (single KPI),
// and table (queries containing a TABLE_KEYWORD like "list all" / "show all").
const SUGGESTIONS = [
  // lab_income_biochem_2025 — Revenue
  "Revenue share of OPD vs IPD patients",        // → pie
  "Monthly revenue trend for 2025",              // → line
  // lab_sevice_details — Service & TAT
  "Average turnaround time (TAT)",               // → card
  "Which department has the longest TAT?",       // → bar
  // expense_biochem_2024_2025 — Cost
  "Expense breakdown by category",               // → pie
  "Compare monthly laboratory expenses",         // → line / bar
  // lab_testset_master_biochem — Test master
  "List all biochemistry test sets",             // → table
  // careprov — Doctor master
  "Count of doctors by specialty",               // → pie / bar
  "Show all active doctors",                     // → table
  // treating_unit — Department master
  "List all treating units",                     // → table
  // costing_format_grouping_master — Finance mapping
  "List all P&L groups",                         // → table
];

function EmptyState({ hasData, online, onPrompt }: { hasData: boolean; online: boolean | null; onPrompt: (p: string) => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center border border-gray-200 bg-white">
        <Microscope size={30} className="text-gray-700" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2.5 tracking-tight">SGRH Lab Assistant</h2>
        <p className="text-[15px] text-gray-500 max-w-md leading-relaxed">
          {online === false
            ? "Backend offline — start the FastAPI server, then upload a file or connect a database."
            : hasData
              ? "Data loaded! Ask anything — summaries, KPIs, charts, tables, comparisons, turnaround times."
              : "Upload a CSV/Excel file or connect a MySQL/PostgreSQL database in the sidebar to start analyzing."}
        </p>
      </div>
      {hasData && (
        <div className="grid grid-cols-2 gap-2.5 w-full max-w-md">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => onPrompt(s)}
              className="flex items-start gap-2 text-left px-3.5 py-3 rounded-2xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-all duration-150 group">
              <ChevronRight size={10} className="text-gray-400 mt-0.5 shrink-0 group-hover:text-gray-600 transition-colors" />
              <span className="text-xs text-gray-600 group-hover:text-gray-800 leading-snug transition-colors">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState<LoadedInfo | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus>("disconnected");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Auto-grow the input to fit its content (capped by max-h), so typed or
  // pasted text always sits with equal padding above and below.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Ping the backend on mount (and expose a re-check).
  const ping = useCallback(() => {
    fetch(API_BASE + "/status").then((r) => r.json()).then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);
  useEffect(() => { ping(); }, [ping]);

  const submitQuery = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q || isLoading) return;
    setInput("");
    setIsLoading(true);

    const userMsg: Message = { id: uid(), role: "user", text: q, timestamp: new Date() };
    const placeholder: Message = { id: uid(), role: "agent", text: "", timestamp: new Date(), loading: true };
    setMessages((m) => [...m, userMsg, placeholder]);

    try {
      const endpoint = isTableRequest(q) ? "/table" : "/chat";
      const form = new FormData();
      form.append("message", q);
      const data = await postForm(endpoint, form);
      setOnline(true);
      setMessages((m) => [...m.slice(0, -1), {
        id: uid(), role: "agent",
        text: data.text ?? "", visuals: data.visuals ?? [],
        timestamp: new Date(),
      }]);
    } catch (e: any) {
      setOnline(false);
      setMessages((m) => [...m.slice(0, -1), {
        id: uid(), role: "agent", error: true,
        text: `Couldn't reach the AI backend at ${API_BASE}.\nStart it with "python main.py" in the server/ folder, then try again.`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitQuery(input); }
  }

  function onLoaded(info: LoadedInfo) { setLoaded(info); }
  function onCleared() { setLoaded(null); }

  const hasData = !!loaded;
  const canSend = online !== false;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: G.page }}>

      {/* header */}
      <header className="shrink-0 border-b border-gray-200 bg-white flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: G.brand }}>
            <FlaskConical size={16} className="text-white" />
          </div>
          <div>
            <span className="text-[17px] font-bold tracking-tight text-gray-900">SGRH Lab Assistant</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasData && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
              <CheckCircle2 size={11} />
              {loaded!.tables.length} {loaded!.tables.length === 1 ? "table" : "tables"} · {loaded!.rows.toLocaleString()} rows
            </span>
          )}
          {dbStatus === "connected" && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />DB Live
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border"
            style={{
              color: online ? "#374151" : "#b91c1c",
              background: online ? "#f3f4f6" : "#fef2f2",
              borderColor: online ? "#e5e7eb" : "#fee2e2",
            }}>
            <Server size={10} />{online === null ? "…" : online ? "AI Online" : "AI Offline"}
          </span>
          <button className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* body */}
      <div className="flex-1 flex overflow-hidden">

        {/* sidebar */}
        <aside className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col p-4 gap-5 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Data Sources</p>
            <div className="space-y-3">
              <UploadPanel onLoaded={onLoaded} onCleared={onCleared} />
              <DbPanel onLoaded={onLoaded} onStatusChange={setDbStatus} />
            </div>
          </div>

          {hasData && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Quick Queries</p>
              <div className="space-y-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="w-full flex items-center gap-2 text-left px-3.5 py-2.5 rounded-xl text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors group">
                    <ChevronRight size={11} className="text-gray-400 group-hover:text-gray-600 transition-colors shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto">
            <div className="rounded-2xl p-4 border border-gray-100" style={{ background: G.brandSoft }}>
              <p className="text-xs font-bold text-gray-700 mb-2.5">Session Info</p>
              <div className="space-y-1.5 text-xs text-gray-600/80 font-mono">
                <div className="flex justify-between"><span>Engine</span><span>Gemini · Vertex</span></div>
                <div className="flex justify-between"><span>Source</span><span>{loaded ? loaded.source : "none"}</span></div>
                <div className="flex justify-between"><span>Protocol</span><span>ISO-15189</span></div>
              </div>
            </div>
          </div>
        </aside>

        {/* main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-8 py-8 space-y-6" style={{ scrollbarWidth: "none" }}>
            {messages.length === 0
              ? <EmptyState hasData={hasData} online={online} onPrompt={submitQuery} />
              : messages.map((msg) =>
                  msg.role === "user"
                    ? <UserMessage key={msg.id} msg={msg} />
                    : <AgentMessage key={msg.id} msg={msg} />
                )
            }
            <div ref={bottomRef} />
          </div>

          {/* input bar */}
          <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
            {online === false && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 mb-3">
                <Server size={12} className="shrink-0 text-amber-500" />
                Backend offline. Run <span className="font-mono">python main.py</span> in the <span className="font-mono">server/</span> folder, then
                <button onClick={ping} className="underline font-semibold ml-1">retry</button>.
              </div>
            )}
            {online && !hasData && (
              <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5 mb-3">
                <Upload size={12} className="shrink-0 text-blue-500" />
                Upload a dataset or connect a database in the sidebar — then ask questions about your lab data.
              </div>
            )}
            <div
              className="flex items-end gap-2 border rounded-2xl bg-white transition-all duration-200"
              style={{ borderColor: canSend && input ? "rgba(55,65,81,0.35)" : "rgba(55,65,81,0.12)", boxShadow: canSend && input ? "0 0 0 3px rgba(55,65,81,0.08)" : undefined }}
            >
              <textarea ref={inputRef} value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={!canSend || isLoading}
                placeholder={canSend ? "Ask anything about your lab data in plain English…" : "Start the backend to begin"}
                rows={1}
                className="flex-1 bg-transparent resize-none overflow-y-auto px-4 py-3.5 text-sm leading-5 text-gray-800 placeholder-gray-400 focus:outline-none max-h-40"
                style={{ scrollbarWidth: "none" }}
              />
              {/* pb-1.5 = (3rem input height − 2.25rem button) / 2 → button is
                  vertically centered on one line, bottom-anchored when multiline */}
              <div className="flex items-center px-2 pb-1.5">
                <button
                  onClick={() => submitQuery(input)}
                  disabled={!canSend || !input.trim() || isLoading}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: G.brand }}
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
            <p className="text-xs text-center text-gray-400 mt-2.5">
              <kbd className="font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md text-[10px]">Enter</kbd> to send ·{" "}
              <kbd className="font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md text-[10px]">Shift+Enter</kbd> for new line
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
