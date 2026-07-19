// Shared domain types for the frontend. Kept free of React and of any
// backend-call code so every module can import from here without cycles.

export type MsgRole = "user" | "agent";
export type DbType = "mysql" | "postgres";
export type DbStatus = "disconnected" | "connecting" | "connected" | "error";

export interface Visual {
  id: string; // "card" | "bar" | "pie" | "line" | "table"
  chart_html: string;
}

export interface Message {
  id: string;
  role: MsgRole;
  text: string;
  visuals?: Visual[];
  error?: boolean;
  timestamp: Date;
  loading?: boolean;
}

export interface LoadedInfo {
  source: "file" | "db";
  tables: string[];
  rows: number;
}

// A visual pinned onto the free-form dashboard canvas. Position/size are stored
// in pixels (snapped to a grid) — moving/resizing a widget only changes layout,
// never the underlying chart data.
export interface Widget {
  wid: string;
  visualId: string; // "card" | "bar" | "pie" | "line" | "table"
  chartHtml: string;
  title: string;
  color: string; // metric-domain accent, shown as a dot in the widget header
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DbConfig {
  db_type: DbType;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

// ── backend response shapes ───────────────────────────────────────────────────
// Mirrors the return values in server/main.py. Note the backend signals most
// application failures with HTTP 200 and an `{ error }` body rather than a 4xx/5xx,
// so callers must check the body — a successful fetch does not mean success.

/** The wire form the DB endpoints expect: port widened to a number. */
export interface DbConnectPayload extends Omit<DbConfig, "port"> {
  port: number;
}

export interface ApiError {
  error: string;
}

export function isApiError(r: unknown): r is ApiError {
  return typeof r === "object" && r !== null && typeof (r as ApiError).error === "string";
}

export interface StatusResponse {
  server: string;
  active_source: "file" | "db" | null;
  tables_loaded: string[];
  table_count: number;
  active_table: string | null;
  df_loaded: boolean;
  df_rows: number;
  df_cols: string[];
}

/** Shared by /chat and /table — both answer with prose plus rendered visuals. */
export interface ChatResponse {
  text: string;
  visuals: Visual[];
}

export interface UploadSuccess {
  message: string;
  tables: string[];
  row_counts: Record<string, number>;
  total_rows: number;
  /** Back-compat fields describing the active/first table only. */
  row_count: number;
  columns: string[];
}
export type UploadResponse = UploadSuccess | ApiError;

export type DbConnectResponse = { success: true; tables: string[] } | { success: false; error: string };

export interface DbLoadSuccess {
  message: string;
  tables: string[];
  row_counts: Record<string, number>;
  skipped?: string[];
}
export type DbLoadResponse = DbLoadSuccess | ApiError;
