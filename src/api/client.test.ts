import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpError,
  NetworkError,
  askChat,
  checkStatus,
  dbConnect,
  dbLoadAllTables,
  errorMessage,
  uploadFile,
} from "./client";

/** Replace global fetch for one spec. */
function mockFetch(impl: () => Promise<Response> | never) {
  vi.stubGlobal("fetch", vi.fn(impl));
}
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("transport vs application failure", () => {
  // This is the distinction the whole offline/online indicator rests on.
  // If these two collapse back into one error type, a backend that is UP but
  // returning 500 gets reported as "Backend offline" and sends the reader off
  // to restart a server that never stopped.

  it("throws NetworkError when the request never reaches a server", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(checkStatus()).rejects.toBeInstanceOf(NetworkError);
  });

  it("throws HttpError — NOT NetworkError — when the server answers 500", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ detail: "boom" }, 500)));
    const err = await checkStatus().catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).not.toBeInstanceOf(NetworkError);
    expect((err as HttpError).status).toBe(500);
  });

  it("preserves the status code so callers can report it", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({}, 422)));
    const err = (await askChat(new FormData()).catch((e) => e)) as HttpError;
    expect(err.status).toBe(422);
    expect(err.message).toContain("422");
  });
});

describe("error-in-body responses", () => {
  // The backend reports most application failures as HTTP 200 with an { error }
  // body, so a resolved promise does not mean the operation succeeded.

  it("resolves (does not throw) when the body carries an error at status 200", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ error: "Invalid format." })));
    await expect(uploadFile(new FormData())).resolves.toEqual({ error: "Invalid format." });
  });

  it("returns the failure shape for a rejected DB connection", async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ success: false, error: "auth failed" })));
    const res = await dbConnect({
      db_type: "mysql",
      host: "h",
      port: 3306,
      user: "u",
      password: "p",
      database: "d",
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("auth failed");
  });
});

describe("request shaping", () => {
  /** A fetch spy that keeps fetch's real signature, so mock.calls stays typed. */
  function spyFetch(body: unknown) {
    const spy = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(jsonResponse(body)));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("sends DB config as JSON with a content-type header", async () => {
    const spy = spyFetch({ success: true, tables: [] });
    await dbConnect({
      db_type: "postgres",
      host: "localhost",
      port: 5432,
      user: "u",
      password: "p",
      database: "db",
    });

    const [url, init] = spy.mock.calls[0];
    expect(url).toContain("/db/connect");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toMatchObject({ db_type: "postgres", port: 5432 });
  });

  it("defaults load-all-tables to a 500-row cap per table", async () => {
    const spy = spyFetch({ message: "", tables: [], row_counts: {} });
    await dbLoadAllTables({
      db_type: "mysql",
      host: "h",
      port: 3306,
      user: "u",
      password: "p",
      database: "d",
    });

    const [, init] = spy.mock.calls[0];
    expect(JSON.parse(init?.body as string).limit_per_table).toBe(500);
  });
});

describe("errorMessage", () => {
  it("unwraps an Error", () => expect(errorMessage(new Error("nope"))).toBe("nope"));
  it("stringifies a non-Error", () => expect(errorMessage("plain string")).toBe("plain string"));
});
