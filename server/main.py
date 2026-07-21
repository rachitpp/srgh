import pandas as pd
import json
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uuid
import re
import io
import mysql.connector
from mysql.connector import Error as MySQLError
import psycopg2
from psycopg2 import Error as PostgresError
from pydantic import BaseModel
from typing import Optional
from fastmcp import FastMCP
from openai import OpenAI
import os

# Load .env (optional) before reading any configuration.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Windows consoles default to a legacy codepage (cp1252), which cannot encode '₹'
# or any non-Latin-1 character. A debug print of a model response containing one
# then raises UnicodeEncodeError *inside* the request handler, turning a correct
# answer into an error response. Degrade unencodable characters instead of raising.
try:
    import sys
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

app = FastAPI()

# ── Configuration (env-driven) ───────────────────────────────────────────────
# Azure exposes an OpenAI-compatible "v1" surface; the base_url must keep its
# trailing /openai/v1/ for the stock client to resolve endpoints correctly.
AZURE_OPENAI_API_KEY = os.environ.get("AZURE_OPENAI_API_KEY", "")
AZURE_OPENAI_BASE_URL = os.environ.get(
    "AZURE_OPENAI_BASE_URL", "https://sgrh2.openai.azure.com/openai/v1/"
)
# Azure routes by *deployment* name, not by model id — this is the name given to
# the deployment in the Azure portal.
LLM_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5.6-sol")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Design tokens shared by every server-rendered visual (table, cards) ──────
# Keep frontend (App.js) and backend visually in sync — same hex values.
INK = "#292524"
SLATE_TEXT = "#33302D"
SLATE_BORDER = "#E7E3DD"
BG_TINT = "#F4F1EC"
SURFACE = "#FFFFFF"
TEAL = "#0A5F67"      # Service
ROSE = "#983B40"      # Cost
GREEN = "#1A7350"     # Revenue
AMBER = "#996A26"     # TAT
FONT_UI = "'IBM Plex Sans', system-ui, sans-serif"
FONT_MONO = "'IBM Plex Mono', ui-monospace, monospace"

# ── MCP Server — mounted at /mcp (SSE transport) ──────────────────────────────
mcp = FastMCP(
    name="DCM-Dashboard-MCP",
    instructions=(
        "Tools for querying and visualising laboratory performance data (Cost, Revenue, "
        "Service, TAT) loaded into the LAB AI-Dashboard, focused on Biochemistry Lab operations. "
        "Call load_all_mysql_tables or load_all_postgres_tables first, then use query_data or get_summary."
    ),
)

# ── Domain glossary — injected into every /chat prompt so the model reliably
# maps user questions to the right columns regardless of exact schema naming ──
LAB_DOMAIN_CONTEXT = """
DOMAIN CONTEXT — You are analyzing operational data for a BIOCHEMISTRY LAB (part of a
diagnostic/hospital lab). Interpret user questions using this glossary, mapping to
whatever actual column names exist in the dataset below:

- COST — reagent cost, test cost, cost per sample, consumable cost, overhead cost,
  vendor/supplier cost. Columns may be named like: cost, reagent_cost, test_cost,
  unit_cost, expense, cost_per_test.

- REVENUE — amount billed/charged to the patient or payer, net revenue, gross revenue,
  amount collected, insurance vs. cash revenue. Columns may be named like: revenue,
  amount, billed_amount, price, charges, net_amount, payment, collection.

- SERVICE — the test/panel/service performed (e.g. Liver Function Test, Lipid Profile,
  HbA1c, Renal Function Test), and its volume/utilization. Columns may be named like:
  test_name, service_name, panel, test_type, department, category.

- TAT (Turnaround Time) — the elapsed time from sample collection/receipt to result
  reporting/verification. It is NOT usually a single column — it must be COMPUTED as
  the difference between two timestamp columns for each row, then aggregated
  (mean/median/percentile) across rows. Look for timestamp columns such as:
  collected_at / collection_time / sample_collected, received_at / receipt_time,
  reported_at / result_time / report_time, verified_at / verification_time.
  - "Collection TAT" = reported/result time − collected/sample time.
  - "Lab TAT" or "processing TAT" = reported time − received time.
  - If the question just says "TAT" without specifying, use collection-to-report
    (the broadest, most common definition) unless only receipt-to-report timestamps
    are available.
  - Report TAT results in minutes if the average is under ~180 minutes, otherwise
    in hours, and say which unit you used.

- LAB SCOPE — This dashboard is scoped to the Biochemistry Lab. If the dataset has a
  department/lab_section/test_category/discipline-type column and it contains multiple
  labs, filter to rows matching "Biochemistry" (case-insensitive, partial match e.g.
  "Biochem") before computing any answer, UNLESS the user explicitly asks about another
  department. If no such column exists, assume the entire dataset already represents
  the Biochemistry Lab and use it as-is.
"""

@mcp.tool()
def get_summary() -> str:
    """Return row count, column names, and pre-computed stats for all currently loaded tables."""
    dfs = session_data.get("dfs") or {}
    if not dfs:
        df = session_data.get("df")
        if df is None or df.empty:
            return "No data loaded. Please load database tables or upload a file first."
        dfs = {session_data.get("active_source", "data"): df}

    lines = [
        f"Source: {session_data.get('active_source', 'unknown')}",
        f"Tables loaded: {len(dfs)}",
        "",
    ]
    for name, df in dfs.items():
        lines.append(f"══ TABLE: {name} ══  rows={len(df)}, columns={', '.join(df.columns.tolist())}")
        for col in df.select_dtypes(include="number").columns:
            lines.append(
                f"    {col}: sum={df[col].sum():.4f}, mean={df[col].mean():.4f}, "
                f"min={df[col].min():.4f}, max={df[col].max():.4f}"
            )
        for col in df.select_dtypes(exclude="number").columns:
            top = df[col].value_counts().head(5).to_dict()
            lines.append(f"    {col}: distinct={df[col].nunique()}, top={top}")
        lines.append("")
    return "\n".join(lines)


@mcp.tool()
def get_table_data(table: str = "", limit: int = 20) -> str:
    """Return the first N rows of a loaded table as CSV. If `table` is blank, uses the active table."""
    dfs = session_data.get("dfs") or {}
    if table and table in dfs:
        df = dfs[table]
    else:
        df = session_data.get("df")
    if df is None or df.empty:
        return "No data loaded."
    return df.head(max(1, min(limit, 500))).to_csv(index=False)


@mcp.tool()
def query_data(question: str) -> str:
    """
    Answer a natural-language question about the loaded lab data (one or more tables) using the configured LLM.
    Understands Cost, Revenue, Service, and TAT (Turnaround Time) terminology for a Biochemistry Lab.
    Returns a plain-text answer with exact numbers computed by Python where possible.
    """
    dfs = session_data.get("dfs") or {}
    context: str = session_data.get("csv_context", "")
    if not dfs or not context:
        return "No data loaded. Please load database tables first."

    prompt = f"""You are a precise data analyst working across multiple database tables.
{LAB_DOMAIN_CONTEXT}

PRE-COMPUTED EXACT STATS (computed over the FULL data — use these, never recalculate):
{session_data.get("sql_stats") or build_stats_block(dfs)}

SAMPLE ROWS (first rows of each table for schema reference — do NOT aggregate from these):
{context}

Question: {question}

Reply in plain text only. Use exact numbers from the pre-computed stats above. If the question
requires relating rows across tables, reason carefully using shared column values as keys.
"""
    return _complete(prompt).strip()


@mcp.tool()
def load_mysql_table(host: str, port: int, user: str, password: str,
                     database: str, table: str, limit: int = 500) -> str:
    """Load a single MySQL table into the session so other tools can query it."""
    try:
        conn = mysql.connector.connect(
            host=host, port=port, user=user,
            password=password, database=database,
            connect_timeout=10,
        )
        n = max(1, min(limit, 2000))
        df = coerce_numeric_columns(pd.read_sql(f"SELECT * FROM `{table}` LIMIT {n}", conn))
        stats = build_sql_stats_block("mysql", conn, {table: df})
        counts = sql_row_counts("mysql", conn, [table])
        conn.close()

        session_data["dfs"] = {table: df}
        session_data["df"] = df
        session_data["active_table_name"] = table
        session_data["csv_context"] = build_combined_context({table: df})
        session_data["active_source"] = "db"
        session_data["sql_stats"] = stats
        session_data["row_counts"] = counts
        return (
            f"Loaded `{table}` — {counts.get(table, len(df))} rows, "
            f"columns: {', '.join(df.columns.tolist())}"
        )
    except MySQLError as e:
        return f"Error: {str(e)}"


@mcp.tool()
def list_mysql_tables(host: str, port: int, user: str,
                      password: str, database: str) -> str:
    """Connect to a MySQL database and list all available tables."""
    try:
        conn = mysql.connector.connect(
            host=host, port=port, user=user,
            password=password, database=database,
            connect_timeout=10,
        )
        cur = conn.cursor()
        cur.execute("SHOW TABLES")
        tables = [r[0] for r in cur.fetchall()]
        cur.close()
        conn.close()
        return f"Tables in `{database}`: {', '.join(tables)}"
    except MySQLError as e:
        return f"Error: {str(e)}"


@mcp.tool()
def load_postgres_table(host: str, port: int, user: str, password: str,
                        database: str, table: str, limit: int = 500) -> str:
    """Load a single PostgreSQL table into the session so other tools can query it.
    `table` may be plain (e.g. 'orders') or schema-qualified (e.g. 'public.orders')."""
    try:
        conn = psycopg2.connect(
            host=host, port=port, user=user,
            password=password, dbname=database,
            connect_timeout=10,
        )
        n = max(1, min(limit, 2000))
        table_ident = quote_identifier("postgres", table)
        df = coerce_numeric_columns(pd.read_sql(f'SELECT * FROM {table_ident} LIMIT {n}', conn))
        stats = build_sql_stats_block("postgres", conn, {table: df})
        counts = sql_row_counts("postgres", conn, [table])
        conn.close()

        session_data["dfs"] = {table: df}
        session_data["df"] = df
        session_data["active_table_name"] = table
        session_data["csv_context"] = build_combined_context({table: df})
        session_data["active_source"] = "db"
        session_data["sql_stats"] = stats
        session_data["row_counts"] = counts
        return (
            f"Loaded `{table}` — {counts.get(table, len(df))} rows, "
            f"columns: {', '.join(df.columns.tolist())}"
        )
    except PostgresError as e:
        return f"Error: {str(e)}"


@mcp.tool()
def list_postgres_tables(host: str, port: int, user: str,
                         password: str, database: str) -> str:
    """Connect to a PostgreSQL database and list all available tables across all schemas."""
    try:
        conn = psycopg2.connect(
            host=host, port=port, user=user,
            password=password, dbname=database,
            connect_timeout=10,
        )
        cur = conn.cursor()
        cur.execute("""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name
        """)
        tables = [f"{schema}.{name}" for schema, name in cur.fetchall()]
        cur.close()
        conn.close()
        return f"Tables in `{database}`: {', '.join(tables)}"
    except PostgresError as e:
        return f"Error: {str(e)}"


@mcp.tool()
def load_all_mysql_tables(host: str, port: int, user: str, password: str,
                          database: str, limit_per_table: int = 500) -> str:
    """Connect to MySQL and load every table in the database into the session at once."""
    try:
        conn = mysql.connector.connect(
            host=host, port=port, user=user,
            password=password, database=database,
            connect_timeout=10,
        )
        cur = conn.cursor()
        tables = list_tables("mysql", cur)
        cur.close()
        if not tables:
            conn.close()
            return "No tables found in database."

        limit = max(1, min(limit_per_table, 2000))
        dfs = {}
        for t in tables:
            ident = quote_identifier("mysql", t)
            try:
                dfs[t] = coerce_numeric_columns(pd.read_sql(f"SELECT * FROM {ident} LIMIT {limit}", conn))
            except Exception as e:
                print(f"Skipping {t}: {e}")
                reset_transaction(conn)
                continue

        if not dfs:
            conn.close()
            return "Found tables but failed to load any of them."

        stats = build_sql_stats_block("mysql", conn, dfs)
        counts = sql_row_counts("mysql", conn, list(dfs.keys()))
        conn.close()

        session_data["dfs"] = dfs
        session_data["df"] = next(iter(dfs.values()))
        session_data["active_table_name"] = next(iter(dfs.keys()))
        session_data["csv_context"] = build_combined_context(dfs)
        session_data["active_source"] = "db"
        session_data["sql_stats"] = stats
        session_data["row_counts"] = counts
        return f"Loaded {len(dfs)} tables: {', '.join(dfs.keys())}"
    except MySQLError as e:
        return f"Error: {str(e)}"


@mcp.tool()
def load_all_postgres_tables(host: str, port: int, user: str, password: str,
                             database: str, limit_per_table: int = 500) -> str:
    """Connect to PostgreSQL and load every table (across all schemas) into the session at once."""
    try:
        conn = psycopg2.connect(
            host=host, port=port, user=user,
            password=password, dbname=database,
            connect_timeout=10,
        )
        cur = conn.cursor()
        tables = list_tables("postgres", cur)
        cur.close()
        if not tables:
            conn.close()
            return "No tables found in database."

        limit = max(1, min(limit_per_table, 2000))
        dfs = {}
        for t in tables:
            ident = quote_identifier("postgres", t)
            try:
                dfs[t] = coerce_numeric_columns(pd.read_sql(f"SELECT * FROM {ident} LIMIT {limit}", conn))
            except Exception as e:
                print(f"Skipping {t}: {e}")
                reset_transaction(conn)
                continue

        if not dfs:
            conn.close()
            return "Found tables but failed to load any of them."

        stats = build_sql_stats_block("postgres", conn, dfs)
        counts = sql_row_counts("postgres", conn, list(dfs.keys()))
        conn.close()

        session_data["dfs"] = dfs
        session_data["df"] = next(iter(dfs.values()))
        session_data["active_table_name"] = next(iter(dfs.keys()))
        session_data["csv_context"] = build_combined_context(dfs)
        session_data["active_source"] = "db"
        session_data["sql_stats"] = stats
        session_data["row_counts"] = counts
        return f"Loaded {len(dfs)} tables: {', '.join(dfs.keys())}"
    except PostgresError as e:
        return f"Error: {str(e)}"


# ── Run MCP server in a background thread on port 8001 ───────────────────────
# Works with all fastmcp versions — no ASGI mount needed.
import threading

def _run_mcp():
    mcp.run(transport="sse", host="0.0.0.0", port=8001)

mcp_thread = threading.Thread(target=_run_mcp, daemon=True)
mcp_thread.start()
# MCP SSE endpoint: http://localhost:8001/sse
client = OpenAI(
    api_key=AZURE_OPENAI_API_KEY,
    base_url=AZURE_OPENAI_BASE_URL,
)


def _complete(prompt: str) -> str:
    """Single-shot prompt → text, and the only place that knows the LLM vendor.

    Both callers want the same thing (one prompt in, plain text out), so the
    provider details stay here: swapping vendors again means editing this
    function, not the analysis code that calls it.

    Note: the Vertex implementation this replaces pinned temperature=0 for
    determinism. Azure's reasoning deployments reject the parameter outright,
    so exactness now rests on the prompts feeding pre-computed stats and
    forbidding recalculation (see build_stats_block).
    """
    response = client.responses.create(model=LLM_DEPLOYMENT, input=prompt)
    return response.output_text

# Session stores DataFrames so table rendering never needs to re-parse CSV.
# "dfs": every loaded table, keyed by (schema-qualified) name → DataFrame
# "df": the currently "active" table (used by /table endpoint default & legacy tools)
# "csv_context": combined, tagged CSV text across all loaded tables, fed to the model
session_data: dict = {
    "df": None,
    "dfs": {},
    "csv_context": "",
    "active_source": None,
    "active_table_name": None,
    # Exact aggregates computed by the DB over full tables. Empty for uploads,
    # where the in-memory DataFrame *is* the full dataset and pandas suffices.
    "sql_stats": "",
    # True COUNT(*) per table — the sampled DataFrame's len() is not the row count.
    "row_counts": {},
}


class DBConfig(BaseModel):
    db_type: str = "mysql"  # "mysql" or "postgres"
    host: str
    port: int = 3306
    user: str
    password: str
    database: str

class DBQuery(BaseModel):
    db_type: str = "mysql"  # "mysql" or "postgres"
    host: str
    port: int = 3306
    user: str
    password: str
    database: str
    table: str
    limit: Optional[int] = 500

class DBLoadAll(BaseModel):
    db_type: str = "mysql"  # "mysql" or "postgres"
    host: str
    port: int = 3306
    user: str
    password: str
    database: str
    limit_per_table: Optional[int] = 500


def get_mysql_connection(host, port, user, password, database):
    return mysql.connector.connect(
        host=host, port=port, user=user,
        password=password, database=database,
        connect_timeout=10,
    )


def get_postgres_connection(host, port, user, password, database):
    return psycopg2.connect(
        host=host, port=port, user=user,
        password=password, dbname=database,
        connect_timeout=10,
    )


def get_db_connection(db_type, host, port, user, password, database):
    """Unified connector — dispatches to MySQL or Postgres based on db_type."""
    if db_type == "postgres":
        return get_postgres_connection(host, port, user, password, database)
    return get_mysql_connection(host, port, user, password, database)


def list_tables(db_type, cursor):
    """Runs the correct 'list tables' query for the given db_type."""
    if db_type == "postgres":
        cursor.execute("""
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name
        """)
        return [f"{schema}.{name}" for schema, name in cursor.fetchall()]
    else:
        cursor.execute("SHOW TABLES")
        return [row[0] for row in cursor.fetchall()]


def quote_identifier(db_type, name):
    """Quotes a table/column name the correct way per dialect.
    Handles schema-qualified names like 'public.orders' for postgres."""
    if db_type == "postgres":
        parts = name.split(".")
        return ".".join(f'"{p}"' for p in parts)
    return f'`{name}`'


def coerce_numeric_columns(df: pd.DataFrame, threshold: float = 0.8) -> pd.DataFrame:
    """Repair columns polluted with placeholder strings like '(null)': if ≥80% of a
    text column's non-null values parse as numbers, convert it to numeric (the
    placeholders become NaN). Without this an entire amount column is treated as
    text and silently excluded from every sum/mean/group-by."""
    for col in df.columns:
        if df[col].dtype == object:
            converted = pd.to_numeric(df[col], errors="coerce")
            non_null = df[col].notna().sum()
            if non_null and converted.notna().sum() / non_null >= threshold:
                df[col] = converted
    return df


def build_stats_block(dfs: dict, max_groups: int = 12, max_cat_cols: int = 5) -> str:
    """Exact aggregates computed in Python over the FULL data (not the sampled CSV),
    injected into prompts so the LLM reports deterministic numbers instead of
    estimating from sample rows. Includes per-column totals AND group-by sums for
    low-cardinality categorical columns — these cover 'X by category' questions."""
    lines = []
    for name, df in dfs.items():
        lines.append(f"TABLE {name} — ROWS: {len(df)}")
        num_cols = list(df.select_dtypes(include="number").columns)
        for col in num_cols:
            lines.append(
                f"  {name}.{col}: SUM={df[col].sum():.4f}, MEAN={df[col].mean():.4f}, "
                f"MIN={df[col].min():.4f}, MAX={df[col].max():.4f}"
            )
        # Categorical columns worth grouping by: few distinct values, not IDs.
        cat_cols = sorted(
            (c for c in df.select_dtypes(exclude="number").columns
             if 1 < df[c].nunique() <= 30),
            key=lambda c: df[c].nunique(),
        )[:max_cat_cols]
        for cat in cat_cols:
            vc = df[cat].value_counts().head(max_groups)
            lines.append(f"  {name}: ROW COUNT BY {cat} (top {len(vc)}): {vc.to_dict()}")
            for ncol in num_cols:
                try:
                    g = df.groupby(cat)[ncol].sum().sort_values(ascending=False).head(max_groups)
                    pairs = ", ".join(f"{k}={v:.2f}" for k, v in g.items())
                    lines.append(f"  {name}: SUM OF {ncol} BY {cat}: {pairs}")
                except Exception:
                    continue
    return "\n".join(lines)


def quote_column(db_type, name):
    """Quotes a bare column name per dialect. Doubles any embedded quote char so
    a column like `it"s` can't terminate the identifier early."""
    if db_type == "postgres":
        return '"' + name.replace('"', '""') + '"'
    return "`" + name.replace("`", "``") + "`"


# Numeric columns whose name marks them as keys/identifiers. Summing DIM_Patient or
# OrderItem_RowId produces a large, authoritative-looking, meaningless number — and
# every such column also multiplies the size of the group-by section of the prompt.
_ID_COLUMN_RE = re.compile(
    r"(^|_)(id|ids|uid|guid|rowid|row_id|code|codes|key|keys|ref|no|num|number|"
    r"episode|dim|counter|flag|year|month|day)($|_)",
    re.IGNORECASE,
)


def is_identifier_column(name: str) -> bool:
    """True when a numeric column is an identifier rather than a measure."""
    return bool(_ID_COLUMN_RE.search(str(name)))


def reset_transaction(conn):
    """Clear a failed transaction so the connection stays usable.

    Postgres aborts the whole transaction on any error and then rejects every
    later statement with 'current transaction is aborted'. Loading a database
    that contains even one unreadable table (a `cron.*` catalog, a view the role
    can't select) would otherwise poison every aggregate that follows it — and
    silently, since each one fails inside its own except-branch."""
    try:
        conn.rollback()
    except Exception:
        pass


def sql_row_counts(db_type, conn, tables: list) -> dict:
    """True COUNT(*) per table, so the UI reports the dataset size rather than the
    size of the sample that was pulled into memory."""
    counts = {}
    for t in tables:
        cur = conn.cursor()
        try:
            cur.execute(f"SELECT COUNT(*) FROM {quote_identifier(db_type, t)}")
            counts[t] = int(cur.fetchone()[0])
        except Exception:
            counts[t] = 0
            reset_transaction(conn)
        finally:
            cur.close()
    return counts


def build_sql_stats_block(db_type, conn, dfs: dict, max_groups: int = 12,
                          max_cat_cols: int = 5, max_distinct: int = 30) -> str:
    """The SQL counterpart to build_stats_block: identical output format, but every
    aggregate is computed by the database over the ENTIRE table rather than over the
    sampled DataFrame held in memory.

    This exists because the sample is a `LIMIT n` slice with no ORDER BY — an
    arbitrary, and in practice strongly biased, subset. Aggregating it produced
    confidently-stated answers that were simply wrong (a revenue split came out
    61/39 on the first 500 rows and 38/62 over the full 20k).

    Column *roles* are still inferred from the sample (dtype after
    coerce_numeric_columns), which avoids mapping every dialect's type names; only
    the numbers come from SQL. Cardinality is re-checked in SQL because a sample
    routinely understates it.
    """
    lines = []
    for name, sample in dfs.items():
        ident = quote_identifier(db_type, name)
        cur = conn.cursor()
        try:
            cur.execute(f"SELECT COUNT(*) FROM {ident}")
            total_rows = int(cur.fetchone()[0])
            lines.append(f"TABLE {name} — ROWS: {total_rows}")
            if total_rows == 0:
                continue

            num_cols = [c for c in sample.select_dtypes(include="number").columns
                        if not is_identifier_column(c)]
            txt_cols = list(sample.select_dtypes(exclude="number").columns)

            # ── Per-column totals: one round trip for every numeric column ──
            if num_cols:
                sel = ", ".join(
                    f"SUM({quote_column(db_type, c)}), AVG({quote_column(db_type, c)}), "
                    f"MIN({quote_column(db_type, c)}), MAX({quote_column(db_type, c)})"
                    for c in num_cols
                )
                cur.execute(f"SELECT {sel} FROM {ident}")
                row = cur.fetchone()
                for i, c in enumerate(num_cols):
                    s, a, mn, mx = row[i * 4:i * 4 + 4]
                    if s is None:
                        continue  # column is entirely NULL
                    lines.append(
                        f"  {name}.{c}: SUM={float(s):.4f}, MEAN={float(a):.4f}, "
                        f"MIN={float(mn):.4f}, MAX={float(mx):.4f}"
                    )

            # ── Pick group-by columns by true distinct count, cheapest first ──
            # Prefilter on the sample: a column with more than max_distinct values
            # in a subset necessarily has more in the whole table, so discarding it
            # here can't lose a real candidate — and it keeps a 103-column table
            # from costing 103 COUNT(DISTINCT) scans of a million rows.
            txt_cols = [c for c in txt_cols
                        if 1 < sample[c].nunique(dropna=True) <= max_distinct]
            cardinality = []
            if txt_cols:
                # All cardinalities in ONE query: k separate COUNT(DISTINCT)
                # statements would each scan the table independently.
                sel = ", ".join(f"COUNT(DISTINCT {quote_column(db_type, c)})" for c in txt_cols)
                try:
                    cur.execute(f"SELECT {sel} FROM {ident}")
                    row = cur.fetchone()
                    cardinality = [(int(n), c) for c, n in zip(txt_cols, row)
                                   if n is not None and 1 < int(n) <= max_distinct]
                except Exception as e:
                    print(f"Cardinality probe failed on {name}: {e}")
                    reset_transaction(conn)
            cat_cols = [c for _, c in sorted(cardinality)[:max_cat_cols]]

            # ── Every breakdown in a single pass. GROUPING SETS computes all the
            # category group-bys in one scan; without it each category costs its
            # own full scan of the table. MySQL has no GROUPING SETS, so it keeps
            # the one-query-per-category form. Groups are capped at max_distinct,
            # so returning them unlimited and trimming in Python is bounded. ──
            sums = "".join(f", SUM({quote_column(db_type, c)})" for c in num_cols)
            grouped: dict = {}
            if cat_cols and db_type == "postgres":
                qcats = [quote_column(db_type, c) for c in cat_cols]
                flags = ", ".join(f"GROUPING({q})" for q in qcats)
                sets = ", ".join(f"({q})" for q in qcats)
                cur.execute(
                    f"SELECT {', '.join(qcats)}, {flags}, COUNT(*){sums} "
                    f"FROM {ident} GROUP BY GROUPING SETS ({sets})"
                )
                k = len(cat_cols)
                for r in cur.fetchall():
                    # Exactly one GROUPING flag is 0 per row: that's the active column.
                    active = next((i for i in range(k) if r[k + i] == 0), None)
                    if active is None:
                        continue
                    grouped.setdefault(cat_cols[active], []).append(
                        (r[active],) + tuple(r[2 * k:])
                    )
            else:
                for cat in cat_cols:
                    qcat = quote_column(db_type, cat)
                    cur.execute(
                        f"SELECT {qcat}, COUNT(*){sums} FROM {ident} "
                        f"GROUP BY {qcat} ORDER BY COUNT(*) DESC LIMIT {max_groups}"
                    )
                    grouped[cat] = list(cur.fetchall())

            for cat in cat_cols:
                rows = grouped.get(cat) or []
                if not rows:
                    continue
                rows.sort(key=lambda r: int(r[1]), reverse=True)
                rows = rows[:max_groups]
                counts = {r[0]: int(r[1]) for r in rows}
                lines.append(f"  {name}: ROW COUNT BY {cat} (top {len(counts)}): {counts}")
                for i, ncol in enumerate(num_cols):
                    pairs = [(r[0], r[2 + i]) for r in rows if r[2 + i] is not None]
                    if not pairs:
                        continue
                    pairs.sort(key=lambda kv: float(kv[1]), reverse=True)
                    joined = ", ".join(f"{k}={float(v):.2f}" for k, v in pairs)
                    lines.append(f"  {name}: SUM OF {ncol} BY {cat}: {joined}")
        except Exception as e:
            # A single unreadable table must not sink the whole load; the caller
            # falls back to the in-memory block for anything missing here.
            print(f"SQL stats unavailable for {name}: {e}")
            reset_transaction(conn)
        finally:
            cur.close()
    return "\n".join(lines)


def build_combined_context(dfs: dict, max_rows_per_table: int = 200) -> str:
    """Builds one CSV-like text blob covering every loaded table, each tagged
    with a '### TABLE: name' header so the model can tell them apart."""
    parts = []
    for name, df in dfs.items():
        parts.append(f"### TABLE: {name}\n{df.head(max_rows_per_table).to_csv(index=False)}")
    return "\n\n".join(parts)


def find_requested_table(msg: str, dfs: dict):
    """Looks for a table name mentioned in the user's message (matches either
    the full 'schema.table' form or just the bare table part)."""
    if not dfs:
        return None
    m = msg.lower()
    for name in dfs.keys():
        simple = name.split(".")[-1].lower()
        if name.lower() in m or simple in m:
            return name, dfs[name]
    return None


# ── HTML table builder — clinical/instrument styling: ink header, monospace
# numeric columns, hairline borders instead of heavy fills ────────────────────
def build_table_html(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    numeric_cols = set(df.select_dtypes(include="number").columns)

    # Numeric columns are right-aligned so digits line up by place value — the
    # standard convention for professional data tables.
    header_cells = "".join(
        f'<th style="padding:10px 14px;text-align:{"right" if col in numeric_cols else "left"};white-space:nowrap;'
        f'font-family:{FONT_UI};font-size:11px;font-weight:600;letter-spacing:0.06em;'
        f'text-transform:uppercase;color:#ffffff;border-right:1px solid rgba(255,255,255,0.12);">{col}</th>'
        for col in cols
    )
    header = (
        f'<thead><tr style="background:{INK};position:sticky;top:0;z-index:1;">'
        f'{header_cells}</tr></thead>'
    )
    body_rows = []
    for i, (_, row) in enumerate(df.iterrows()):
        bg = SURFACE if i % 2 == 0 else BG_TINT
        cells = "".join(
            f'<td style="padding:8px 14px;border-right:2px solid {SLATE_BORDER};'
            f'border-bottom:2px solid {SLATE_BORDER};white-space:nowrap;'
            f'text-align:{"right" if col in numeric_cols else "left"};'
            f'font-family:{FONT_MONO if col in numeric_cols else FONT_UI};'
            f'font-size:12.5px;color:{INK if col in numeric_cols else SLATE_TEXT};">'
            f'{str(row[col]) if pd.notna(row[col]) else ""}</td>'
            for col in cols
        )
        body_rows.append(f'<tr style="background:{bg};">{cells}</tr>')
    body = f'<tbody>{"".join(body_rows)}</tbody>'
    table = (
        f'<table style="border-collapse:collapse;width:max-content;min-width:100%;">'
        f'{header}{body}</table>'
    )
    return (
        f'<div style="width:100%;height:100%;overflow:auto;box-sizing:border-box;">'
        f'{table}</div>'
    )


# ── Table intent detection ─────────────────────────────────────────────────────
TABLE_KEYWORDS = [
    "record", "records", "row", "rows", "tabular",
    "table format", "in table", "as table",
    "show me", "show all", "show data", "display data",
    "list all", "list data", "list record",
    "get me", "give me", "fetch", "retrieve",
    "top ", "first ", "last ", "sample",
]

def is_table_request(msg: str) -> bool:
    m = msg.lower()
    return any(kw in m for kw in TABLE_KEYWORDS)

def extract_row_limit(msg: str) -> Optional[int]:
    """Returns None for 'all rows', otherwise parses the number or defaults to 10."""
    if "all" in msg.lower():
        return None
    match = re.search(r'\b(\d+)\b', msg)
    return int(match.group(1)) if match else 10


# ── Debug endpoint — call /status to verify server version & session ──────────
@app.get("/status")
async def status():
    dfs = session_data.get("dfs") or {}
    df = session_data.get("df")
    return {
        "server": "v8-professional-ui",
        "active_source": session_data.get("active_source"),
        "tables_loaded": list(dfs.keys()),
        "table_count": len(dfs),
        "active_table": session_data.get("active_table_name"),
        "df_loaded": df is not None and not df.empty,
        "df_rows": len(df) if df is not None else 0,
        "df_cols": list(df.columns) if df is not None else [],
    }


# ── /db/tables — debug endpoint to inspect raw schema.table list ─────────────
@app.post("/db/tables")
async def db_tables_debug(config: DBConfig):
    """Returns the raw list of schema-qualified tables for troubleshooting."""
    try:
        conn = get_db_connection(
            config.db_type, config.host, config.port,
            config.user, config.password, config.database
        )
        cursor = conn.cursor()
        tables = list_tables(config.db_type, cursor)
        cursor.close()
        conn.close()
        return {"success": True, "db_type": config.db_type, "tables": tables, "count": len(tables)}
    except (MySQLError, PostgresError) as e:
        return {"success": False, "error": str(e)}


# ── /table — dedicated endpoint called by frontend for ALL table requests ────
@app.post("/table")
async def table_endpoint(message: str = Form(...)):
    dfs = session_data.get("dfs") or {}
    df = session_data.get("df")

    if not dfs and (df is None or (hasattr(df, "empty") and df.empty)):
        return {"text": "No data loaded. Please load a table or upload a file first.", "visuals": []}

    active_name = session_data.get("active_table_name")
    if dfs:
        match = find_requested_table(message, dfs)
        if match:
            active_name, df = match
        else:
            df = df if df is not None else next(iter(dfs.values()))
            active_name = active_name or next(iter(dfs.keys()))

    n = extract_row_limit(message)
    df_slice = df if n is None else df.head(n)
    table_html = build_table_html(df_slice)
    label = f"all {len(df_slice)}" if n is None else f"top {len(df_slice)}"
    table_note = f" from `{active_name}`" if active_name else ""
    return {
        "text": f"Showing {label} rows x {len(df_slice.columns)} columns{table_note}.",
        "visuals": [{"id": "table", "chart_html": table_html}],
    }


@app.post("/db/connect")
async def db_connect(config: DBConfig):
    try:
        conn = get_db_connection(
            config.db_type, config.host, config.port,
            config.user, config.password, config.database
        )
        cursor = conn.cursor()
        tables = list_tables(config.db_type, cursor)
        cursor.close()
        conn.close()
        return {"success": True, "tables": tables}
    except (MySQLError, PostgresError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {str(e)}"}


@app.post("/db/load-table")
async def db_load_table(query: DBQuery):
    """Loads a single named table (kept for backward compatibility / MCP use)."""
    try:
        conn = get_db_connection(
            query.db_type, query.host, query.port,
            query.user, query.password, query.database
        )
        limit = max(1, min(query.limit or 500, 2000))
        table_ident = quote_identifier(query.db_type, query.table)
        df = coerce_numeric_columns(pd.read_sql(f"SELECT * FROM {table_ident} LIMIT {limit}", conn))
        sql_stats = build_sql_stats_block(query.db_type, conn, {query.table: df})
        row_counts = sql_row_counts(query.db_type, conn, [query.table])
        conn.close()

        session_data["dfs"] = {query.table: df}
        session_data["df"] = df
        session_data["active_table_name"] = query.table
        session_data["csv_context"] = build_combined_context({query.table: df})
        session_data["active_source"] = "db"
        session_data["sql_stats"] = sql_stats
        session_data["row_counts"] = row_counts
        return {
            "message": f"Loaded {row_counts.get(query.table, len(df))} rows from `{query.table}`",
            "columns": list(df.columns),
            "row_count": row_counts.get(query.table, len(df)),
        }
    except (MySQLError, PostgresError) as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"Unexpected error loading table: {str(e)}"}


@app.post("/db/load-all-tables")
async def db_load_all_tables(query: DBLoadAll):
    """Loads EVERY table found in the database into the session at once."""
    try:
        conn = get_db_connection(
            query.db_type, query.host, query.port,
            query.user, query.password, query.database
        )
        cursor = conn.cursor()
        tables = list_tables(query.db_type, cursor)
        cursor.close()

        if not tables:
            conn.close()
            return {"error": "No tables found in this database."}

        limit = max(1, min(query.limit_per_table or 500, 2000))
        dfs = {}
        failed = []
        for t in tables:
            ident = quote_identifier(query.db_type, t)
            try:
                dfs[t] = coerce_numeric_columns(pd.read_sql(f"SELECT * FROM {ident} LIMIT {limit}", conn))
            except Exception as e:
                failed.append(t)
                print(f"Skipping {t}: {e}")
                reset_transaction(conn)
                continue

        if not dfs:
            conn.close()
            return {"error": "Found tables but failed to load any of them."}

        # Aggregate in SQL before dropping the connection: the DataFrames above are
        # only a LIMITed sample, so any total derived from them would be wrong.
        sql_stats = build_sql_stats_block(query.db_type, conn, dfs)
        row_counts = sql_row_counts(query.db_type, conn, list(dfs.keys()))
        conn.close()

        session_data["dfs"] = dfs
        session_data["df"] = next(iter(dfs.values()))
        session_data["active_table_name"] = next(iter(dfs.keys()))
        session_data["csv_context"] = build_combined_context(dfs)
        session_data["active_source"] = "db"
        session_data["sql_stats"] = sql_stats
        session_data["row_counts"] = row_counts

        return {
            "message": f"Loaded {len(dfs)} tables ({sum(row_counts.values())} total rows).",
            "tables": list(dfs.keys()),
            "row_counts": row_counts,
            "skipped": failed,
        }
    except (MySQLError, PostgresError) as e:
        return {"error": str(e)}
    except Exception as e:
        return {"error": f"Unexpected error loading tables: {str(e)}"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Load an uploaded CSV/Excel file into the session.

    - CSV   → one table, keyed by the file name.
    - Excel → EVERY sheet becomes its own table, keyed by the sheet name, so a
      multi-sheet workbook is loaded in full (mirrors /db/load-all-tables) rather
      than just the first sheet.

    All rows are kept — no row cap — so /table and the computed stats reflect the
    complete dataset. The model prompt is sampled separately inside
    build_combined_context (max_rows_per_table), so full-fidelity storage here does
    not bloat the LLM context.
    """
    filename = (file.filename or "").lower()
    contents = await file.read()
    if not contents:
        return {"error": "Uploaded file is empty."}
    try:
        if filename.endswith(".csv"):
            raw = {file.filename: pd.read_csv(io.BytesIO(contents))}
        elif filename.endswith((".xlsx", ".xls")):
            # sheet_name=None → dict of {sheet_name: DataFrame} for ALL sheets.
            raw = pd.read_excel(io.BytesIO(contents), sheet_name=None)
        else:
            return {"error": "Invalid format. Please upload CSV or Excel."}
    except Exception as e:
        return {"error": f"Could not parse file: {str(e)}"}

    # Drop empty sheets/tables so downstream tools never see a 0-row frame,
    # and repair number columns polluted with '(null)'-style placeholders.
    dfs = {name: coerce_numeric_columns(df) for name, df in raw.items() if df is not None and not df.empty}
    if not dfs:
        return {"error": "No non-empty sheets or rows found in the file."}

    session_data["dfs"] = dfs
    session_data["df"] = next(iter(dfs.values()))
    session_data["active_table_name"] = next(iter(dfs.keys()))
    session_data["csv_context"] = build_combined_context(dfs)
    session_data["active_source"] = "file"

    row_counts = {name: int(len(df)) for name, df in dfs.items()}
    # An upload holds every row in memory, so pandas is already exact — and any
    # SQL stats left over from a previous DB session describe different data.
    session_data["sql_stats"] = ""
    session_data["row_counts"] = row_counts
    active_df = session_data["df"]
    return {
        "message": "Success",
        "tables": list(dfs.keys()),
        "row_counts": row_counts,
        "total_rows": int(sum(row_counts.values())),
        # Backward-compatible fields (describe the active/first table):
        "row_count": int(len(active_df)),
        "columns": list(active_df.columns),
    }


@app.post("/chat")
async def chat(message: str = Form(...)):
    dfs = session_data.get("dfs") or {}
    df: Optional[pd.DataFrame] = session_data.get("df")
    context: str = session_data.get("csv_context", "")
    source_label = (
        f"database ({len(dfs)} table{'s' if len(dfs) != 1 else ''})"
        if session_data["active_source"] == "db"
        else "uploaded CSV/Excel file"
    )

    if df is None or df.empty or not context:
        return {"text": "Please upload a file or load a database table first.", "visuals": []}

    # SQL stats cover the full table; the pandas block only covers what's in memory,
    # so it is the fallback for uploads (where those are the same thing).
    stats_block = session_data.get("sql_stats") or build_stats_block(
        dfs if dfs else {session_data.get("active_table_name") or "data": df}
    )

    prompt = f"""
You are an expert Laboratory Performance Analyst and Power BI Copilot, specializing in
Biochemistry Lab operations. The user has loaded data from a {source_label}.
{LAB_DOMAIN_CONTEXT}

PRE-COMPUTED EXACT AGGREGATES — computed in Python over the FULL dataset. These are the
ONLY authoritative numbers. Whenever a question can be answered from these (totals, means,
counts, and any "X by category" breakdown), you MUST use these exact values — never
recalculate, never estimate:
{stats_block}

SAMPLE ROWS — each table is marked with a "### TABLE: name" header followed by CSV data.
NOTE: this is only the FIRST rows of each table for schema/format reference. Do NOT compute
aggregates from these rows; use the PRE-COMPUTED EXACT AGGREGATES above instead:
{context}

User Question: {message}

STRICT RULES — violating any rule will break the UI:

1. Return ONLY a valid JSON object. No markdown, no code fences, no explanation outside JSON.
2. Format: {{"text":"one concise insight sentence","visuals":[{{"id":"card|bar|pie|line","chart_html":"..."}}]}}
3. "visuals" MUST NOT be empty. Always produce at least one visual.

DATA ACCURACY RULES:
4. Compute all values directly from the dataset above — never guess or hallucinate numbers.
5. For card KPIs: SUM, COUNT, AVERAGE, or DISTINCT COUNT exactly from the data.
6. For bar/pie/line: use actual column values as labels/categories and computed aggregates as values.
7. Use ONLY columns that exist in the tables above — never invent column or table names.
8. For monetary values (Cost, Revenue): format as currency (e.g. $1,234.56). For percentages: round to 1 decimal.
9. Sort bar charts by value descending. Limit bar/pie to top 10 categories max.
10. If the question involves relating data across tables, use shared column values as join keys and reason carefully.
11. For TAT questions, compute per-row time differences from the relevant timestamp columns
    (see DOMAIN CONTEXT above), then aggregate (mean/median as appropriate). State the unit used
    (minutes or hours) in the "text" field.
12. If a department/lab-section-type column exists and the data spans multiple labs, filter to
    Biochemistry-related rows only, per the DOMAIN CONTEXT scope rule above.

VISUAL SELECTION:
13. card  → single KPI (total, count, average, distinct count) — e.g. Total Revenue, Avg TAT, Total Cost
14. bar   → comparisons, rankings — ALWAYS horizontal (orientation:"h"), sorted descending
15. pie   → part-of-whole proportions (use only when ≤7 slices)
16. line  → trends over time (x-axis must be a date/time column)

DESIGN SYSTEM — use EXACTLY these values, this is a clinical/precision-instrument visual style:
  Ink (headings/values): {INK}    Secondary text: {SLATE_TEXT}    Border: {SLATE_BORDER}
  Teal (Service/primary): {TEAL}    Rose (Cost): {ROSE}    Green (Revenue): {GREEN}    Amber (TAT): {AMBER}
  UI font: {FONT_UI}    Numeric/data font: {FONT_MONO}

CHART HTML RULES:
17. FOR card, use EXACTLY this pattern (swap Label/Value only — do NOT add a border,
    a background colour, or an accent stripe: the surrounding insight card already
    carries the metric colour, and a second rule inside it reads as a broken border.
    The var(--…) colours are deliberate — they let the KPI follow the app's light/dark
    theme instead of being pinned to one palette. Emit them literally):
    <div style="display:flex;flex-direction:column;justify-content:center;height:100%;padding:16px;background:transparent;box-sizing:border-box;"><p style="font-family:{FONT_UI};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted-foreground);margin:0 0 8px 0;font-weight:600;">Label</p><h2 style="font-family:{FONT_MONO};font-size:32px;color:var(--foreground);margin:0;font-weight:600;">Value</h2></div>

18. FOR bar/pie/line use EXACTLY this pattern (replace UID with 8 random alphanumeric chars):
    <div id="chart_UID" style="width:100%;height:100%;"></div><script>var data=[...];var layout={{title:"",autosize:true,font:{{color:"{INK}",size:11,family:"{FONT_UI}"}},paper_bgcolor:"{SURFACE}",plot_bgcolor:"{SURFACE}",margin:{{t:40,b:70,l:110,r:20,pad:10}},xaxis:{{automargin:true}},yaxis:{{automargin:true}},legend:{{orientation:"h",y:-0.25}}}};Plotly.newPlot("chart_UID",data,layout,{{responsive:true,displayModeBar:false}});</script>
    (margin.pad keeps a clear gap between axis labels and the bars; automargin prevents long
    category labels from being clipped. For pie charts omit the xaxis/yaxis keys AND use
    symmetric margins {{t:40,b:60,l:20,r:20,pad:0}} — the l:110 above exists to fit bar-chart
    category labels, and on a pie it just shoves the circle off-centre.)

19. Plotly.newPlot first argument MUST be the string id "chart_UID" — never a variable.
20. Each visual must have a unique UID — never reuse the same id.
21. Do NOT add any HTML outside the div+script pair for charts.
22. For bar charts set marker.color to the accent color matching the metric (Cost={ROSE}, Revenue={GREEN},
    Service/other={TEAL}, TAT={AMBER}). ALSO make each bar's value readable at a glance: set
    text to the formatted values (currency/number, matching the "text" rules above), textposition:"outside",
    cliponaxis:false, and textfont:{{family:"{FONT_MONO}",size:11,color:"{INK}"}}. Because the labels sit
    outside the bars, for bar charts ONLY override the right margin to margin.r:70 so the labels are not clipped.
    ALSO set bargap:0.45 on the layout for bar charts: at the default gap the bars nearly touch and
    the chart reads as a solid block rather than as separate measurements.
    For pie charts use hole:0.35, textinfo:"percent",
    textposition:"inside", insidetextorientation:"horizontal", automargin:true, and
    marker.colors:["{TEAL}","{INK}","{AMBER}","{ROSE}","{GREEN}","#5F708A","{SLATE_TEXT}"].
    Category names belong in the legend ONLY — never as outside labels with connector lines.
    Also add uniformtext:{{minsize:10,mode:"hide"}} to the pie layout so text that cannot fit
    inside a small slice is hidden instead of overflowing the chart area.
"""
    try:
        raw = _complete(prompt)
        print(raw)
        clean = re.sub(r'```json\s?|\s?```', '', raw).strip()
        s, e = clean.find('{'), clean.rfind('}')
        if s != -1 and e != -1:
            clean = clean[s:e+1]
        data = json.loads(clean)

        for vis in data.get("visuals", []):
            uid = uuid.uuid4().hex[:8]
            if "chart_html" in vis:
                vis["chart_html"] = re.sub(
                    r'id=["\'][\w_-]+["\']', f'id="chart_{uid}"', vis["chart_html"]
                )
                vis["chart_html"] = re.sub(
                    r'(?<=newPlot\()["\'][\w_-]+["\']', f'"chart_{uid}"', vis["chart_html"]
                )

        if not data.get("visuals"):
            data["visuals"] = [{"id": "card", "chart_html":
                f'<div style="display:flex;align-items:center;justify-content:center;'
                f'height:100%;padding:20px;text-align:center;font-family:{FONT_UI};">'
                f'<p style="font-size:14px;color:{SLATE_TEXT};">{data.get("text","")}</p></div>'
            }]
        return data

    except Exception as e:
        return {"text": f"Error: {str(e)}", "visuals": []}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
