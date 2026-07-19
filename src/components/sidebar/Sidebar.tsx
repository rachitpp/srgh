import { PanelLeftClose } from "lucide-react";
import type { DbStatus, LoadedInfo } from "../../types";
import { G, QUERY_GROUPS } from "../../theme";
import { UploadPanel } from "./UploadPanel";
import { DbPanel } from "./DbPanel";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  loaded: LoadedInfo | null;
  onLoaded: (i: LoadedInfo) => void;
  onCleared: () => void;
  onDbStatusChange: (s: DbStatus) => void;
  onPickQuery: (q: string) => void;
}

export function Sidebar({
  open,
  onClose,
  loaded,
  onLoaded,
  onCleared,
  onDbStatusChange,
  onPickQuery,
}: SidebarProps) {
  const hasData = !!loaded;
  return (
    // Collapsible so the dashboard can use the full width. The outer wrapper
    // animates its width so collapse/expand slides smoothly; the inner <aside>
    // keeps a fixed width so its contents don't reflow mid-animation.
    <div
      className="relative z-10 shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
      style={{
        width: open ? "18rem" : 0,
        background: G.panel,
        boxShadow: open ? "3px 0 12px -4px rgba(41,37,36,0.10)" : undefined,
      }}
    >
      <aside
        className="relative w-72 h-full flex flex-col p-4 gap-5 overflow-y-auto border-r border-stone-200"
        style={{ scrollbarWidth: "none" }}
      >
        <button
          onClick={onClose}
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
            <DbPanel onLoaded={onLoaded} onStatusChange={onDbStatusChange} />
          </div>
        </div>

        {hasData && (
          <div>
            <p className="text-xs font-bold text-stone-700 uppercase tracking-widest mb-3 px-1">
              Quick Queries
            </p>
            <div className="space-y-4">
              {QUERY_GROUPS.map((g) => (
                <div key={g.label}>
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-800 px-1 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: g.color }} />
                    {g.label}
                  </p>
                  <div className="space-y-0.5">
                    {g.queries.map((s) => (
                      <button
                        key={s}
                        onClick={() => onPickQuery(s)}
                        className="w-full text-left pl-4 pr-2 py-2 rounded-lg text-xs text-stone-800 hover:text-stone-900 hover:bg-stone-50 transition-colors"
                      >
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
              <div className="flex justify-between">
                <span>Engine</span>
                <span>Gemini · Vertex</span>
              </div>
              <div className="flex justify-between">
                <span>Source</span>
                <span>{loaded ? loaded.source : "none"}</span>
              </div>
              <div className="flex justify-between">
                <span>Protocol</span>
                <span>ISO-15189</span>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
