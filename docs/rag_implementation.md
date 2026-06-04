# RAG Simulation — Implementation Documentation

## Table of Contents

- [RAG Simulation — Implementation Documentation](#rag-simulation--implementation-documentation)
  - [Table of Contents](#table-of-contents)
  - [1. What is RAG and Why "Simulation"?](#1-what-is-rag-and-why-simulation)
  - [2. Architecture Overview](#2-architecture-overview)
  - [3. Knowledge Base — Local JSON Files](#3-knowledge-base--local-json-files)
    - [Extracted files (from a live ServiceNow instance)](#extracted-files-from-a-live-servicenow-instance)
    - [Bundled reference files](#bundled-reference-files)
  - [4. Search Pipeline](#4-search-pipeline)
    - [Document text representation](#document-text-representation)
    - [Tier 1 — BM25 (Term-based)](#tier-1--bm25-term-based)
    - [Tier 2 — Semantic Search (Embeddings)](#tier-2--semantic-search-embeddings)
    - [Tier 3 — Hybrid Search with RRF](#tier-3--hybrid-search-with-rrf)
    - [Tier 4 — Context Formatting](#tier-4--context-formatting)
  - [5. Conversation-Aware Retrieval](#5-conversation-aware-retrieval)
  - [6. Conditional Context Injection](#6-conditional-context-injection)
  - [7. End-to-End Request Flow](#7-end-to-end-request-flow)
  - [8. API Contract](#8-api-contract)
    - [`POST /api/discovery/chat/context`](#post-apidiscoverychatcontext)
  - [9. Libraries and Models](#9-libraries-and-models)
    - [`all-MiniLM-L6-v2` model](#all-minilm-l6-v2-model)
  - [10. Graceful Degradation](#10-graceful-degradation)
  - [11. Key Files Reference](#11-key-files-reference)
    - [Data loading priority](#data-loading-priority)
  - [12. Limitations and Known Constraints](#12-limitations-and-known-constraints)

---

## 1. What is RAG and Why "Simulation"?

**Retrieval-Augmented Generation (RAG)** is a technique where a language model's answers are grounded in a specific knowledge base rather than relying purely on its training data. Before asking the LLM a question, a retrieval step fetches the most relevant documents from the knowledge base and injects them as context into the prompt. The LLM then answers using that context, not its general knowledge.

A production RAG system typically involves:
- A dedicated **vector database** (e.g., Pinecone, Weaviate, pgvector) storing pre-computed embeddings
- A separate **embedding service** (e.g., OpenAI `text-embedding-3-small`, Cohere)
- A reranker model for a second-pass relevance pass
- Document chunking, overlap strategies, and metadata filtering

This implementation is a **local RAG simulation** — it achieves the same outcome (grounded, context-aware answers) but replaces every cloud dependency with local components:

| Production RAG | This implementation |
|---|---|
| Vector database (cloud) | In-memory numpy arrays |
| Cloud embedding API | Local `all-MiniLM-L6-v2` model |
| BM25 search service | `rank-bm25` Python library |
| Document store | Local JSON files |
| Reranker | Reciprocal Rank Fusion (algorithmic) |

The result is a fully offline, zero-cost retrieval pipeline that runs inside the Flask process.

---

## 2. Architecture Overview

```
User types a question in ChatPanel
         │
         ▼
┌─────────────────────────────────────────────────────┐
│                    Browser (React)                   │
│                                                     │
│  1. POST /api/discovery/chat/context                │
│     { query, messages[] }   ──────────────────────► │
│                                                     │
│  3. Receive { system: "..." }                       │
│                                                     │
│  4. POST https://api.openai.com/v1/chat/completions │
│     { model, messages: [system, ...history] }       │
│                                                     │
│  5. Stream response tokens → render Markdown        │
└─────────────────────────────────────────────────────┘
                     │ step 1
                     ▼
┌─────────────────────────────────────────────────────┐
│               Flask Backend (Python)                 │
│                                                     │
│  routes.py  ──►  chat.py                           │
│                                                     │
│  _load_data()   (once on first request)             │
│    ├── Load patterns_all.json / patterns.json        │
│    ├── Load classifiers_all.json                    │
│    ├── Load stages.json + ire.json                  │
│    ├── Build BM25 indices (rank-bm25)               │
│    └── Encode embeddings (sentence-transformers)    │
│                                                     │
│  _build_context(messages)                           │
│    ├── _build_retrieval_query()  ← last 3 turns     │
│    ├── _search_patterns()        ← hybrid search    │
│    ├── _search_classifiers()     ← hybrid search    │
│    └── Assemble prose context                       │
│                                                     │
│  Return { system: BASE_SYSTEM + context }           │
└─────────────────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   patterns_all.json     classifiers_all.json
   patterns.json         stages.json
   (local JSON files)    ire.json
```

**Key design decision:** The LLM call is made directly from the browser using the user's own OpenAI API key. The Flask backend only performs retrieval — it never sees or stores the API key.

---

## 3. Knowledge Base — Local JSON Files

The knowledge base consists of five JSON files split into two categories.

### Extracted files (from a live ServiceNow instance)

These are generated by the extraction scripts in `backend/scripts/` and stored in `backend/scripts/data/`.

| File | Content | Size |
|---|---|---|
| `patterns_all.json` | All Discovery patterns with full NDL (steps, operations, relations, tables, CI mappings) | Large (~many MB depending on instance) |
| `classifiers_all.json` | All Discovery classifiers with their matching criteria | ~168 classifiers, 98 criteria |

**Pattern document structure (key fields used for RAG):**

```json
{
  "id": "<sys_id>",
  "name": "Amazon AWS - IAM User - Extended Inventory (LP)",
  "category": "Cloud",
  "discoveryType": "Horizontal",
  "mainCi": "cmdb_ci_cmp_resource",
  "protocol": "",
  "credentialType": "",
  "description": "",
  "active": false,
  "ndl": {
    "steps": [
      {
        "name": "Transform temporary table to main ci",
        "operations": [
          {
            "type": "transform",
            "srcTable": "response_parsed",
            "targetTable": "cmdb_ci_cmp_resource",
            "setFields": ["name", "object_id", "resource_type", "install_status", "operational_status"]
          }
        ]
      }
    ],
    "relations": [
      {
        "type": "relation_reference",
        "table1": "cmdb_ci_cmp_resource",
        "table2": "cmdb_ci_cloud_service_account",
        "relationshipType": "Hosted on::Hosts"
      }
    ],
    "tablesPopulated": [
      {
        "table": "cmdb_ci_cmp_resource",
        "tableType": "cmdb_ci",
        "columns": ["install_status", "name", "object_id"]
      }
    ],
    "identifications": [...],
    "connections": [...]
  }
}
```

**Classifier document structure:**

```json
{
  "id": "<sys_id>",
  "name": "AIX",
  "ciTable": "cmdb_ci_aix_server",
  "ciTableLabel": "AIX Server",
  "type": "SSH",
  "matchCriteria": "Any",
  "active": true,
  "criteria": [
    {
      "criterion": "uname",
      "operator": "contains",
      "value": "AIX"
    }
  ]
}
```

### Bundled reference files

These are small, curated reference documents committed directly to the repository under `backend/modules/discovery/data/`.

| File | Content |
|---|---|
| `stages.json` | The 4 Discovery pipeline stages (Scanning, Classification, Identification, Exploration) with steps, tables, MID Server roles |
| `ire.json` | IRE (Identification & Reconciliation Engine) reference — identification rules, reconciliation precedence, CMDB tables, operational tips |
| `patterns.json` | Bundled fallback sample patterns (used when `patterns_all.json` is not available) |

---

## 4. Search Pipeline

All search logic lives in `backend/modules/discovery/chat.py`. The pipeline runs four tiers, all of which contribute to producing the best possible context for the LLM.

### Document text representation

Before indexing, each document (pattern or classifier) is converted to a flat string that captures all its searchable content. This string is used by both BM25 and the embedding model.

**For patterns (`_pat_doc_text`):**
```
name  mainCi  protocol  credentialType  category  description  discoveryType
+ all step names
+ all targetTable values from operations
+ all setFields from transform operations
+ all targetColumns from api_call operations
+ all relation table1/table2/relationshipType/refField values
+ all tablesPopulated table names and column names
```

This ensures that queries like *"which step maps attributes to the main CI"* or *"what relations does the IAM Role pattern create"* can match the right pattern through both BM25 and semantic similarity.

**For classifiers (`_clf_doc_text`):**
```
name  ciTable  ciTableLabel  type
+ all criterion names and values from matching criteria
```

---

### Tier 1 — BM25 (Term-based)

**Library:** `rank-bm25` (`BM25Okapi`)

**What it is:** BM25 (Best Match 25) is the standard term-based ranking algorithm used by search engines like Elasticsearch and Solr. It is a significant improvement over simple keyword matching because it accounts for:

- **Term frequency saturation** — a word appearing 10 times in a document is not 10× more relevant than one appearing once; relevance saturates
- **Inverse document frequency** — rare terms score higher than common terms (e.g., "WMI" is more discriminating than "pattern")
- **Document length normalisation** — longer documents are not unfairly rewarded for incidentally containing a term

**How it is built (at startup):**
```python
from rank_bm25 import BM25Okapi

corpus = [_tokens(_pat_doc_text(p)) for p in _patterns]
# corpus = [["amazon", "aws", "iam", "user", "extended", ...], ...]
_pat_bm25 = BM25Okapi(corpus)
```

**How it is used (at query time):**
```python
toks   = _tokens(query)           # tokenise the query
scores = _pat_bm25.get_scores(toks)  # float[] — one score per pattern
# sort descending, keep top pool (limit × 4), discard zero-scores
```

**Tokenisation (`_tokens`):**
```python
def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"\w+", text.lower()) if len(t) > 2]
```
Lowercases, splits on non-word characters, and drops tokens shorter than 3 characters (removes noise like "a", "is", "of").

---

### Tier 2 — Semantic Search (Embeddings)

**Library:** `sentence-transformers`  
**Model:** `all-MiniLM-L6-v2`

**What it is:** Rather than matching exact words, semantic search converts both documents and the query into dense numerical vectors (embeddings) in a shared high-dimensional space. Documents that are *semantically similar* — even if they use completely different words — end up close together in that space. Relevance is then measured as **cosine similarity** between the query vector and every document vector.

This is what makes it possible to ask *"Windows credential type"* and find patterns that use *"WMI authentication"*, or ask *"attribute mapping to main CI"* and find the step called *"Transform temporary table to main ci"*.

**Model details:**
- Name: `all-MiniLM-L6-v2`
- Size: ~90 MB on disk
- Embedding dimensions: 384
- Runs entirely on CPU (no GPU required)
- Download: one-time from Hugging Face Hub, then cached at `~/.cache/huggingface/hub/`

**How embeddings are built (at startup):**
```python
from sentence_transformers import SentenceTransformer

_sem_model = SentenceTransformer("all-MiniLM-L6-v2")

# Encode every document into a (N, 384) float32 matrix
_pat_embeddings = _sem_model.encode(
    [_pat_doc_text(p) for p in _patterns],
    convert_to_numpy=True,
    show_progress_bar=False,
)
```

The resulting matrix is held in memory for the lifetime of the Flask process. With ~500 patterns and 168 classifiers, the total memory footprint is approximately 500 × 384 × 4 bytes ≈ 750 KB, which is negligible.

**How similarity is computed (at query time):**
```python
q_vec = _sem_model.encode(query, convert_to_numpy=True)  # shape (384,)
sims  = _cosine_sim(q_vec, _pat_embeddings)              # shape (N,)
# sort descending, keep top pool (limit × 4)
```

**Cosine similarity implementation (manual, no sklearn dependency):**
```python
def _cosine_sim(q_vec, doc_matrix):
    import numpy as np
    q     = q_vec / (np.linalg.norm(q_vec) + 1e-8)
    norms = np.linalg.norm(doc_matrix, axis=1, keepdims=True) + 1e-8
    return (doc_matrix / norms) @ q
```

---

### Tier 3 — Hybrid Search with RRF

**Algorithm:** Reciprocal Rank Fusion (RRF)

Running BM25 and semantic search independently produces two ranked lists. Neither is perfect alone:
- BM25 is precise for exact terminology but fails on vocabulary mismatches
- Semantic search handles paraphrasing but can surface vaguely related results

**Reciprocal Rank Fusion** merges multiple ranked lists into a single unified ranking without requiring score normalisation (the two methods produce scores on completely different scales, so they cannot simply be added).

**Formula:**

```
RRF_score(document d) = Σ  1 / (k + rank_r(d))
                       r ∈ {BM25, semantic}
```

Where `k = 60` is a constant that dampens the influence of top-ranked documents, preventing any single method from dominating.

**Implementation:**
```python
def _rrf(ranked_lists: list[list[int]], k: int = 60) -> list[int]:
    scores: dict[int, float] = {}
    for ranked in ranked_lists:
        for rank, idx in enumerate(ranked):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
    return [idx for idx, _ in sorted(scores.items(), key=lambda x: -x[1])]
```

A document ranked #1 by both methods receives a much higher RRF score than one ranked #1 by only one method. Documents not appearing in one list still receive a contribution from the other, so they are not excluded.

**Full hybrid search function:**
```python
def _hybrid_search(query, items, bm25_idx, embeddings, doc_fn, limit):
    pool = min(len(items), limit * 4)   # candidate pool per method

    ranked_lists = []

    # BM25 candidates (only items with score > 0)
    if bm25_idx is not None:
        toks = _tokens(query)
        scores = bm25_idx.get_scores(toks)
        bm25_ranked = [int(i) for i in scores.argsort()[::-1][:pool] if scores[i] > 0]
        if bm25_ranked:
            ranked_lists.append(bm25_ranked)

    # Semantic candidates (always top-pool from similarity)
    if embeddings is not None and _sem_model is not None:
        q_vec = _sem_model.encode(query, convert_to_numpy=True)
        sims  = _cosine_sim(q_vec, embeddings)
        sem_ranked = [int(i) for i in sims.argsort()[::-1][:pool]]
        ranked_lists.append(sem_ranked)

    if len(ranked_lists) == 2:
        return [items[i] for i in _rrf(ranked_lists)[:limit]]
    elif len(ranked_lists) == 1:
        return [items[i] for i in ranked_lists[0][:limit]]
    else:
        return _keyword_fallback(query, items, doc_fn, limit)
```

---

### Tier 4 — Context Formatting

Once the top-K documents are retrieved, they must be formatted into text that the LLM can read and reason over. Raw JSON is verbose and token-inefficient. Instead, each document is rendered as structured prose.

**Pattern format (`_prose_pattern`):**

```
**Amazon AWS - IAM User - Extended Inventory (LP)** (`a09840c9...`) — Horizontal | Category: Cloud | Main CI: cmdb_ci_cmp_resource | INACTIVE
  Steps (11):
    1. Set Rest URL for API — set_attr: url
    2. Prepare url with region value — set_attr: awsUrl
    3. Perform API request to list all User — api_call → response
    4. Validate if API response is successful — validate/match
    5. Parse API response to extract User information — api_call → response_parsed [user_name:..., arn:..., user_id:...]
    6. Validate if Parsed response has records — validate/match
    7. Transform temporary table to main ci — transform response_parsed → cmdb_ci_cmp_resource [name, object_id, resource_type, install_status, operational_status]
    8. Transform temporary table to related table — transform response_parsed → cmdb_aws_iam_user [name, object_id]
    9. Create Cloud Service Account — merge service_account + cmdb_ci_cloud_service_account → cmdb_ci_cloud_service_account
    10. Create relation between main ci and LDC/service account — relation cmdb_ci_cmp_resource → cmdb_ci_cloud_service_account (Hosted on::Hosts)
    11. Create reference of Cloud Resource in IAM User — relation cmdb_aws_iam_user[key:object_id] → cmdb_ci_cmp_resource[key:object_id] (ref field: configuration_item)
  Relations (2):
    • cmdb_ci_cmp_resource → cmdb_ci_cloud_service_account [Hosted on::Hosts]
    • cmdb_aws_iam_user[key:object_id] → cmdb_ci_cmp_resource[key:object_id] [ref field: configuration_item]
  CMDB tables written:
    • cmdb_ci_cmp_resource [install_status, name, object_id, operational_status, resource_type]
    • cmdb_aws_iam_user [name, object_id]
    • cmdb_ci_cloud_service_account
```

**Classifier format (`_prose_classifier`):**

```
**AIX** (`clf_abc...`) — SSH classifier | CI: AIX Server | Match: Any criteria
  Criteria: uname contains 'AIX'; kernel equals 'AIX'
```

**Token efficiency:** The prose format is significantly more token-efficient than JSON. A typical pattern with 10 steps in JSON would use ~600 tokens; the prose format uses ~200 tokens for the same content.

---

## 5. Conversation-Aware Retrieval

A common failure mode of naive RAG is that follow-up questions — *"tell me more about that"*, *"what about its relations?"* — arrive as retrieval queries with no useful keywords. The previous turn's context is lost.

**Solution:** The retrieval query is built from the **last 3 user turns** of the conversation, not just the current message.

```python
def _build_retrieval_query(messages: list[dict]) -> str:
    user_msgs = [m["content"] for m in messages if m.get("role") == "user"]
    return " ".join(user_msgs[-3:]) if user_msgs else ""
```

**Example:**

| Turn | User message | Retrieval query used |
|---|---|---|
| 1 | "Which patterns discover AWS IAM Users?" | "Which patterns discover AWS IAM Users?" |
| 2 | "What relations does it create?" | "Which patterns discover AWS IAM Users? What relations does it create?" |
| 3 | "And what tables does it write to?" | "Which patterns discover AWS IAM Users? What relations does it create? And what tables does it write to?" |

This ensures that the retrieved context remains relevant throughout a multi-turn conversation without the user having to repeat context each time.

The full message history (`nextHistory`) is passed from the frontend to the `/api/discovery/chat/context` endpoint on every turn:

```javascript
// ChatPanel.jsx
const { system } = await chatApi.getContext(question, nextHistory)
```

```javascript
// client.js
async getContext(query, messages = []) {
  return fetch('/api/discovery/chat/context', {
    method: 'POST',
    body: JSON.stringify({ query, messages }),
  }).then(r => r.json())
}
```

---

## 6. Conditional Context Injection

The `stages.json` and `ire.json` reference documents are small but not zero-cost in tokens. Including them on every request wastes context window space for questions that don't need them.

Instead, they are injected only when the retrieval query contains keywords that signal intent:

```python
_STAGE_KWORDS = frozenset({
    'stage', 'stages', 'scanning', 'classification', 'exploration',
    'probe', 'sensor', 'pipeline', 'ecc', 'queue', 'l1', 'l2', 'l3',
})
_IRE_KWORDS = frozenset({
    'ire', 'reconciliation', 'duplicate', 'dedup', 'precedence',
    'serial', 'identification', 'merge', 'conflict',
})
```

```python
query_toks = set(_tokens(query))

if query_toks & _STAGE_KWORDS:
    parts.append("## Discovery Stages\n" + json.dumps(_stages, indent=2))

if query_toks & _IRE_KWORDS:
    parts.append("## IRE — Identification & Reconciliation Engine\n" + json.dumps(_ire, indent=2))
```

**Examples:**

| Query | Stages injected? | IRE injected? |
|---|---|---|
| "Which patterns use WMI?" | No | No |
| "What happens during the scanning stage?" | Yes | No |
| "How does IRE reconciliation work?" | No | Yes |
| "What is the identification stage and how does IRE handle duplicates?" | Yes | Yes |

---

## 7. End-to-End Request Flow

Below is the complete sequence for a single user message.

```
1. USER TYPES: "What relations does the AWS IAM Role pattern create?"

2. FRONTEND builds nextHistory:
   [
     { role: "user", content: "What relations does the AWS IAM Role pattern create?" }
   ]

3. FRONTEND calls:
   POST /api/discovery/chat/context
   { "query": "What relations does...", "messages": [...nextHistory] }

4. BACKEND — routes.py:
   Extracts query + messages, calls chat._load_data() (no-op if already loaded),
   then calls chat._build_context(messages)

5. BACKEND — chat._build_context():

   a. _build_retrieval_query(messages)
      → "What relations does the AWS IAM Role pattern create?"

   b. _search_patterns(query, limit=10)
      ├── BM25: tokenise → ["what", "relations", "does", "aws", "iam", "role", "pattern", "create"]
      │         score all 500+ patterns → top 40 candidates with score > 0
      ├── Semantic: encode query → (384,) vector
      │            cosine_sim with _pat_embeddings (N×384) → top 40 candidates
      └── RRF merge → unified top 10

   c. _search_classifiers(query, limit=8)
      → same process over classifier corpus → top 8

   d. Check query_toks against _STAGE_KWORDS → no match → stages NOT injected
      Check query_toks against _IRE_KWORDS → no match → ire NOT injected

   e. Format each retrieved pattern as prose via _prose_pattern()
      Format each classifier as prose via _prose_classifier()

   f. Assemble:
      ## Relevant Discovery Patterns (10 matched)
      **Amazon AWS - IAM Role - Extended Inventory (LP)** ...
        Steps (11): ...
        Relations (2):
          • cmdb_ci_cmp_resource → cmdb_ci_cloud_service_account [Hosted on::Hosts]
          • cmdb_aws_iam_role[key:object_id] → cmdb_ci_cmp_resource[key:object_id] [ref field: configuration_item]
        CMDB tables written: ...
      [9 more patterns...]

      ## Relevant Classifiers (8 matched)
      ...

6. BACKEND returns:
   {
     "system": "<BASE_SYSTEM>\n\n## Relevant Discovery Patterns...[full context]"
   }

7. FRONTEND calls OpenAI directly:
   POST https://api.openai.com/v1/chat/completions
   {
     "model": "gpt-4o-mini",
     "max_tokens": 1024,
     "stream": true,
     "messages": [
       { "role": "system", "content": "<BASE_SYSTEM + context>" },
       { "role": "user",   "content": "What relations does the AWS IAM Role pattern create?" }
     ]
   }

8. OpenAI streams response tokens → ChatPanel renders as Markdown
```

---

## 8. API Contract

### `POST /api/discovery/chat/context`

**Purpose:** Returns the RAG-enriched system prompt. The frontend uses this to ground the OpenAI call without exposing an API key to the backend.

**Request body:**
```json
{
  "query": "string — the current user question",
  "messages": [
    { "role": "user",      "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

`messages` is the full conversation history **including** the current user message. `query` is the current message alone (used as fallback if `messages` is absent).

**Response:**
```json
{
  "system": "You are an expert assistant...\n\n## Relevant Discovery Patterns...\n..."
}
```

**Retrieval limits:**
- Patterns: top 10 returned
- Classifiers: top 8 returned
- Candidate pool per search method: `limit × 4` (40 for patterns, 32 for classifiers)

---

## 9. Libraries and Models

| Dependency | Version | Purpose |
|---|---|---|
| `rank-bm25` | `>=0.2.2` | BM25Okapi implementation for term-based ranking |
| `sentence-transformers` | `>=2.7.0` | Local embedding model loading and inference |
| `numpy` | (transitive) | Vector operations, cosine similarity, argsort |
| `flask` | `>=3.0.0` | HTTP server and routing |
| `openai` | `>=1.30.0` | Optional — only used by `stream_chat()` which is not currently called by any route |

### `all-MiniLM-L6-v2` model

| Property | Value |
|---|---|
| Source | Hugging Face Hub (`sentence-transformers/all-MiniLM-L6-v2`) |
| Architecture | Distilled MiniLM (6 layers) |
| Embedding dimension | 384 |
| Max input tokens | 256 |
| Model size on disk | ~90 MB |
| Download location | `~/.cache/huggingface/hub/` |
| Download frequency | **One time only** — permanently cached after first run |
| Internet at runtime | Not required — runs entirely from local cache |
| Rate limits | Not applicable once cached; anonymous download limits are very generous for a single 90MB model |
| Hardware requirement | CPU only — no GPU needed |

---

## 10. Graceful Degradation

The search pipeline degrades gracefully if optional libraries are not installed. At every stage a warning is logged and the next available fallback is used.

```
sentence-transformers + rank-bm25 installed
    → Hybrid search (BM25 + semantic) with RRF  ← best quality

rank-bm25 installed, sentence-transformers missing
    → BM25 only

sentence-transformers installed, rank-bm25 missing
    → Semantic only

Neither installed
    → Keyword fallback (substring frequency count)  ← original behaviour
```

The keyword fallback is a simple loop that counts how many times each query token appears in the document text:

```python
def _keyword_fallback(query, items, doc_fn, limit):
    toks = _tokens(query)
    scored = [(sum(doc_fn(item).lower().count(t) for t in toks), item)
              for item in items]
    scored = [(s, i) for s, i in scored if s > 0]
    scored.sort(key=lambda x: -x[0])
    return [item for _, item in scored[:limit]]
```

---

## 11. Key Files Reference

```
backend/
├── modules/discovery/
│   ├── chat.py                  ← All RAG logic (retrieval, indexing, context assembly)
│   ├── routes.py                ← Flask route: POST /api/discovery/chat/context
│   └── data/
│       ├── patterns.json        ← Bundled fallback patterns
│       ├── stages.json          ← Discovery pipeline stages reference
│       └── ire.json             ← IRE reference guide
├── scripts/
│   ├── extract_patterns.py      ← Fetches patterns from a live ServiceNow instance
│   ├── extract_classifiers.py   ← Fetches classifiers from a live ServiceNow instance
│   └── data/
│       ├── patterns_all.json    ← Extracted patterns (preferred over bundled)
│       └── classifiers_all.json ← Extracted classifiers
└── requirements.txt

frontend/src/
├── api/client.js                ← chatApi.getContext(query, messages)
└── components/ChatPanel.jsx     ← Chat UI; calls getContext then OpenAI directly
```

### Data loading priority

For patterns:
1. `backend/scripts/data/patterns_all.json` (extracted from instance) — preferred
2. `backend/modules/discovery/data/patterns.json` (bundled fallback)

For classifiers:
1. `backend/scripts/data/classifiers_all.json` — only source (no bundled fallback)

Data is loaded **once** on the first request to `/api/discovery/chat/context` and held in module-level globals for the lifetime of the Flask process. Restarting Flask reloads and re-indexes everything.

---

## 12. Limitations and Known Constraints

**Token budget:** The system prompt grows with the number of retrieved patterns. Each pattern with full NDL detail uses approximately 150–250 tokens. With 10 patterns + 8 classifiers, the context section alone can be 2,000–4,000 tokens. `gpt-4o-mini` has a 128K context window, so this is not a practical limit for this use case.

**No score threshold:** Semantic search always returns `limit × 4` candidates regardless of similarity score. A query about a completely unrelated topic will still retrieve the 10 "least unrelated" patterns. The strict system prompt rules prevent the LLM from fabricating answers in this case.

**Startup latency:** The first request after Flask starts is slow — loading data, building BM25 indices, and encoding embeddings can take 5–15 seconds depending on corpus size and hardware. Subsequent requests are fast (encoding a single query takes <100ms on CPU).

**No chunking:** Each pattern and classifier is treated as a single document. Patterns with very long NDL scripts could exceed the `all-MiniLM-L6-v2` 256-token input limit, causing the model to silently truncate the input before encoding. For very large patterns, chunking the NDL steps into separate indexed documents would improve recall.

**Not thread-safe at startup:** `_load_data()` uses a simple `if _patterns is not None: return` guard. If multiple requests arrive simultaneously before the first load completes, the load could run more than once. In practice this is harmless (the result is identical) but a `threading.Lock` would make it strictly correct.

**Static knowledge base:** The in-memory indices are not refreshed while Flask is running. If `patterns_all.json` or `classifiers_all.json` are updated on disk, a Flask restart is required to pick up the changes.
