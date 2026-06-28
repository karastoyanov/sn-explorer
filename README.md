# SN Discovery Explorer

A local web application for exploring and querying ServiceNow Discovery configuration — patterns, classifiers, stages, the IRE (Identification & Reconciliation Engine), Discovery Credentials, the MID Server, and CMDB class configuration. Includes an AI assistant that answers questions grounded exclusively in data synced from your own ServiceNow instance.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Getting Started](#getting-started)
4. [Syncing Data from a Live ServiceNow Instance](#syncing-data-from-a-live-servicenow-instance)
   - [Prerequisites](#prerequisites)
   - [Extract Patterns](#extract-patterns)
   - [Extract Classifiers](#extract-classifiers)
   - [Extract CMDB Classes](#extract-cmdb-classes)
   - [Credentials via Environment Variables](#credentials-via-environment-variables)
   - [Sync Options Reference](#sync-options-reference)
5. [Discovery Credentials](#discovery-credentials)
6. [MID Server](#mid-server)
7. [CMDB Explorer](#cmdb-explorer)
8. [AI Assistant](#ai-assistant)
9. [Environment Variables](#environment-variables)

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
│   │   ├── discovery/
│   │   │   ├── chat.py               # RAG retrieval pipeline
│   │   │   ├── routes.py             # REST API endpoints
│   │   │   └── data/                 # Bundled reference docs
│   │   │       ├── stages.json
│   │   │       ├── ire.json
│   │   │       ├── credentials.json  # Discovery credential types reference
│   │   │       └── mid_server.json   # MID Server reference
│   │   └── cmdb/
│   │       └── routes.py             # CMDB Explorer API endpoints
│   └── scripts/
│       ├── extract_patterns.py       # Sync patterns from ServiceNow
│       ├── extract_classifiers.py    # Sync classifiers from ServiceNow
│       ├── extract_cmdb_classes.py   # Sync CMDB classes, identifiers, relation types & recon defs
│       └── data/                     # Output directory for synced JSON files
│           ├── patterns_all.json
│           ├── classifiers_all.json
│           └── cmdb_classes.json
├── frontend/
│   └── src/
│       ├── api/client.js
│       ├── components/ChatPanel.jsx
│       ├── modules/discovery/pages/
│       │   ├── PatternsList.jsx
│       │   ├── PatternDetail.jsx
│       │   ├── ClassifiersList.jsx
│       │   ├── ClassifierDetail.jsx
│       │   ├── DiscoveryStages.jsx
│       │   ├── IREPage.jsx
│       │   ├── DiscoveryCredentials.jsx  # Credential types browser
│       │   └── MIDServerPage.jsx         # MID Server reference
│       └── modules/cmdb/pages/
│           └── CMDBClassManager.jsx      # CMDB Explorer (4 sub-tabs)
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
>
> *Patterns & Classifiers:* `sa_pattern`, `sa_ci_to_pattern`, `sa_pattern_extension`, `sn_pattern_trigger_rule`, `discovery_classy`, `discovery_class_criteria`
>
> *CMDB Explorer:* `sys_db_object`, `sys_dictionary`, `cmdb_class_info`, `cmdb_identifier`, `cmdb_identifier_entry`, `cmdb_rel_type`, `cmdb_reconciliation_definition`

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

### Extract CMDB Classes

Pulls CI class definitions, IRE identification rules, CMDB relation types, and reconciliation definitions into a single JSON file. The CMDB Explorer tab is only populated after this script has been run.

**Basic usage (password prompted):**
```bash
python scripts/extract_cmdb_classes.py \
    --url  https://<instance>.service-now.com \
    --user <username>
```

**With password inline:**
```bash
python scripts/extract_cmdb_classes.py \
    --url      https://dev12345.service-now.com \
    --user     admin \
    --password yourpassword
```

**Skip field definitions (faster, fieldCount will be 0):**
```bash
python scripts/extract_cmdb_classes.py \
    --url      https://dev12345.service-now.com \
    --user     admin \
    --no-fields
```

**Custom output path:**
```bash
python scripts/extract_cmdb_classes.py \
    --url    https://dev12345.service-now.com \
    --user   admin \
    --output /path/to/my/cmdb_classes.json
```

Output is written to `backend/scripts/data/cmdb_classes.json` by default.

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

#### `extract_cmdb_classes.py`

| Flag | Required | Default | Description |
|---|---|---|---|
| `--url` | Yes | — | ServiceNow instance URL (`https://dev12345.service-now.com`) |
| `--user` | Yes | — | ServiceNow username |
| `--password` | No | prompted / `$SNOW_PASSWORD` | Password |
| `--output` | No | `scripts/data/cmdb_classes.json` | Output file path |
| `--no-fields` | No | false | Skip `sys_dictionary` fetch — faster but `fieldCount` will be 0 for all classes |
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

## Discovery Credentials

The **Discovery Credentials** page is a built-in reference browser for every credential type that ServiceNow Discovery supports. No sync is required — the data is bundled with the application.

The page is organised as a grid of credential type cards. Clicking a card opens a detail panel that shows:

| Section | Content |
|---|---|
| Protocols & ports | Which protocols (WMI, SSH, SNMP, etc.) the credential type uses |
| Configuration fields | Every field the credential record exposes, with required/optional status and a description |
| Used for | Which Discovery activities rely on this credential type |
| CI table types | The CMDB tables that CIs discovered with this credential are written to |
| Required permissions | OS-level or device-level permissions the credential account must hold |
| Notes | Edge-cases, best practices, and common pitfalls |

The AI assistant also indexes credential data, so you can ask questions like *"What permissions does the Windows credential need?"* or *"Which credential type covers SNMP v3?"* and receive answers grounded in this reference.

---

## MID Server

The **MID Server** page is a tabbed, searchable reference covering everything you need to know about deploying and operating a MID Server. Like the Credentials page, it is bundled with the application and requires no sync.

Tabs available:

| Tab | What it covers |
|---|---|
| Overview | What the MID Server is, the ECC queue model, and key facts |
| Capabilities | Discovery, Orchestration, Service Mapping, Event Management, and other supported workloads |
| Requirements | Supported operating systems, hardware minimums (CPU, memory, disk), and Java runtime version |
| Network & Ports | Outbound-only connection model, ports to the ServiceNow instance, ports to discovery targets, and proxy support |
| Security | TLS communication, instance service account requirements, credential storage, OS service account best practices |
| Configuration | `config.xml` parameters with required/optional flags and defaults |
| MID States | All MID Server states (Running, Down, Upgrading, etc.) with colour-coded badges and descriptions |
| Clustering | MID Server affinity, pools, and high-availability behaviour |
| Lifecycle | Step-by-step installation, auto-upgrade process, and post-install validation checklist |
| Troubleshooting | Common symptoms, likely causes, and resolution steps |

The AI assistant also indexes MID Server reference data, so questions like *"How do I configure a MID Server pool?"* or *"What ports does the MID Server need open?"* are answered directly from this content.

---

## CMDB Explorer

The **CMDB Explorer** page gives you a searchable view of the CMDB metadata pulled from your ServiceNow instance. It requires running `extract_cmdb_classes.py` first — until then the page shows an empty state with a prompt to sync.

The page is organised into four tabs:

| Tab | Source table(s) | What it shows |
|---|---|---|
| **CI Classes** | `sys_db_object`, `sys_dictionary`, `cmdb_class_info` | Every `cmdb_ci_*` table: name, label, parent class, scope, field count, and flags (Principal, IRE-linked, Extendable) |
| **Identifiers** | `cmdb_identifier`, `cmdb_identifier_entry` | IRE identification rules with expandable entries showing criterion attributes, main attributes, priority order, and flags (Fallback, Null OK, Exact count) |
| **Relation Types** | `cmdb_rel_type` | The full relation type catalog with parent-to-child and child-to-parent descriptors |
| **Reconciliation** | `cmdb_reconciliation_definition` | Reconciliation rules per data source and CI class — attributes governed, null-update fields, priority, and active status |

Each tab has a live search bar that filters across the most relevant fields (name, label, `appliesTo`, data source, descriptors).

The AI assistant also indexes all four CMDB entity types, so questions like *"What identification rules apply to `cmdb_ci_linux_server`?"*, *"What relation types exist for network devices?"*, or *"Which reconciliation definitions have the highest priority?"* are answered directly from your synced data.

---

## AI Assistant

The chat panel in the top-right corner provides a conversational interface over your synced data. It uses a local RAG (Retrieval-Augmented Generation) pipeline:

1. Your question is sent to the Flask backend, which retrieves the most relevant content using hybrid BM25 + semantic search across patterns, classifiers, credential types, MID Server reference sections, and CMDB class data.
2. The retrieved context is injected into the system prompt.
3. The enriched prompt is sent to OpenAI directly from your browser using your own API key — the key is stored only in `sessionStorage` and never leaves the browser.

The assistant answers exclusively from your synced and bundled data and will tell you explicitly when information is not available rather than guessing. See [`docs/rag_implementation.md`](docs/rag_implementation.md) for full pipeline documentation.

**To use the assistant:** open the chat panel, enter your OpenAI API key when prompted, and start asking questions about your patterns, classifiers, stages, IRE configuration, credential types, MID Server, or CMDB classes.

---

## Environment Variables

| Variable | Used by | Description |
|---|---|---|
| `OPENAI_API_KEY` | Flask backend (`stream_chat`) | Optional — only needed if using the server-side streaming endpoint |
| `SNOW_PASSWORD` | `extract_patterns.py` | ServiceNow password (alternative to `--password` flag) |
| `SN_INSTANCE` | `.env` reference | Your instance hostname |
| `SN_USER` | `.env` reference | Your ServiceNow username |
