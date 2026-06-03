import json
import logging
import re
from pathlib import Path

LOG = logging.getLogger(__name__)

_DATA_DIR  = Path(__file__).parent.parent.parent / "scripts" / "data"
_LOCAL_DIR = Path(__file__).parent / "data"

_client = None

# In-memory data store (populated on first request)
_patterns:    list | None = None
_classifiers: list | None = None
_stages:      list | None = None
_ire:         dict | None = None

# BM25 indices (populated at load time, requires rank-bm25)
_pat_bm25 = None
_clf_bm25 = None

# Semantic search (populated at load time, requires sentence-transformers)
_sem_model      = None
_pat_embeddings = None   # np.ndarray (N, D)
_clf_embeddings = None   # np.ndarray (M, D)

# Keywords that trigger inclusion of static reference sections
_STAGE_KWORDS = frozenset({
    'stage', 'stages', 'scanning', 'classification', 'exploration',
    'probe', 'sensor', 'pipeline', 'ecc', 'queue', 'l1', 'l2', 'l3',
})
_IRE_KWORDS = frozenset({
    'ire', 'reconciliation', 'duplicate', 'dedup', 'precedence',
    'serial', 'identification', 'merge', 'conflict',
})


# ── Client ────────────────────────────────────────────────────────────────────

def _get_client():
    global _client
    if _client is None:
        try:
            from openai import OpenAI
            _client = OpenAI()
        except ImportError:
            raise RuntimeError("openai package not installed. Run: pip install openai")
    return _client


# ── Tokenisation ──────────────────────────────────────────────────────────────

def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"\w+", text.lower()) if len(t) > 2]


# ── Document text builders ────────────────────────────────────────────────────

def _pat_doc_text(p: dict) -> str:
    parts = [
        p.get("name", ""),
        p.get("mainCi", ""),
        p.get("protocol", ""),
        p.get("credentialType", ""),
        p.get("category", ""),
        p.get("description", ""),
        p.get("discoveryType", ""),
    ]
    ndl = p.get("ndl") or {}
    for step in ndl.get("steps", []):
        parts.append(step.get("name", ""))
        for op in step.get("operations", []):
            if op.get("targetTable"):
                parts.append(op["targetTable"])
            if op.get("setFields"):
                parts.extend(op["setFields"])
            if op.get("targetColumns"):
                parts.append(op["targetColumns"])
    for rel in ndl.get("relations", []):
        parts.extend([
            rel.get("table1", ""),
            rel.get("table2", ""),
            rel.get("relationshipType", ""),
            rel.get("refField", ""),
        ])
    for t in ndl.get("tablesPopulated", []):
        parts.append(t.get("table", ""))
        parts.extend(t.get("columns", []))
    return " ".join(filter(None, parts))


def _clf_doc_text(c: dict) -> str:
    parts = [
        c.get("name", ""),
        c.get("ciTable", ""),
        c.get("ciTableLabel", ""),
        c.get("type", ""),
    ]
    for cr in (c.get("criteria") or []):
        parts.append(cr.get("criterion", ""))
        parts.append(cr.get("value", ""))
    return " ".join(filter(None, parts))


# ── Data loading ──────────────────────────────────────────────────────────────

def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _load_data():
    """Load JSON files and build BM25 + semantic indices (runs once on first request)."""
    global _patterns, _classifiers, _stages, _ire
    global _pat_bm25, _clf_bm25, _sem_model, _pat_embeddings, _clf_embeddings

    if _patterns is not None:
        return

    # ── Patterns ──
    patterns_path = _DATA_DIR / "patterns_all.json"
    if not patterns_path.exists():
        patterns_path = _LOCAL_DIR / "patterns.json"

    if patterns_path.exists():
        raw       = _read_json(patterns_path)
        _patterns = raw.get("patterns", raw) if isinstance(raw, dict) else raw
        LOG.info("Loaded %d patterns from %s", len(_patterns), patterns_path.name)
    else:
        _patterns = []
        LOG.warning("No patterns file found — pattern context will be empty")

    # ── Classifiers ──
    clf_path = _DATA_DIR / "classifiers_all.json"
    if clf_path.exists():
        raw          = _read_json(clf_path)
        _classifiers = raw.get("classifiers", raw) if isinstance(raw, dict) else raw
        LOG.info("Loaded %d classifiers", len(_classifiers))
    else:
        _classifiers = []
        LOG.warning("No classifiers file found — classifier context will be empty")

    # ── Static reference docs ──
    _stages = _read_json(_LOCAL_DIR / "stages.json")
    _ire    = _read_json(_LOCAL_DIR / "ire.json")

    # ── Tier 1: BM25 indices ──
    try:
        from rank_bm25 import BM25Okapi
        if _patterns:
            _pat_bm25 = BM25Okapi([_tokens(_pat_doc_text(p)) for p in _patterns])
        if _classifiers:
            _clf_bm25 = BM25Okapi([_tokens(_clf_doc_text(c)) for c in _classifiers])
        LOG.info("BM25 indices built (%d patterns, %d classifiers)", len(_patterns), len(_classifiers))
    except ImportError:
        LOG.warning("rank-bm25 not installed — falling back to keyword search. Run: pip install rank-bm25")

    # ── Tier 2: Semantic embeddings (graceful degradation) ──
    try:
        from sentence_transformers import SentenceTransformer
        _sem_model = SentenceTransformer("all-MiniLM-L6-v2")
        LOG.info("Encoding %d patterns + %d classifiers for semantic search…", len(_patterns), len(_classifiers))
        if _patterns:
            _pat_embeddings = _sem_model.encode(
                [_pat_doc_text(p) for p in _patterns],
                convert_to_numpy=True, show_progress_bar=False,
            )
        if _classifiers:
            _clf_embeddings = _sem_model.encode(
                [_clf_doc_text(c) for c in _classifiers],
                convert_to_numpy=True, show_progress_bar=False,
            )
        LOG.info("Semantic index ready")
    except ImportError:
        LOG.warning(
            "sentence-transformers not installed — semantic search disabled. "
            "Run: pip install sentence-transformers"
        )


# ── Search (Tier 1 + 2 + 3) ──────────────────────────────────────────────────

def _cosine_sim(q_vec, doc_matrix):
    import numpy as np
    q     = q_vec / (np.linalg.norm(q_vec) + 1e-8)
    norms = np.linalg.norm(doc_matrix, axis=1, keepdims=True) + 1e-8
    return (doc_matrix / norms) @ q


def _rrf(ranked_lists: list[list[int]], k: int = 60) -> list[int]:
    """Reciprocal Rank Fusion — merge multiple ranked index lists into one."""
    scores: dict[int, float] = {}
    for ranked in ranked_lists:
        for rank, idx in enumerate(ranked):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
    return [idx for idx, _ in sorted(scores.items(), key=lambda x: -x[1])]


def _keyword_fallback(query: str, items: list, doc_fn, limit: int) -> list:
    """Simple substring frequency search — last resort when no index is available."""
    toks = _tokens(query)
    if not toks:
        return []
    scored = []
    for item in items:
        text  = doc_fn(item).lower()
        score = sum(text.count(t) for t in toks)
        if score > 0:
            scored.append((score, item))
    scored.sort(key=lambda x: -x[0])
    return [item for _, item in scored[:limit]]


def _hybrid_search(query: str, items: list, bm25_idx, embeddings, doc_fn, limit: int) -> list:
    """Tier 3 hybrid: BM25 + semantic with RRF merge; degrades gracefully."""
    if not items:
        return []

    pool = min(len(items), limit * 4)
    ranked_lists: list[list[int]] = []

    # BM25
    if bm25_idx is not None:
        toks = _tokens(query)
        if toks:
            scores      = bm25_idx.get_scores(toks)
            bm25_ranked = [int(i) for i in scores.argsort()[::-1][:pool] if scores[i] > 0]
            if bm25_ranked:
                ranked_lists.append(bm25_ranked)

    # Semantic
    if embeddings is not None and _sem_model is not None and len(embeddings) > 0:
        q_vec      = _sem_model.encode(query, convert_to_numpy=True)
        sims       = _cosine_sim(q_vec, embeddings)
        sem_ranked = [int(i) for i in sims.argsort()[::-1][:pool]]
        ranked_lists.append(sem_ranked)

    if not ranked_lists:
        return _keyword_fallback(query, items, doc_fn, limit)
    if len(ranked_lists) == 1:
        return [items[i] for i in ranked_lists[0][:limit]]

    # Tier 3: RRF merge
    return [items[i] for i in _rrf(ranked_lists)[:limit]]


def _search_patterns(query: str, limit: int = 10) -> list:
    return _hybrid_search(query, _patterns, _pat_bm25, _pat_embeddings, _pat_doc_text, limit)


def _search_classifiers(query: str, limit: int = 8) -> list:
    return _hybrid_search(query, _classifiers, _clf_bm25, _clf_embeddings, _clf_doc_text, limit)


# ── Retrieval query builder (Tier 1) ─────────────────────────────────────────

def _build_retrieval_query(messages: list[dict]) -> str:
    """Concatenate the last 3 user turns to handle follow-up questions."""
    user_msgs = [m["content"] for m in messages if m.get("role") == "user"]
    return " ".join(user_msgs[-3:]) if user_msgs else ""


# ── Prose formatters (Tier 4) ─────────────────────────────────────────────────

def _op_summary(op: dict) -> str:
    t = op.get("type", "")
    if t == "transform":
        fields = ", ".join(op.get("setFields") or [])
        return f"transform {op.get('srcTable','?')} → {op.get('targetTable','?')} [{fields}]"
    if t == "relation_reference":
        rt = op.get("relationshipType") or f"ref field: {op.get('refField','?')}"
        k1 = f"[key:{op['key1']}]" if op.get("key1") else ""
        k2 = f"[key:{op['key2']}]" if op.get("key2") else ""
        return f"relation {op.get('table1','?')}{k1} → {op.get('table2','?')}{k2} ({rt})"
    if t == "merge":
        return f"merge {op.get('table1','?')} + {op.get('table2','?')} → {op.get('resultTable','?')}"
    if t == "custom_operation":
        cols = op.get("targetColumns") or ""
        tgt  = op.get("targetTable") or "response"
        if cols and len(cols) > 100:
            cols = cols[:97] + "…"
        return f"api_call → {tgt}" + (f" [{cols}]" if cols else "")
    if t == "set_attr":
        return f"set_attr: {op.get('attr','')}"
    if t == "match":
        return "validate/match"
    return t


def _prose_pattern(p: dict) -> str:
    name = f"**{p.get('name', '?')}**"
    if p.get("id"):
        name += f" (`{p['id']}`)"

    attrs = []
    if p.get("discoveryType"):
        attrs.append(p["discoveryType"])
    if p.get("category"):
        attrs.append(f"Category: {p['category']}")
    if p.get("protocol"):
        proto = p["protocol"]
        if p.get("port"):
            proto += f"/{p['port']}"
        attrs.append(f"Protocol: {proto}")
    if p.get("credentialType"):
        attrs.append(f"Credential: {p['credentialType']}")
    if p.get("mainCi"):
        attrs.append(f"Main CI: {p['mainCi']}")
    if p.get("active") is False:
        attrs.append("INACTIVE")

    lines = [(name + " — " + " | ".join(attrs)) if attrs else name]

    desc = (p.get("description") or "").strip()
    if desc:
        if len(desc) > 130:
            desc = desc[:127] + "…"
        lines.append(f"  Description: {desc}")

    ndl = p.get("ndl") or {}

    steps = ndl.get("steps", [])
    if steps:
        lines.append(f"  Steps ({len(steps)}):")
        for i, step in enumerate(steps, 1):
            ops = [_op_summary(op) for op in step.get("operations", [])]
            op_str = "; ".join(ops)
            lines.append(f"    {i}. {step.get('name', '')} — {op_str}" if op_str else f"    {i}. {step.get('name', '')}")

    relations = ndl.get("relations", [])
    if relations:
        lines.append(f"  Relations ({len(relations)}):")
        for rel in relations:
            rt = rel.get("relationshipType") or f"ref field: {rel.get('refField', '?')}"
            k1 = f"[key:{rel['key1']}]" if rel.get("key1") else ""
            k2 = f"[key:{rel['key2']}]" if rel.get("key2") else ""
            lines.append(f"    • {rel.get('table1','?')}{k1} → {rel.get('table2','?')}{k2} [{rt}]")

    cmdb_tables = [t for t in ndl.get("tablesPopulated", []) if t.get("tableType") != "temp"]
    if cmdb_tables:
        lines.append("  CMDB tables written:")
        for t in cmdb_tables:
            cols = ", ".join(t.get("columns") or [])
            lines.append(f"    • {t['table']}" + (f" [{cols}]" if cols else ""))

    return "\n".join(lines)


def _prose_classifier(c: dict) -> str:
    name = f"**{c.get('name', '?')}**"
    cid  = c.get("id", "")
    if cid:
        name += f" (`{cid}`)"

    attrs = []
    if c.get("type"):
        attrs.append(f"{c['type']} classifier")
    ci = c.get("ciTableLabel") or c.get("ciTable")
    if ci:
        attrs.append(f"CI: {ci}")
    if c.get("matchCriteria"):
        attrs.append(f"Match: {c['matchCriteria']} criteria")
    if c.get("active") is False:
        attrs.append("INACTIVE")

    line     = (name + " — " + " | ".join(attrs)) if attrs else name
    criteria = (c.get("criteria") or [])[:4]
    if criteria:
        crits = "; ".join(
            f"{cr.get('criterion', '')} {cr.get('operator', '')} '{cr.get('value', '')}'"
            for cr in criteria
        )
        line += f"\n  Criteria: {crits}"
    return line


# ── System prompt ─────────────────────────────────────────────────────────────

_BASE_SYSTEM = """\
You are an expert assistant for ServiceNow Discovery — the ITOM module that automatically \
discovers and populates the CMDB. You help developers, consultants, and administrators \
understand Discovery patterns, stages, classifiers, probes, sensors, and the IRE \
(Identification and Reconciliation Engine).

STRICT RULES — follow these exactly:
1. Answer questions ONLY using the data provided in the sections below.
2. Do NOT use general training knowledge about ServiceNow or any other topic.
3. If the answer cannot be found in the data below, respond with:
   "I don't have that information in the loaded data. For this topic, please refer to \
the official ServiceNow documentation: https://www.servicenow.com/docs/"
4. Never guess, infer, or fabricate details not present in the data.
5. Cite pattern names and IDs when relevant.
6. Be concise unless the user asks for more detail.
7. Use markdown for lists and comparisons.\
"""


def _build_context(messages: list[dict]) -> str:
    """Retrieve and assemble context from local knowledge base for the conversation."""
    query = _build_retrieval_query(messages)
    if not query:
        return ""

    patterns    = _search_patterns(query)
    classifiers = _search_classifiers(query)
    query_toks  = set(_tokens(query))

    parts = []

    if patterns:
        body = "\n".join(_prose_pattern(p) for p in patterns)
        parts.append(f"## Relevant Discovery Patterns ({len(patterns)} matched)\n{body}")

    if classifiers:
        body = "\n".join(_prose_classifier(c) for c in classifiers)
        parts.append(f"## Relevant Classifiers ({len(classifiers)} matched)\n{body}")

    # Conditionally include static reference sections based on query intent
    if query_toks & _STAGE_KWORDS:
        parts.append("## Discovery Stages\n" + json.dumps(_stages, indent=2))

    if query_toks & _IRE_KWORDS:
        parts.append("## IRE — Identification & Reconciliation Engine\n" + json.dumps(_ire, indent=2))

    return "\n\n".join(parts)


# ── Public entry point ────────────────────────────────────────────────────────

def stream_chat(messages: list[dict]):
    """Yield text chunks for a streaming AI response."""
    _load_data()
    client = _get_client()

    system    = _BASE_SYSTEM + "\n\n" + _build_context(messages)
    full_msgs = [{"role": "system", "content": system}, *messages]

    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1024,
        messages=full_msgs,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
