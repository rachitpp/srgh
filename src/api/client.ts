// The single place that knows the backend's address and how to talk to it.
// Every network call in the app goes through this module.

import type {
  ChatResponse,
  DbConnectPayload,
  DbConnectResponse,
  DbLoadResponse,
  StatusResponse,
  UploadResponse,
} from "../types";

// Override with VITE_API_BASE in a project-root .env if the server isn't on :8000.
export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

/**
 * The request never reached a server — DNS failure, connection refused, CORS
 * rejection, browser offline. This is the ONLY case that means "backend down".
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super(`Could not reach the backend at ${API_BASE}`, { cause });
    this.name = "NetworkError";
  }
}

/**
 * A server answered, but with a non-2xx status. The backend is up — the request
 * or its handling failed. Callers must NOT treat this as the backend being down.
 */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Server responded ${status}`);
    this.name = "HttpError";
  }
}

/**
 * fetch() rejects only on transport failure; a 500 resolves with ok === false.
 * Splitting those two outcomes here is what lets the UI tell "server is down"
 * apart from "server returned an error".
 */
async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, init);
  } catch (cause) {
    throw new NetworkError(cause);
  }
  if (!res.ok) throw new HttpError(res.status);
  return (await res.json()) as T;
}

const postForm = <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form });

const postJson = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// ── endpoints ─────────────────────────────────────────────────────────────────
// Named wrappers so no caller has to remember a path or guess a response shape.

/** Health probe used to drive the app's online/offline state. */
export const checkStatus = () => request<StatusResponse>("/status", { method: "GET" });

export const uploadFile = (form: FormData) => postForm<UploadResponse>("/upload", form);

/** Natural-language question → insight text plus rendered visuals (LLM-backed). */
export const askChat = (form: FormData) => postForm<ChatResponse>("/chat", form);

/** Deterministic full-row listing — no LLM, no row cap. */
export const askTable = (form: FormData) => postForm<ChatResponse>("/table", form);

export const dbConnect = (cfg: DbConnectPayload) => postJson<DbConnectResponse>("/db/connect", cfg);

export const dbLoadAllTables = (cfg: DbConnectPayload, limitPerTable = 500) =>
  postJson<DbLoadResponse>("/db/load-all-tables", { ...cfg, limit_per_table: limitPerTable });

/** Best-effort message for an unknown thrown value, for display in the UI. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
