import { useRef, useState } from "react";
import type React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { LoadedInfo } from "../../types";
import { isApiError } from "../../types";
import { G } from "../../theme";
import { NetworkError, errorMessage, uploadFile } from "../../api/client";

export function UploadPanel({
  onLoaded,
  onCleared,
}: {
  onLoaded: (i: LoadedInfo) => void;
  onCleared: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [rows, setRows] = useState(0);
  const [tableCount, setTableCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setFile(f);
    setColumns(null);
    setError(null);
    setShowPreview(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function parse() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await uploadFile(form);
      // The backend reports parse failures as HTTP 200 with an { error } body,
      // so a resolved request is not yet a successful upload.
      if (isApiError(data)) {
        setError(data.error);
        setLoading(false);
        return;
      }
      // Backend loads EVERY sheet as its own table; fall back to the single-table
      // shape for older backends / plain CSVs.
      const tables = data.tables ?? [file.name];
      const total = data.total_rows ?? data.row_count ?? 0;
      setColumns(data.columns ?? []);
      setRows(total);
      setTableCount(tables.length);
      setLoading(false);
      onLoaded({ source: "file", tables, rows: total });
    } catch (e) {
      setLoading(false);
      setError(
        e instanceof NetworkError
          ? "Upload failed — the backend isn't running."
          : `Upload failed — ${errorMessage(e)}`,
      );
    }
  }

  function clear() {
    setFile(null);
    setColumns(null);
    setError(null);
    setRows(0);
    setTableCount(0);
    setShowPreview(false);
    if (inputRef.current) inputRef.current.value = "";
    onCleared();
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 flex items-center gap-2.5 border-b border-stone-100">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: G.brandSoft }}
        >
          <FileSpreadsheet size={14} className="text-stone-800" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-stone-900">Upload Dataset</p>
          <p className="text-xs text-stone-700">.xlsx · .xls · .csv</p>
        </div>
        {columns && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
              Loaded
            </span>
            <button
              onClick={clear}
              aria-label="Remove dataset"
              title="Remove dataset"
              className="text-stone-700 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-3.5">
        {!file && !columns ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed rounded-xl px-4 py-4 flex flex-col items-center gap-2 cursor-pointer transition-all duration-200"
            style={{
              borderColor: dragging ? G.accent : "#d6d3d1",
              background: dragging ? "rgba(15,118,110,0.06)" : "rgba(15,23,42,0.02)",
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors"
              style={{ background: dragging ? G.accentSoft : G.brandSoft }}
            >
              <Upload
                size={17}
                className="text-stone-800"
                style={dragging ? { color: G.accent } : undefined}
              />
            </div>
            <div className="text-center">
              <p
                className="text-sm font-medium text-stone-800 transition-colors"
                style={dragging ? { color: G.accent } : undefined}
              >
                {dragging ? "Drop to upload" : "Drop your file here"}
              </p>
              <p className="text-xs text-stone-700 mt-0.5">or click to browse</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
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
            <button
              onClick={() => setShowPreview((s) => !s)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-stone-800 bg-stone-50 rounded-xl hover:bg-stone-100 transition-colors"
            >
              <span className="font-medium">Preview columns</span>
              <ChevronRight size={12} className={`transition-transform ${showPreview ? "rotate-90" : ""}`} />
            </button>
            {showPreview && (
              <div
                className="bg-stone-50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1"
                style={{ scrollbarWidth: "thin" }}
              >
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
              {!loading && (
                <button onClick={clear} className="text-stone-700 hover:text-stone-800">
                  <X size={13} />
                </button>
              )}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                <AlertCircle size={12} />
                {error}
              </div>
            )}
            {!loading ? (
              <button
                onClick={() => void parse()}
                className="w-full py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                style={{ background: G.accent }}
              >
                Upload & Load
              </button>
            ) : (
              <button
                disabled
                className="w-full py-2.5 text-sm font-semibold text-white rounded-xl opacity-60 flex items-center justify-center gap-2"
                style={{ background: G.accent }}
              >
                <Loader2 size={13} className="animate-spin" /> Uploading…
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
