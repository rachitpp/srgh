# BioLab AI — Backend (FastAPI)

FastAPI service that powers the BioLab AI dashboard. It parses uploaded files / connects
to MySQL or PostgreSQL, keeps the loaded tables in memory, and answers questions two ways:

- **`/chat`** — Gemini (via Vertex AI) returns a JSON insight + HTML visuals (KPI cards, Plotly bar/pie/line).
- **`/table`** — deterministic: returns the requested rows as an HTML table (full lists, exact — no LLM cap).

An **MCP server** (SSE) also runs on port **8001** exposing the same query/DB tools.

## 1. Prerequisites
- Python 3.10+
- A Google Cloud service-account JSON key with **Vertex AI** enabled.

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

Put your service-account key in this folder, then copy `.env.example` to `.env` and edit it:
```bash
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
```
```
GOOGLE_APPLICATION_CREDENTIALS=./your-key.json
GCP_PROJECT=your-project-id
GCP_LOCATION=global
GEMINI_MODEL=gemini-3.5-flash
```

> **Model note:** `GEMINI_MODEL` defaults to `gemini-3.5-flash` to match the original project.
> If a request fails with a **404 "model not found"**, set it to a valid id such as
> `gemini-2.5-flash` or `gemini-2.0-flash`.

## 3. Run
```bash
python main.py
# or:  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
- REST API → http://localhost:8000  (health check: `GET /status`)
- MCP SSE  → http://localhost:8001/sse

## 4. Point the frontend at it
The React app defaults to `http://localhost:8000`. To override, create a `.env` in the
**project root** (not this folder):
```
VITE_API_BASE=http://localhost:8000
```
Then run the frontend from the project root: `npm run dev`.

## Endpoints used by the frontend
| Method | Path | Purpose |
|---|---|---|
| GET  | `/status` | Health + what's loaded |
| POST | `/upload` | Upload CSV/XLSX (`file` form field) |
| POST | `/chat` | NL question → `{text, visuals[]}` (LLM) |
| POST | `/table` | NL request → full rows as an HTML table |
| POST | `/db/connect` | Test connection + list tables |
| POST | `/db/load-all-tables` | Load every table into the session |

## Changes vs. the original `main.py`
Only portability tweaks (behaviour is identical when no env vars are set):
1. Credentials path, `GCP_PROJECT`, `GCP_LOCATION`, and the model id are read from environment
   variables, defaulting to the original hard-coded values.
2. Added optional `.env` loading via `python-dotenv`.
3. Removed the unused, shadowed `import google.generativeai as genai` (the active SDK is
   `from google import genai`).
