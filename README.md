# SGRH Lab Assistant

Ask questions about laboratory data in plain English and get back insights, KPI cards,
charts, and tables — plus a drag-and-drop dashboard you can pin visuals onto.

Data comes from either an uploaded spreadsheet (`.csv` / `.xlsx` / `.xls`) or a live
MySQL / PostgreSQL connection.

## This project is two processes

**Both must be running.** Starting only the frontend gets you a UI that shows
"Backend offline" and answers nothing.

|              | Stack                           | Port | Start from   |
| ------------ | ------------------------------- | ---- | ------------ |
| **Frontend** | Vite 6 + React 18 + Tailwind v4 | 5173 | project root |
| **Backend**  | FastAPI + Gemini (Vertex AI)    | 8000 | `server/`    |

The backend also exposes an MCP server over SSE on port **8001**.

## Quick start

Two terminals.

**Terminal 1 — backend** (see [`server/README.md`](server/README.md) for full detail,
including the Google Cloud credentials it needs):

```bash
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1        # Windows PowerShell
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
python main.py
```

**Terminal 2 — frontend:**

```bash
npm install
npm run dev
```

Then open the URL Vite prints. It uses **5173** by default, but will pick the next free
port (5174, …) if something already holds it — so read the terminal rather than assuming.

Verify the backend independently at <http://localhost:8000/status>.

### Backend prerequisites

The backend needs Python 3.10+ **and a Google Cloud service-account key with Vertex AI
enabled** — it can't answer questions without one. `server/README.md` covers the setup and
the environment variables (`GCP_PROJECT`, `GEMINI_MODEL`, …).

## Scripts

| Command             | Does                                              |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Vite dev server with hot reload                   |
| `npm run build`     | Production build to `dist/`                       |
| `npm run typecheck` | Type-check without emitting (not part of `build`) |

## Project layout

```
srgh/
├── index.html                 # Vite entry point
├── vite.config.ts             # Vite + React + Tailwind plugins
├── tsconfig.json              # TypeScript config (covers src/ + vite.config.ts)
├── docs/
│   └── nlp-queries.md         # NLP query spec, per data sheet
├── src/
│   ├── main.tsx               # React root
│   ├── App.tsx                # layout + state orchestration (~200 lines)
│   ├── types.ts               # shared domain types — no React, no I/O
│   ├── theme.ts               # design tokens, metric colours, quick queries
│   ├── api/client.ts          # API_BASE + every backend call
│   ├── lib/utils.ts           # uid, fmt, isTableRequest, pinTitle
│   ├── components/
│   │   ├── Header.tsx         # brand, view tabs, consolidated status pill
│   │   ├── ViewTab.tsx
│   │   ├── HtmlVisual.tsx     # injects backend HTML + re-runs Plotly scripts
│   │   ├── chat/
│   │   │   ├── Composer.tsx   # the input bar
│   │   │   ├── AgentMessage.tsx
│   │   │   ├── UserMessage.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── CopyButton.tsx
│   │   │   └── TypingDots.tsx
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx  # the pin canvas
│   │   │   ├── DashWidget.tsx # drag + resize behaviour
│   │   │   └── constants.ts   # GRID, snap(), defaultSize()
│   │   └── sidebar/
│   │       ├── Sidebar.tsx
│   │       ├── UploadPanel.tsx
│   │       └── DbPanel.tsx
│   └── styles/
│       ├── index.css          # entry — imports fonts / tailwind / theme
│       ├── fonts.css
│       ├── tailwind.css
│       └── theme.css
└── server/
    ├── main.py                # FastAPI app + MCP server
    ├── requirements.txt
    └── README.md              # backend setup, endpoints, env vars
```

**Where to make a change:** the input bar is `components/chat/Composer.tsx`; an answer
card is `components/chat/AgentMessage.tsx`; colours are `theme.ts`; anything that talks
to the backend is `api/client.ts`.

## How the frontend talks to the backend

`App.tsx` posts to `API_BASE`, which defaults to `http://localhost:8000`. Override it by
creating a `.env` in the **project root** (not `server/`):

```
VITE_API_BASE=http://localhost:8000
```

Requests are routed by intent: phrasings like _"list all…"_ or _"show rows"_ go to
`/table` for exact, complete rows, while everything else goes to `/chat`, where Gemini
returns an insight plus Plotly visuals. The keyword list driving that split is
`TABLE_KEYWORDS` in `src/lib/utils.ts`, and it mirrors the backend's own list —
**changing one means changing the other.**

## Conventions

- **`src/App.tsx` owns state; components stay presentational.** Panels report upward
  through callbacks (`onLoaded`, `onDbStatusChange`) rather than reaching for globals.
- **No network calls outside `src/api/client.ts`.** If a component needs data, it takes
  a prop or calls a function from there.
- **Colours come from `theme.ts`,** not hard-coded hexes. `G` is the app palette;
  `METRIC_TAGS` maps an answer's domain to its accent so chat, sidebar, and dashboard
  stay colour-consistent.
- **Run `npm run typecheck` before committing** — it is not part of `npm run build`.

## Known rough edges

Honest notes for anyone picking this up:

- **Type-checking is not wired into the build.** `npm run build` does not run `tsc` —
  Vite strips types without verifying them. Run `npm run typecheck` yourself, or chain it
  (`"build": "tsc --noEmit && vite build"`) once you're confident it stays green.
- **`package.json` still carries dependencies nothing imports** — Radix (~30 packages),
  MUI, recharts, embla, react-slick, react-dnd. They came with the Figma Make scaffold
  whose components have since been deleted. Harmless at runtime (Vite tree-shakes), but
  they bloat `node_modules` and `npm audit`.
- **`server/README.md` references a `.env.example` that doesn't exist.** Create `.env`
  by hand using the keys listed in that README.
- **React and react-dom sit in `peerDependencies`, marked optional** — a library-shaped
  manifest for an app. It works because npm 7+ auto-installs peers, but a stricter
  install could skip them.
- The project was scaffolded from Figma Make; `vite.config.ts` still carries a
  `figmaAssetResolver` plugin that no longer resolves anything.
