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


# ── Data loading ──────────────────────────────────────────────────────────────

def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _load_data():
    """Load all JSON data files into memory (runs once on first request)."""
    global _patterns, _classifiers, _stages, _ire

    if _patterns is not None:
        return

    # Patterns — prefer extracted file, fall back to bundled
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

    # Classifiers
    clf_path = _DATA_DIR / "classifiers_all.json"
    if clf_path.exists():
        raw          = _read_json(clf_path)
        _classifiers = raw.get("classifiers", raw) if isinstance(raw, dict) else raw
        LOG.info("Loaded %d classifiers", len(_classifiers))
    else:
        _classifiers = []
        LOG.warning("No classifiers file found — classifier context will be empty")

    # Stages and IRE — small files, always loaded in full
    _stages = _read_json(_LOCAL_DIR / "stages.json")
    _ire    = _read_json(_LOCAL_DIR / "ire.json")

    # Service Mapping data (loaded when the module provides it)
    sm_dir = Path(__file__).parent.parent / "service_mapping" / "data"
    if sm_dir.exists():
        for f in sm_dir.glob("*.json"):
            LOG.info("Service Mapping data available: %s", f.name)


# ── Search ────────────────────────────────────────────────────────────────────

def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"\w+", text.lower()) if len(t) > 2]


def _search_patterns(query: str, limit: int = 15) -> list:
    toks = _tokens(query)
    if not toks:
        return []
    scored = []
    for p in _patterns:
        name  = (p.get("name", "")           or "").lower()
        ci    = (p.get("mainCi", "")         or "").lower()
        proto = (p.get("protocol", "")       or "").lower()
        cred  = (p.get("credentialType", "") or "").lower()
        cat   = (p.get("category", "")       or "").lower()
        desc  = (p.get("description", "")    or "").lower()
        score = sum(
            (3 if t in name else 0) +
            (2 if t in ci   else 0) +
            (3 if t in proto else 0) +
            (2 if t in cred  else 0) +
            (1 if t in cat   else 0) +
            (1 if t in desc  else 0)
            for t in toks
        )
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored[:limit]]


def _search_classifiers(query: str, limit: int = 10) -> list:
    toks = _tokens(query)
    if not toks:
        return []
    scored = []
    for c in _classifiers:
        name  = (c.get("name", "")         or "").lower()
        table = (c.get("ciTable", "")      or "").lower()
        label = (c.get("ciTableLabel", "") or "").lower()
        ctype = (c.get("type", "")         or "").lower()
        score = sum(
            (3 if t in name  else 0) +
            (2 if t in table else 0) +
            (2 if t in label else 0) +
            (1 if t in ctype else 0)
            for t in toks
        )
        if score > 0:
            scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:limit]]


# ── Compact serialisers ───────────────────────────────────────────────────────

def _fmt_pattern(p: dict) -> dict:
    return {
        "id":             p.get("id", ""),
        "name":           p.get("name", ""),
        "category":       p.get("category", ""),
        "discoveryType":  p.get("discoveryType", p.get("type", "")),
        "protocol":       p.get("protocol", ""),
        "port":           p.get("port", ""),
        "credentialType": p.get("credentialType", ""),
        "mainCi":         p.get("mainCi", ""),
        "description":    p.get("description", ""),
        "active":         p.get("active", True),
    }


def _fmt_classifier(c: dict) -> dict:
    result = {
        "id":            c.get("id", ""),
        "name":          c.get("name", ""),
        "ciTable":       c.get("ciTable", ""),
        "ciTableLabel":  c.get("ciTableLabel", ""),
        "type":          c.get("type", ""),
        "active":        c.get("active", True),
        "matchCriteria": c.get("matchCriteria", ""),
        "criteriaCount": c.get("criteriaCount", 0),
    }
    criteria = (c.get("criteria") or [])[:5]
    if criteria:
        result["criteria"] = [
            {k: cr.get(k, "") for k in ("name", "criterion", "operator", "value")}
            for cr in criteria
        ]
    return result


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


def _build_context(query: str) -> str:
    """Return a context string built from data relevant to the query."""
    patterns    = _search_patterns(query)
    classifiers = _search_classifiers(query)

    parts = []

    if patterns:
        parts.append(
            f"## Relevant Discovery Patterns ({len(patterns)} matched)\n"
            + json.dumps([_fmt_pattern(p) for p in patterns], indent=2)
        )

    if classifiers:
        parts.append(
            f"## Relevant Classifiers ({len(classifiers)} matched)\n"
            + json.dumps([_fmt_classifier(c) for c in classifiers], indent=2)
        )

    # Always include the small reference docs
    parts.append("## Discovery Stages\n" + json.dumps(_stages, indent=2))
    parts.append("## IRE — Identification & Reconciliation Engine\n" + json.dumps(_ire, indent=2))

    return "\n\n".join(parts)


# ── Public entry point ────────────────────────────────────────────────────────

def stream_chat(messages: list[dict]):
    """Yield text chunks for a streaming AI response."""
    _load_data()
    client = _get_client()

    # Use the latest user message as the retrieval query
    last_query = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"),
        "",
    )

    system    = _BASE_SYSTEM + "\n\n" + _build_context(last_query)
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
