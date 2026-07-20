import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/index.css";

// Last-resort boundary. The per-visual boundaries inside the chat and dashboard
// handle the common case; this one only catches a failure in the app shell, and
// exists so that even then the page explains itself instead of going blank.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary
    fallback={(error, reset) => (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-lg font-bold text-foreground">Something went wrong</h1>
        <p className="max-w-md font-mono text-xs break-words text-muted-foreground">{error.message}</p>
        <button
          onClick={reset}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Reload the interface
        </button>
      </div>
    )}
  >
    <App />
  </ErrorBoundary>,
);
