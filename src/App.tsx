import { useCallback, useEffect, useRef, useState } from "react";
import { PanelLeft, Trash2 } from "lucide-react";

import type { DbStatus, LoadedInfo, Message, Visual, Widget } from "./types";
import { detectMetric } from "./theme";
import { NetworkError, askChat, askTable, checkStatus, errorMessage } from "./api/client";
import { isTableRequest, uid } from "./lib/utils";

import { Header } from "./components/Header";
import { Sidebar } from "./components/sidebar/Sidebar";
import { AgentMessage } from "./components/chat/AgentMessage";
import { UserMessage } from "./components/chat/UserMessage";
import { EmptyState } from "./components/chat/EmptyState";
import { Composer } from "./components/chat/Composer";
import { Dashboard } from "./components/dashboard/Dashboard";
import { GRID, defaultSize } from "./components/dashboard/constants";

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
    typeof window === "undefined" ? true : window.innerWidth >= 1024,
  );
  // Pinned dashboard widgets — session-only, deliberately NOT persisted. Each
  // widget is a snapshot of a dataset that is no longer loaded after a reload,
  // so a fresh page load starts with a clean board (matching the empty chat).
  const [widgets, setWidgets] = useState<Widget[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Purge the board saved by earlier builds, so old pins don't linger in storage.
  useEffect(() => {
    localStorage.removeItem("sgrh-dashboard");
  }, []);

  // Auto-collapse/expand the sidebar when the viewport crosses the lg breakpoint.
  // Only fires on crossings, so a manual toggle persists until the width changes.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => setSidebarOpen(!mq.matches);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Ping the backend on mount (and expose a re-check).
  const ping = useCallback(() => {
    checkStatus()
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);
  useEffect(() => {
    ping();
  }, [ping]);

  // Pin a chat visual onto the dashboard canvas, stacked below existing widgets.
  const pinVisual = useCallback((v: Visual, title: string) => {
    setWidgets((prev) => {
      const y = prev.length ? Math.max(...prev.map((w) => w.y + w.h)) + GRID : GRID;
      const color = detectMetric(title).color;
      return [
        ...prev,
        {
          wid: uid(),
          visualId: v.id,
          chartHtml: v.chart_html,
          title,
          color,
          x: GRID,
          y,
          ...defaultSize(v.id),
        },
      ];
    });
  }, []);

  const submitQuery = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || isLoading) return;
      setInput("");
      setIsLoading(true);

      const userMsg: Message = { id: uid(), role: "user", text: q, timestamp: new Date() };
      const placeholder: Message = {
        id: uid(),
        role: "agent",
        text: "",
        timestamp: new Date(),
        loading: true,
      };
      setMessages((m) => [...m, userMsg, placeholder]);

      try {
        const form = new FormData();
        form.append("message", q);
        const data = await (isTableRequest(q) ? askTable(form) : askChat(form));
        setOnline(true);
        setMessages((m) => [
          ...m.slice(0, -1),
          {
            id: uid(),
            role: "agent",
            text: data.text ?? "",
            visuals: data.visuals ?? [],
            timestamp: new Date(),
          },
        ]);
      } catch (err) {
        // Only a transport failure means the backend is down. A 500 means it IS
        // running and something went wrong inside it — reporting that as "offline"
        // would send the reader off to restart a server that never stopped.
        const unreachable = err instanceof NetworkError;
        if (unreachable) setOnline(false);
        setMessages((m) => [
          ...m.slice(0, -1),
          {
            id: uid(),
            role: "agent",
            error: true,
            text: unreachable
              ? `Couldn't reach the AI backend.\nStart it with "python main.py" in the server/ folder, then try again.`
              : `The backend is running but failed to answer.\n${errorMessage(err)}\nCheck the server console for the traceback.`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading],
  );

  // Drop a query into the composer and focus it, rather than sending straight
  // away — lets the person edit the suggestion before running it.
  function stageQuery(q: string) {
    setInput(q);
    inputRef.current?.focus();
  }

  // Clearing chat and clearing the dashboard are independent — each only wipes
  // its own view, never the other.
  function clearChat() {
    if (
      messages.length &&
      confirm("Clear the current conversation? Pinned dashboard charts are not affected.")
    )
      setMessages([]);
  }
  function clearDashboard() {
    if (widgets.length && confirm("Remove all charts from the dashboard? Your chat history is not affected."))
      setWidgets([]);
  }

  const hasData = !!loaded;
  const sourceNote = loaded
    ? `${loaded.source === "db" ? "database" : "file"} · ${loaded.tables.length} ${loaded.tables.length === 1 ? "table" : "tables"} · ${loaded.rows.toLocaleString()} rows`
    : undefined;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <Header
        view={view}
        onViewChange={setView}
        widgetCount={widgets.length}
        online={online}
        loaded={loaded}
        dbStatus={dbStatus}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          loaded={loaded}
          onLoaded={setLoaded}
          onCleared={() => setLoaded(null)}
          onDbStatusChange={setDbStatus}
          onPickQuery={stageQuery}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          {/* section toolbar — gives the view-scoped Clear action a fixed home
              so it never overlaps the conversation or dashboard content. Each
              button only wipes its own section, never the other. The reopen-
              sidebar button also lives here (when collapsed) so it can't overlap
              the section label. */}
          <div className="shrink-0 h-11 border-b border-border bg-card flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Show sidebar"
                  title="Show sidebar"
                  className="-ml-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <PanelLeft size={16} />
                </button>
              )}
              <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                {view === "chat" ? "Conversation" : "Dashboard"}
              </span>
            </div>
            <button
              onClick={view === "chat" ? clearChat : clearDashboard}
              disabled={view === "chat" ? !messages.length : !widgets.length}
              title={view === "chat" ? "Clear conversation" : "Clear dashboard"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-2xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
            >
              <Trash2 size={12} /> {view === "chat" ? "Clear chat" : "Clear dashboard"}
            </button>
          </div>

          {view === "dashboard" ? (
            <Dashboard widgets={widgets} setWidgets={setWidgets} />
          ) : (
            <>
              <div
                className="flex-1 overflow-y-auto flex flex-col px-8 py-8 space-y-6"
                style={{ scrollbarWidth: "none" }}
              >
                {messages.length === 0 ? (
                  <EmptyState
                    hasData={hasData}
                    online={online}
                    onPrompt={(q) => {
                      if (hasData) void submitQuery(q);
                      else stageQuery(q);
                    }}
                  />
                ) : (
                  messages.map((msg) =>
                    msg.role === "user" ? (
                      <UserMessage key={msg.id} msg={msg} />
                    ) : (
                      <AgentMessage key={msg.id} msg={msg} onPin={pinVisual} sourceNote={sourceNote} />
                    ),
                  )
                )}
                <div ref={bottomRef} />
              </div>

              <Composer
                value={input}
                onChange={setInput}
                onSubmit={(q) => void submitQuery(q)}
                inputRef={inputRef}
                isLoading={isLoading}
                online={online}
                onRetry={ping}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
