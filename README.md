# SN Discovery Explorer

A local web application for exploring and querying ServiceNow Discovery configuration — patterns, classifiers, stages, and the IRE (Identification & Reconciliation Engine). Includes an AI assistant that answers questions grounded exclusively in data synced from your own ServiceNow instance.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Getting Started](#getting-started)
4. [Syncing Data from a Live ServiceNow Instance](#syncing-data-from-a-live-servicenow-instance)
   - [Prerequisites](#prerequisites)
   - [Extract Patterns](#extract-patterns)
   - [Extract Classifiers](#extract-classifiers)
   - [Credentials via Environment Variables](#credentials-via-environment-variables)
   - [Sync Options Reference](#sync-options-reference)
5. [AI Assistant](#ai-assistant)
6. [Environment Variables](#environment-variables)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Python 3.11+, Flask 3, Flask-CORS |
| AI / LLM | OpenAI `gpt-4o-mini` (called directly from the browser) |
| RAG retrieval | `rank-bm25` (BM25Okapi), `sentence-transformers` (`all-MiniLM-L6-v2`) |
| ServiceNow sync | `requests` (REST API — no ServiceNow SDK required) |

---

## Project Structure

```
SN_Discovery_Explorer/
├── backend/
│   ├── app.py                        # Flask app entry point
│   ├── requirements.txt
│   ├── modules/
│   │   └── discovery/
│   │       ├── chat.py               # RAG retrieval pipeline
│   │       ├── routes.py             # REST API endpoints
│   │       └── data/                 # Bundled reference docs (stages, IRE)
│   └── scripts/
│       ├── extract_patterns.py       # Sync patterns from ServiceNow
│       ├── extract_classifiers.py    # Sync classifiers from ServiceNow
│       └── data/                     # Output directory for synced JSON files
│           ├── patterns_all.json
│           └── classifiers_all.json
├── frontend/
│   └── src/
│       ├── api/client.js
│       └── components/ChatPanel.jsx
├── docs/
│   └── rag_implementation.md         # Full RAG pipeline documentation
├── .env.example
└── README.md
```

---

## Getting Started

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py                   # runs on http://localhost:5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # runs on http://localhost:5173
```

---

## Syncing Data from a Live ServiceNow Instance

The AI assistant and the pattern/classifier browser are only as useful as the data behind them. The two scripts below connect to your ServiceNow instance via its REST API and pull all Discovery patterns and classifiers into local JSON files that the application reads at startup.

> **Note:** You need a ServiceNow user with read access to the following tables:
> `sa_pattern`, `sa_ci_to_pattern`, `sa_pattern_extension`, `sn_pattern_trigger_rule`,
> `discovery_classy`, `discovery_class_criteria`

### Prerequisites

Activate the backend virtual environment and make sure dependencies are installed:

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

---

### Extract Patterns

Pulls all Discovery patterns, shared libraries, extension sections, CI mappings, NDL steps, relations, and prepost scripts into a single self-contained JSON file.

**Basic usage (password prompted):**
```bash
python scripts/extract_patterns.py \
    --url  https://<instance>.service-now.com \
    --user <username>
```

**With password inline:**
```bash
python scripts/extract_patterns.py \
    --url      https://dev12345.service-now.com \
    --user     admin \
    --password yourpassword
```

**Active patterns only (skip inactive):**
```bash
python scripts/extract_patterns.py \
    --url         https://dev12345.service-now.com \
    --user        admin \
    --active-only
```

**Extract one or more specific patterns by sys_id (fast, useful for testing):**
```bash
python scripts/extract_patterns.py \
    --url            https://dev12345.service-now.com \
    --user           admin \
    --pattern-sys-id abc123def456,xyz789ghi012
```

**Custom output path:**
```bash
python scripts/extract_patterns.py \
    --url    https://dev12345.service-now.com \
    --user   admin \
    --output /path/to/my/patterns.json
```

Output is written to `backend/scripts/data/patterns_all.json` by default.

---

### Extract Classifiers

Pulls all Discovery classifiers and their classification criteria.

**Basic usage (password prompted):**
```bash
python scripts/extract_classifiers.py \
    --url  https://<instance>.service-now.com \
    --user <username>
```

**With password inline:**
```bash
python scripts/extract_classifiers.py \
    --url      https://dev12345.service-now.com \
    --user     admin \
    --password yourpassword
```

**Custom output path:**
```bash
python scripts/extract_classifiers.py \
    --url    https://dev12345.service-now.com \
    --user   admin \
    --output /path/to/my/classifiers.json
```

Output is written to `backend/scripts/data/classifiers_all.json` by default.

---

### Credentials via Environment Variables

To avoid typing credentials on every run, copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```ini
# .env
SN_INSTANCE=dev12345.service-now.com
SN_USER=admin
SN_PASSWORD=yourpassword
```

Then pass the password via the environment variable instead of the `--password` flag:

```bash
# extract_patterns.py reads $SNOW_PASSWORD automatically
SNOW_PASSWORD=yourpassword python scripts/extract_patterns.py \
    --url  https://dev12345.service-now.com \
    --user admin
```

> `.env` is gitignored — never commit real credentials.

---

### Sync Options Reference

#### `extract_patterns.py`

| Flag | Required | Default | Description |
|---|---|---|---|
| `--url` | Yes | — | ServiceNow instance URL (`https://dev12345.service-now.com`) |
| `--user` | Yes | — | ServiceNow username |
| `--password` | No | prompted / `$SNOW_PASSWORD` | Password |
| `--output` | No | `scripts/data/patterns_all.json` | Output file path |
| `--scope` | No | all scopes | Limit to a specific app scope (e.g. `sn_itom_pattern`) |
| `--active-only` | No | false | Skip inactive patterns |
| `--pattern-sys-id` | No | all patterns | Comma-separated sys_ids for targeted extraction |
| `--workers` | No | `6` | Parallel fetch threads |
| `-v` / `--verbose` | No | false | Debug logging |

#### `extract_classifiers.py`

| Flag | Required | Default | Description |
|---|---|---|---|
| `--url` | Yes | — | ServiceNow instance URL |
| `--user` | Yes | — | ServiceNow username |
| `--password` | No | prompted | Password |
| `--output` | No | `scripts/data/classifiers_all.json` | Output file path |
| `--debug` | No | false | Debug logging |

---

### After Syncing

Restart the Flask backend to reload the new data and rebuild the search indices:

```bash
# Ctrl+C to stop the running server, then:
python app.py
```

The application automatically picks up the new files on startup. The first load after a sync takes a few extra seconds as BM25 indices are rebuilt and pattern/classifier embeddings are recomputed.

---

## AI Assistant

The chat panel in the top-right corner provides a conversational interface over your synced data. It uses a local RAG (Retrieval-Augmented Generation) pipeline:

1. Your question is sent to the Flask backend, which retrieves the most relevant patterns and classifiers using hybrid BM25 + semantic search.
2. The retrieved context is injected into the system prompt.
3. The enriched prompt is sent to OpenAI directly from your browser using your own API key — the key is stored only in `sessionStorage` and never leaves the browser.

The assistant answers exclusively from your synced data and will tell you explicitly when information is not available rather than guessing. See [`docs/rag_implementation.md`](docs/rag_implementation.md) for full pipeline documentation.

**To use the assistant:** open the chat panel, enter your OpenAI API key when prompted, and start asking questions about your patterns, classifiers, stages, or IRE configuration.

---

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `OPENAI_API_KEY` | Flask backend (`stream_chat`) | Optional — only needed if using the server-side streaming endpoint |
| `SNOW_PASSWORD` | `extract_patterns.py` | ServiceNow password (alternative to `--password` flag) |
| `SN_INSTANCE` | `.env` reference | Your instance hostname |
| `SN_USER` | `.env` reference | Your ServiceNow username |
