import { useEffect, useRef, useState, useCallback } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  FileSpreadsheet,
  FlaskConical,
  GripHorizontal,
  Info,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Microscope,
  PanelLeft,
  PanelLeftClose,
  Pin,
  Send,
  Server,
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

// A visual pinned onto the free-form dashboard canvas. Position/size are stored
// in pixels (snapped to a grid) and persisted to localStorage — moving/resizing
// a widget only changes layout, never the underlying chart data.
interface Widget {
  wid: string;
  visualId: string; // "card" | "bar" | "pie" | "line" | "table"
  chartHtml: string;
  title: string;
  color: string;    // metric-domain accent, shown as a dot in the widget header
  x: number; y: number; w: number; h: number;
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

// Clean clinical palette — white content canvas, cool light-grey chrome, a single
// teal accent. Cool slate ink instead of warm charcoal. No gradients, no glow.
const G = {
  brand: "#0f172a",      // cool slate ink — logo tiles, message avatars
  brandSoft: "#eef2f7",  // cool light grey for icon tiles / soft fills
  page: "#ffffff",       // clean white content canvas
  accent: "#0f766e",     // clinical teal — the single action/identity accent
  accentSoft: "#e6f4f2", // soft teal wash for accented tiles / highlights
  panel: "#f4f6f9",      // cool light grey sidebar — recessed a step below content
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

// Hover-reveal copy control for an assistant answer's text. Shows a check for a
// beat after copying so the action has clear feedback.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked — silently no-op */ }
  }
  return (
    <button
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy answer"}
      title={copied ? "Copied" : "Copy answer"}
      className="flex items-center justify-center w-6 h-6 rounded-md text-stone-500 hover:text-stone-800 hover:bg-stone-100 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
    >
      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
    </button>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-2 h-2 rounded-full bg-stone-400 inline-block animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

// Renders raw HTML returned by the backend and (re-)executes any <script> tags
// so Plotly.newPlot(...) actually runs. Setting innerHTML alone won't run scripts.
function HtmlVisual({ visual, bare = false, fill = false }: { visual: Visual; bare?: boolean; fill?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Re-key the chart id to be unique to THIS mounted instance. The server
    // ships each chart with an id like `chart_ab12` referenced both by the div
    // and the Plotly.newPlot(...) call. If the same visual is rendered twice
    // (e.g. once in chat and once pinned to the dashboard), getElementById would
    // resolve both scripts to the first div — so we rewrite every occurrence of
    // the original id token to a fresh one before injecting.
    let html = visual.chart_html;
    const idMatch = html.match(/chart_[\w-]+/);
    if (idMatch) html = html.split(idMatch[0]).join(`chart_${uid()}`);
    el.innerHTML = html;
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

  // Reflow the chart when its CONTAINER resizes. Plotly's `responsive:true` only
  // listens to window-resize events, so dragging a dashboard card's corner (which
  // changes the div but not the window) would otherwise leave the plot frozen at
  // its original size. A ResizeObserver watches the div directly and asks Plotly
  // to re-fit on every size change.
  useEffect(() => {
    const el = ref.current;
    if (!el || !fill) return;
    const Plotly = (window as any).Plotly;
    const ro = new ResizeObserver(() => {
      const plot = el.querySelector(".js-plotly-plot") as HTMLElement | null;
      if (plot && Plotly?.Plots?.resize) Plotly.Plots.resize(plot);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill, visual.chart_html]);

  const id = visual.id;
  const isChart = id === "bar" || id === "pie" || id === "line";
  // fill → the parent (a dashboard cell) controls the size; the chart stretches
  // to 100% and the ResizeObserver above reflows Plotly to match.
  const height = fill ? "100%" : id === "table" ? 460 : isChart ? 400 : undefined;

  const body = (
    <div
      ref={ref}
      className={fill ? "h-full w-full overflow-auto" : undefined}
      style={{ width: "100%", height, minHeight: !fill && id === "card" ? 96 : undefined }}
    />
  );
  // bare → rendered inside an insight card that already has a border; fill →
  // rendered inside a dashboard widget shell that owns the chrome.
  if (bare || fill) return body;
  return <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">{body}</div>;
}

// Maps an answer to its metric domain so the insight card's tag + accent match
// the chart colors (same hex values as the sidebar groups / server tokens).
const METRIC_TAGS: { tag: string; color: string; re: RegExp }[] = [
  { tag: "TAT",     color: "#996A26", re: /\btat\b|turnaround|delay/i },
  { tag: "Cost",    color: "#983B40", re: /expense|expenditure|cost|spend/i },
  { tag: "Revenue", color: "#1A7350", re: /revenue|income|billed|billing|payor|collection/i },
  { tag: "Service", color: "#0A5F67", re: /test|service|doctor|department|patient|sample|unit/i },
];
function detectMetric(text: string) {
  return METRIC_TAGS.find((m) => m.re.test(text)) ?? { tag: "Insight", color: "#0A5F67" };
}

// A short label for a pinned widget: the insight sentence trimmed to its first
// clause, falling back to the metric tag when the answer has no text.
function pinTitle(text: string, fallback: string) {
  const t = (text || "").split(/[.\n]/)[0].trim();
  if (!t) return fallback;
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}

function AgentMessage({ msg, sourceNote, onPin }: { msg: Message; sourceNote?: string; onPin?: (v: Visual, title: string) => void }) {
  if (msg.loading) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: G.brand }}>
          <FlaskConical size={15} className="text-white" />
        </div>
        <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-4 py-3">
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

  // Insight card — every answer framed like an analytics product: metric tag +
  // timestamp header, the insight sentence as the headline, visuals in the body,
  // and a quiet data-source footer.
  const metric = detectMetric(msg.text || "");
  const hasVisuals = !!msg.visuals?.length;
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: G.brand }}>
        <FlaskConical size={15} className="text-white" />
      </div>
      <div className="flex-1 min-w-0 max-w-4xl">
        {/* metric-color spine — a quiet accent that colour-codes the answer by
            domain (matches the tag + the dashboard widget dots) for fast scanning */}
        <div
          className="group bg-white border border-stone-200 rounded-2xl rounded-tl-sm overflow-hidden shadow-sm"
          style={{ borderLeftWidth: 3, borderLeftColor: metric.color }}
        >
          <div className="flex items-center justify-between px-4 pt-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
              style={{ color: metric.color, background: `${metric.color}14` }}
            >
              {metric.tag}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-stone-700 font-mono">{fmt(msg.timestamp)}</span>
              {msg.text && <CopyButton text={msg.text} />}
            </div>
          </div>
          {msg.text && (
            <p className="px-4 pt-2.5 pb-3.5 text-[15px] font-medium text-stone-900 leading-relaxed whitespace-pre-wrap">
              {msg.text}
            </p>
          )}
          {msg.visuals?.map((v, i) => {
            // Charts get a small inset so they sit framed inside the card;
            // tables stay full-bleed so wide columns can scroll edge to edge.
            const isChart = v.id === "bar" || v.id === "pie" || v.id === "line";
            return (
              <div key={i} className={`group/vis relative border-t border-stone-100 ${isChart ? "px-3 py-2" : ""}`}>
                <HtmlVisual visual={v} bare />
                {onPin && (
                  <button
                    onClick={() => onPin(v, pinTitle(msg.text, metric.tag))}
                    aria-label="Pin to dashboard"
                    title="Pin to dashboard"
                    className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/90 border border-stone-200 text-[11px] font-medium text-stone-800 opacity-0 group-hover/vis:opacity-100 hover:text-stone-900 hover:border-stone-300 transition-all backdrop-blur-sm"
                  >
                    <Pin size={11} /> Pin
                  </button>
                )}
              </div>
            );
          })}
          {/* Data-source provenance — the header status pill already shows the
              live source, so we keep this per-answer note but reveal it only on
              hover to stop it repeating as noise under every card. */}
          {hasVisuals && sourceNote && (
            <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-200">
              <div className="overflow-hidden">
                <p className="px-4 pb-2.5 pt-1 text-[11px] text-stone-700 font-mono">{sourceNote}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: Message }) {
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
      <div className="w-9 h-9 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-stone-800">U</div>
    </div>
  );
}

// ── server status panel ───────────────────────────────────────────────────────

function ServerStatusPanel({ online }: { online: boolean | null }) {
  const dot = online === null ? "#f59e0b" : online ? "#10b981" : "#ef4444";
  const lbl = online === null ? "Checking…" : online ? "Connected" : "Offline";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-stone-100">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#efece7" }}>
          <Server size={14} className="text-stone-800" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900">AI Backend</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot }} />
            <span className="text-xs" style={{ color: dot }}>{lbl}</span>
          </div>
        </div>
        {online && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-stone-700 font-mono truncate">{API_BASE}</p>
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
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-stone-100">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: G.brandSoft }}>
          <FileSpreadsheet size={14} className="text-stone-800" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-stone-900">Upload Dataset</p>
          <p className="text-xs text-stone-700">.xlsx · .xls · .csv</p>
        </div>
        {columns && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">Loaded</span>
            <button onClick={clear} aria-label="Remove dataset" title="Remove dataset" className="text-stone-700 hover:text-red-500 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-3.5">
        {!file && !columns ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed rounded-xl px-4 py-4 flex flex-col items-center gap-2 cursor-pointer transition-all duration-200"
            style={{
              borderColor: dragging ? G.accent : "#d6d3d1",
              background: dragging ? "rgba(15,118,110,0.06)" : "rgba(15,23,42,0.02)",
            }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors" style={{ background: dragging ? G.accentSoft : G.brandSoft }}>
              <Upload size={17} className="text-stone-800" style={dragging ? { color: G.accent } : undefined} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-stone-800 transition-colors" style={dragging ? { color: G.accent } : undefined}>
                {dragging ? "Drop to upload" : "Drop your file here"}
              </p>
              <p className="text-xs text-stone-700 mt-0.5">or click to browse</p>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : columns ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5">
              <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{file?.name}</p>
                <p className="text-xs text-stone-800">
                  {tableCount > 1
                    ? `${tableCount} tables · ${rows.toLocaleString()} rows`
                    : `${rows.toLocaleString()} rows · ${columns.length} columns`}
                </p>
              </div>
            </div>
            <button onClick={() => setShowPreview((s) => !s)} className="w-full flex items-center justify-between px-3 py-2 text-xs text-stone-800 bg-stone-50 rounded-xl hover:bg-stone-100 transition-colors">
              <span className="font-medium">Preview columns</span>
              <ChevronRight size={12} className={`transition-transform ${showPreview ? "rotate-90" : ""}`} />
            </button>
            {showPreview && (
              <div className="bg-stone-50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1" style={{ scrollbarWidth: "thin" }}>
                {columns.map((col) => (
                  <div key={col} className="flex items-center text-xs">
                    <span className="font-mono text-stone-800 truncate">{col}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 bg-stone-50/60 border border-stone-200 rounded-xl px-3 py-2.5">
              <FileSpreadsheet size={14} className="text-stone-800 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{file?.name}</p>
                <p className="text-xs text-stone-700">{((file?.size ?? 0) / 1024).toFixed(1)} KB</p>
              </div>
              {!loading && <button onClick={clear} className="text-stone-700 hover:text-stone-800"><X size={13} /></button>}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                <AlertCircle size={12} />{error}
              </div>
            )}
            {!loading ? (
              <button onClick={parse} className="w-full py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background: G.accent }}>
                Upload & Load
              </button>
            ) : (
              <button disabled className="w-full py-2.5 text-sm font-semibold text-white rounded-xl opacity-60 flex items-center justify-center gap-2" style={{ background: G.accent }}>
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
    // Trim host/user/database so a stray leading/trailing space can't break the
    // connection — Postgres' pg_hba matching is exact, so "staging " ≠ "staging".
    // Password is left untouched (spaces can be significant in a password).
    return { db_type: cfg.db_type, host: cfg.host.trim(), port: Number(cfg.port), user: cfg.user.trim(), password: cfg.password, database: cfg.database.trim() };
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

  const dot: Record<DbStatus, string> = { disconnected: "#94a3b8", connecting: "#f59e0b", connected: "#10b981", error: "#ef4444" };
  const txt: Record<DbStatus, string> = { disconnected: "#64748b", connecting: "#b45309", connected: "#047857", error: "#dc2626" };
  const lbl: Record<DbStatus, string> = { disconnected: "Not connected", connecting: "Connecting…", connected: `${tables.length} tables found`, error: "Failed" };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50/40 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: G.brandSoft }}>
            <Database size={14} className="text-stone-800" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-stone-900">Database</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dot[status] }} />
              <span className="text-xs font-medium" style={{ color: txt[status] }}>{lbl[status]}</span>
            </div>
          </div>
        </div>
        <ChevronDown size={14} className={`text-stone-700 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-stone-100 px-4 pb-3.5 pt-2.5 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-stone-800 mb-0.5">Type</label>
              <select value={cfg.db_type} onChange={(e) => setCfg({ ...cfg, db_type: e.target.value as DbType, port: e.target.value === "postgres" ? "5432" : "3306" })}
                className="w-full bg-stone-50/50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm text-stone-800 focus:outline-none focus:border-stone-400">
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
                <label className="block text-xs font-medium text-stone-800 mb-0.5">{label}</label>
                <input type={type ?? "text"} value={(cfg as any)[key]} onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
                  className="w-full bg-stone-50/50 border border-stone-200 rounded-lg px-2.5 py-1.5 text-sm text-stone-800 focus:outline-none focus:border-stone-400"
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
            <div className="bg-stone-50 rounded-xl p-2.5 max-h-32 overflow-y-auto space-y-1" style={{ scrollbarWidth: "thin" }}>
              {tables.map((t) => (
                <div key={t} className="flex items-center gap-1.5 text-xs text-stone-800">
                  <Table size={10} className="text-stone-700 shrink-0" />
                  <span className="font-mono truncate">{t}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-0.5 space-y-1.5">
            <button onClick={connect} disabled={status === "connecting"}
              className="w-full py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: G.accent }}>
              {status === "connecting" && <Loader2 size={13} className="animate-spin" />}
              {status === "connecting" ? "Connecting…" : status === "connected" ? "Reconnect" : "Connect"}
            </button>
            {status === "connected" && (
              <button onClick={loadAll} disabled={loadingAll}
                className="w-full py-2 text-sm font-semibold text-stone-800 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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

// Quick queries grouped by metric domain. Each group's dot color matches the
// accent the backend uses for that metric's charts (see design tokens in
// server/main.py), and the queries are phrased to produce a mix of visuals:
// pie (part-of-whole), line (trend), bar (ranking), card (KPI), table ("list all").
const QUERY_GROUPS: { label: string; color: string; queries: string[] }[] = [
  {
    label: "Revenue", color: "#1A7350",
    queries: [
      "Revenue share of OPD vs IPD patients",              // → pie
      "What is the revenue share by billing payor type?",  // → pie
      "Monthly revenue trend for 2025",                    // → line
    ],
  },
  {
    label: "Turnaround Time", color: "#996A26",
    queries: [
      "Average turnaround time (TAT)",                     // → card
      "Which department has the longest TAT?",             // → bar
    ],
  },
  {
    label: "Cost", color: "#983B40",
    queries: [
      "Expense breakdown by category",                     // → bar/pie
      "Compare monthly laboratory expenses",               // → line
    ],
  },
  {
    label: "Masters", color: "#0A5F67",
    queries: [
      "List all biochemistry test sets",                   // → table
      "Count of doctors by specialty",                     // → pie
      "List all treating units",                           // → table
      "List all P&L groups",                               // → table
    ],
  },
];

// Flat view (query + its group color + label) for the empty-state grid.
const FLAT_SUGGESTIONS = QUERY_GROUPS.flatMap((g) => g.queries.map((q) => ({ q, color: g.color, label: g.label })));

function EmptyState({ hasData, online, onPrompt }: { hasData: boolean; online: boolean | null; onPrompt: (p: string) => void }) {
  return (
    <div className="m-auto flex flex-col items-center gap-7 px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: G.accentSoft }}>
          <Microscope size={30} style={{ color: G.accent }} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-stone-900 tracking-tight">SGRH Lab Assistant</h2>
          <p className="text-[15px] text-stone-600 max-w-md leading-relaxed mx-auto">
            {online === false
              ? "Backend offline — start the FastAPI server, then upload a file or connect a database."
              : hasData
                ? "Ask anything about your lab data — summaries, KPIs, charts, tables, and turnaround times."
                : "Upload a CSV/Excel file or connect a database in the sidebar to begin."}
          </p>
        </div>
      </div>
      {online !== false && (
        <div className="w-full max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500 mb-3 text-center">
            {hasData ? "Try asking" : "Example questions"}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {FLAT_SUGGESTIONS.slice(0, 6).map(({ q, color, label }) => (
              <button key={q} onClick={() => onPrompt(q)}
                className="flex flex-col gap-1.5 text-left px-3.5 py-3 rounded-2xl border border-stone-200 bg-white shadow-sm hover:border-stone-300 hover:shadow-md hover:-translate-y-px transition-all duration-150 group">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
                </span>
                <span className="text-xs text-stone-800 group-hover:text-stone-900 leading-snug transition-colors">{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── dashboard canvas ──────────────────────────────────────────────────────────
// A PowerBI-style free canvas of pinned visuals. Widgets can be dragged and
// resized (snapped to a grid) but the operation is purely visual — it never
// touches the chart data, which lives untouched inside each widget's HTML.

const GRID = 16;      // snap step, px
const MIN_W = 240;    // smallest a widget can shrink to
const MIN_H = 140;
const snap = (n: number) => Math.round(n / GRID) * GRID;

// Sensible starting footprint for a freshly pinned visual, by chart kind.
function defaultSize(id: string): { w: number; h: number } {
  if (id === "table") return { w: 576, h: 432 };
  if (id === "card") return { w: 304, h: 160 };
  return { w: 448, h: 352 }; // bar / pie / line
}

function DashWidget({ widget, onChange, onRemove }: { widget: Widget; onChange: (w: Widget) => void; onRemove: () => void }) {
  // Latest props are read through a ref so the window listeners (attached once)
  // always see current values without re-subscribing mid-drag.
  const latest = useRef({ widget, onChange });
  latest.current = { widget, onChange };
  const drag = useRef<{ mode: "move" | "resize"; px: number; py: number; orig: Widget } | null>(null);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const s = drag.current;
      if (!s) return;
      const dx = e.clientX - s.px;
      const dy = e.clientY - s.py;
      if (s.mode === "move") {
        latest.current.onChange({ ...s.orig, x: Math.max(0, snap(s.orig.x + dx)), y: Math.max(0, snap(s.orig.y + dy)) });
      } else {
        latest.current.onChange({ ...s.orig, w: Math.max(MIN_W, snap(s.orig.w + dx)), h: Math.max(MIN_H, snap(s.orig.h + dy)) });
      }
    }
    function onUp() { drag.current = null; document.body.style.userSelect = ""; }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, []);

  function begin(mode: "move" | "resize", e: React.PointerEvent) {
    e.preventDefault();
    drag.current = { mode, px: e.clientX, py: e.clientY, orig: latest.current.widget };
    document.body.style.userSelect = "none";
  }

  return (
    <div
      className="absolute flex flex-col bg-white border border-stone-200 rounded-2xl shadow-sm transition-shadow duration-150 hover:shadow-md overflow-hidden"
      style={{ left: widget.x, top: widget.y, width: widget.w, height: widget.h }}
    >
      {/* Drag bar — deliberately carries NO answer text: a pinned widget is the
          visual on its own (the insight sentence stays in the chat). The metric
          dot keeps the domain colour-coding and the grip signals draggability. */}
      <div
        onPointerDown={(e) => begin("move", e)}
        className="shrink-0 flex items-center justify-between gap-2 px-3 h-8 border-b border-stone-100 bg-stone-50/70 cursor-move select-none"
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: widget.color || "#0A5F67" }} />
        <GripHorizontal size={13} className="text-stone-400 shrink-0" />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          aria-label="Remove from dashboard"
          title="Remove from dashboard"
          className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-stone-700 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 min-h-0 p-1">
        <HtmlVisual visual={{ id: widget.visualId, chart_html: widget.chartHtml }} fill />
      </div>
      {/* resize handle */}
      <div
        onPointerDown={(e) => begin("resize", e)}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        style={{ background: "linear-gradient(135deg, transparent 50%, rgba(107,114,128,0.35) 50%)" }}
      />
    </div>
  );
}

function Dashboard({ widgets, setWidgets }: { widgets: Widget[]; setWidgets: React.Dispatch<React.SetStateAction<Widget[]>> }) {
  const update = (w: Widget) => setWidgets((prev) => prev.map((x) => (x.wid === w.wid ? w : x)));
  const remove = (wid: string) => setWidgets((prev) => prev.filter((x) => x.wid !== wid));

  if (widgets.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center" style={{ background: G.page }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: G.accentSoft }}>
          <LayoutDashboard size={28} style={{ color: G.accent }} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-stone-900 mb-1.5">Your dashboard is empty</h2>
          <p className="text-sm text-stone-800 max-w-sm leading-relaxed">
            In the <span className="font-semibold">Chat</span> tab, hover any chart or table and click{" "}
            <span className="inline-flex items-center gap-1 font-medium text-stone-800"><Pin size={11} /> Pin</span> to
            place it here, then drag and resize it freely.
          </p>
        </div>
      </div>
    );
  }

  const canvasH = Math.max(600, ...widgets.map((w) => w.y + w.h + 80));
  return (
    <div className="flex-1 overflow-auto p-6" style={{ background: G.page }}>
      {/* dot grid — signals a movable canvas and makes the snap-to-grid legible */}
      <div
        className="relative mx-auto"
        style={{
          minHeight: canvasH,
          maxWidth: 1400,
          backgroundImage: "radial-gradient(circle, rgba(41,37,36,0.12) 1px, transparent 1px)",
          backgroundSize: `${GRID}px ${GRID}px`,
        }}
      >
        {widgets.map((w) => (
          <DashWidget key={w.wid} widget={w} onChange={update} onRemove={() => remove(w.wid)} />
        ))}
      </div>
    </div>
  );
}

function ViewTab({ active, onClick, icon: Icon, label, badge }: { active: boolean; onClick: () => void; icon: typeof MessageSquare; label: string; badge?: number }) {
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

// ── main ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loaded, setLoaded] = useState<LoadedInfo | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus>("disconnected");
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<"chat" | "dashboard">("chat");
  // Start collapsed on narrow viewports so the chat/dashboard get full width.
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 1024
  );
  // Pinned dashboard widgets — session-only, deliberately NOT persisted. Each
  // widget is a snapshot of a dataset that is no longer loaded after a reload,
  // so a fresh page load starts with a clean board (matching the empty chat).
  const [widgets, setWidgets] = useState<Widget[]>([]);
  // Purge the board saved by earlier builds, so old pins don't linger in storage.
  useEffect(() => { localStorage.removeItem("sgrh-dashboard"); }, []);
  // Auto-collapse/expand the sidebar when the viewport crosses the lg breakpoint.
  // Only fires on crossings, so a manual toggle persists until the width changes.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setSidebarOpen(!mq.matches);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Pin a chat visual onto the dashboard canvas, stacked below existing widgets.
  const pinVisual = useCallback((v: Visual, title: string) => {
    setWidgets((prev) => {
      const y = prev.length ? Math.max(...prev.map((w) => w.y + w.h)) + GRID : GRID;
      const color = detectMetric(title).color;
      return [...prev, { wid: uid(), visualId: v.id, chartHtml: v.chart_html, title, color, x: GRID, y, ...defaultSize(v.id) }];
    });
  }, []);

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

  // Clearing chat and clearing the dashboard are independent — each only wipes
  // its own view, never the other.
  function clearChat() {
    if (messages.length && confirm("Clear the current conversation? Pinned dashboard charts are not affected.")) setMessages([]);
  }
  function clearDashboard() {
    if (widgets.length && confirm("Remove all charts from the dashboard? Your chat history is not affected.")) setWidgets([]);
  }

  const hasData = !!loaded;
  const canSend = online !== false;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", background: G.page }}>

      {/* header */}
      <header className="relative z-20 shrink-0 border-b border-stone-200 bg-white flex items-center justify-between px-6 h-16" style={{ boxShadow: "0 2px 8px -3px rgba(41,37,36,0.10)" }}>
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: G.brand }}>
            <FlaskConical size={16} className="text-white" />
          </div>
          <div>
            <span className="text-[17px] font-bold tracking-tight text-stone-900">SGRH Lab Assistant</span>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          <ViewTab active={view === "chat"} onClick={() => setView("chat")} icon={MessageSquare} label="Chat" />
          <ViewTab active={view === "dashboard"} onClick={() => setView("dashboard")} icon={LayoutDashboard} label="Dashboard" badge={widgets.length} />
        </div>

        <div className="flex items-center gap-3">
          {/* Single consolidated status — quiet when everything is fine, red only
              when the backend is down. Details live in the hover tooltip. */}
          {(() => {
            const offline = online === false;
            const dot = offline ? "#dc2626" : online === null ? "#a8a29e" : hasData ? "#059669" : "#a8a29e";
            const label =
              online === null ? "Checking…"
              : offline ? "Backend offline"
              : hasData ? `${loaded!.tables.length} ${loaded!.tables.length === 1 ? "table" : "tables"} · ${loaded!.rows.toLocaleString()} rows`
              : "Connected · no data loaded";
            const detail = [
              `AI backend: ${online === null ? "checking" : online ? "online" : "offline"}`,
              hasData ? `Source: ${loaded!.source === "db" ? "database" : "file upload"}` : "No dataset loaded",
              dbStatus === "connected" ? "Database: live" : null,
            ].filter(Boolean).join("\n");
            return (
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
            );
          })()}
        </div>
      </header>

      {/* body */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* sidebar — collapsible so the dashboard can use the full width. The
            outer wrapper animates its width so collapse/expand slides smoothly;
            the inner <aside> keeps a fixed width so its contents don't reflow
            mid-animation. */}
        <div
          className="relative z-10 shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
          style={{ width: sidebarOpen ? "18rem" : 0, background: G.panel, boxShadow: sidebarOpen ? "3px 0 12px -4px rgba(41,37,36,0.10)" : undefined }}
        >
        <aside className="relative w-72 h-full flex flex-col p-4 gap-5 overflow-y-auto border-r border-stone-200" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Hide sidebar"
            title="Hide sidebar"
            className="absolute top-2 right-2 z-10 w-8 h-8 rounded-lg flex items-center justify-center text-stone-800 hover:text-stone-900 hover:bg-stone-100 transition-colors"
          >
            <PanelLeftClose size={18} />
          </button>
          <div>
            <p className="text-xs font-bold text-stone-700 uppercase tracking-widest mb-3 px-1">Data Sources</p>
            <div className="space-y-3">
              <UploadPanel onLoaded={onLoaded} onCleared={onCleared} />
              <DbPanel onLoaded={onLoaded} onStatusChange={setDbStatus} />
            </div>
          </div>

          {hasData && (
            <div>
              <p className="text-xs font-bold text-stone-700 uppercase tracking-widest mb-3 px-1">Quick Queries</p>
              <div className="space-y-4">
                {QUERY_GROUPS.map((g) => (
                  <div key={g.label}>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-800 px-1 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: g.color }} />
                      {g.label}
                    </p>
                    <div className="space-y-0.5">
                      {g.queries.map((s) => (
                        <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                          className="w-full text-left pl-4 pr-2 py-2 rounded-lg text-xs text-stone-800 hover:text-stone-900 hover:bg-stone-50 transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto">
            <div className="rounded-2xl p-4 border border-stone-200" style={{ background: G.brandSoft }}>
              <p className="text-xs font-bold text-stone-800 mb-2.5">Session Info</p>
              <div className="space-y-1.5 text-xs text-stone-800/80 font-mono">
                <div className="flex justify-between"><span>Engine</span><span>Gemini · Vertex</span></div>
                <div className="flex justify-between"><span>Source</span><span>{loaded ? loaded.source : "none"}</span></div>
                <div className="flex justify-between"><span>Protocol</span><span>ISO-15189</span></div>
              </div>
            </div>
          </div>
        </aside>
        </div>

        {/* main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* section toolbar — gives the view-scoped Clear action a fixed home
              so it never overlaps the conversation or dashboard content. Each
              button only wipes its own section, never the other. The reopen-
              sidebar button also lives here (when collapsed) so it can't overlap
              the section label. */}
          <div className="shrink-0 h-11 border-b border-stone-200 bg-white flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Show sidebar"
                  title="Show sidebar"
                  className="-ml-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-stone-800 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                >
                  <PanelLeft size={16} />
                </button>
              )}
              <span className="text-[11px] font-bold uppercase tracking-widest text-stone-700">
                {view === "chat" ? "Conversation" : "Dashboard"}
              </span>
            </div>
            {view === "chat" ? (
              <button
                onClick={clearChat}
                disabled={!messages.length}
                title="Clear conversation"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-stone-800 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:hover:text-stone-800 disabled:hover:bg-transparent"
              >
                <Trash2 size={12} /> Clear chat
              </button>
            ) : (
              <button
                onClick={clearDashboard}
                disabled={!widgets.length}
                title="Clear dashboard"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-stone-800 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:hover:text-stone-800 disabled:hover:bg-transparent"
              >
                <Trash2 size={12} /> Clear dashboard
              </button>
            )}
          </div>
          {view === "dashboard" ? (
            <Dashboard widgets={widgets} setWidgets={setWidgets} />
          ) : (
          <>
          <div className="flex-1 overflow-y-auto flex flex-col px-8 py-8 space-y-6" style={{ scrollbarWidth: "none" }}>
            {messages.length === 0
              ? <EmptyState hasData={hasData} online={online} onPrompt={(q) => { if (hasData) submitQuery(q); else { setInput(q); inputRef.current?.focus(); } }} />
              : messages.map((msg) =>
                  msg.role === "user"
                    ? <UserMessage key={msg.id} msg={msg} />
                    : <AgentMessage key={msg.id} msg={msg} onPin={pinVisual} sourceNote={
                        loaded
                          ? `${loaded.source === "db" ? "database" : "file"} · ${loaded.tables.length} ${loaded.tables.length === 1 ? "table" : "tables"} · ${loaded.rows.toLocaleString()} rows`
                          : undefined
                      } />
                )
            }
            <div ref={bottomRef} />
          </div>

          {/* input bar */}
          <div className="relative z-10 shrink-0 border-t border-stone-200 bg-white px-6 py-4" style={{ boxShadow: "0 -3px 10px -4px rgba(41,37,36,0.07)" }}>
            {online === false && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 mb-3">
                <Server size={12} className="shrink-0 text-amber-500" />
                Backend offline. Run <span className="font-mono">python main.py</span> in the <span className="font-mono">server/</span> folder, then
                <button onClick={ping} className="underline font-semibold ml-1">retry</button>.
              </div>
            )}
            <div
              className="flex items-end gap-2 border rounded-2xl bg-white transition-all duration-200"
              style={{
                borderColor: canSend && input ? G.accent : "#e7e5e4",
                boxShadow: canSend && input
                  ? "0 0 0 3px rgba(15,118,110,0.12)"
                  : "0 1px 3px rgba(15,23,42,0.06)",
              }}
            >
              <textarea ref={inputRef} value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={!canSend || isLoading}
                placeholder={canSend ? "Ask anything about your lab data in plain English…" : "Start the backend to begin"}
                rows={1}
                className="flex-1 bg-transparent resize-none overflow-y-auto px-4 py-3.5 text-sm leading-5 text-stone-900 placeholder-stone-700 focus:outline-none max-h-40"
                style={{ scrollbarWidth: "none" }}
              />
              {/* pb-1.5 = (3rem input height − 2.25rem button) / 2 → button is
                  vertically centered on one line, bottom-anchored when multiline */}
              <div className="flex items-center px-2 pb-1.5">
                <button
                  onClick={() => submitQuery(input)}
                  disabled={!canSend || !input.trim() || isLoading}
                  aria-label={isLoading ? "Sending…" : "Send message"}
                  title="Send message"
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: G.accent }}
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>
            {canSend && (
              <div className="flex items-center justify-end gap-1.5 mt-1.5 px-1 text-[11px] text-stone-500">
                <kbd className="font-mono px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600">Enter</kbd>
                <span>to send</span>
                <span className="text-stone-300">·</span>
                <kbd className="font-mono px-1.5 py-0.5 rounded bg-stone-100 border border-stone-200 text-stone-600">Shift + Enter</kbd>
                <span>for new line</span>
              </div>
            )}
          </div>
          </>
          )}
        </main>
      </div>
    </div>
  );
}
