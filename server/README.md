# BioLab AI — Backend (FastAPI)

FastAPI service that powers the BioLab AI dashboard. It parses uploaded files / connects
to MySQL or PostgreSQL, keeps the loaded tables in memory, and answers questions two ways:

- **`/chat`** — Azure OpenAI returns a JSON insight + HTML visuals (KPI cards, Plotly bar/pie/line).
- **`/table`** — deterministic: returns the requested rows as an HTML table (full lists, exact — no LLM cap).

An **MCP server** (SSE) also runs on port **8001** exposing the same query/DB tools.

## 1. Prerequisites

- Python 3.10+
- An **Azure OpenAI** resource with a model deployment, plus its API key and endpoint.

## 2. Setup

```bash
cd server
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
```

```
AZURE_OPENAI_API_KEY=your-azure-key-here
AZURE_OPENAI_BASE_URL=https://sgrh2.openai.azure.com/openai/v1/
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
```

> **Base URL:** keep the trailing `/openai/v1/` — the stock `openai` client resolves
> endpoints relative to it, and dropping it yields 404s.
>
> **Deployment vs. model:** Azure routes by the *deployment* name you chose in the portal,
> which need not match the underlying model id. A **404 "deployment not found"** means this
> value is wrong.

## 3. Run

```bash
python main.py
# or:  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

- REST API → http://localhost:8000 (health check: `GET /status`)
- MCP SSE → http://localhost:8001/sse

## 4. Point the frontend at it

The React app defaults to `http://localhost:8000`. To override, create a `.env` in the
**project root** (not this folder):

```
VITE_API_BASE=http://localhost:8000
```

Then run the frontend from the project root: `npm run dev`.

## Endpoints used by the frontend

| Method | Path                  | Purpose                                 |
| ------ | --------------------- | --------------------------------------- |
| GET    | `/status`             | Health + what's loaded                  |
| POST   | `/upload`             | Upload CSV/XLSX (`file` form field)     |
| POST   | `/chat`               | NL question → `{text, visuals[]}` (LLM) |
| POST   | `/table`              | NL request → full rows as an HTML table |
| POST   | `/db/connect`         | Test connection + list tables           |
| POST   | `/db/load-all-tables` | Load every table into the session       |

## Changes vs. the original `main.py`

Only portability tweaks (behaviour is identical when no env vars are set):

1. The LLM backend is Azure OpenAI (stock `openai` client against Azure's OpenAI-compatible
   `/openai/v1/` surface) instead of Gemini on Vertex AI.
2. Key, base URL, and deployment name are read from environment variables.
3. Added optional `.env` loading via `python-dotenv`.
