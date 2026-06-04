import json
import logging
from pathlib import Path
from flask import Blueprint, jsonify, request, Response, stream_with_context

blueprint = Blueprint("discovery", __name__, url_prefix="/api/discovery")
LOG = logging.getLogger(__name__)

DATA_DIR  = Path(__file__).parent.parent.parent / "scripts" / "data"
LOCAL_DIR = Path(__file__).parent / "data"   # stages.json, ire.json

# ── patterns state ─────────────────────────────────────────────────────────────
_patterns:          list[dict] | None = None
_by_id:             dict[str, dict]   = {}
_prepost_scripts:   dict[str, dict]   = {}
_delete_strategies: dict[str, dict]   = {}
_mtime:             float             = 0.0

# ── classifiers state ──────────────────────────────────────────────────────────
_classifiers:      list[dict] | None = None
_classifiers_by_id: dict[str, dict]  = {}
_clf_mtime:        float             = 0.0


def _load() -> None:
    """Load (or reload) patterns_all.json when the file has changed on disk."""
    global _patterns, _by_id, _prepost_scripts, _delete_strategies, _mtime

    path = DATA_DIR / "patterns_all.json"
    if not path.exists():
        if _patterns is None:
            LOG.error(
                "patterns_all.json not found. "
                "Run:  python scripts/extract_patterns.py --url ... --user ..."
            )
            _patterns, _by_id = [], {}
        return

    current_mtime = path.stat().st_mtime
    if _patterns is not None and current_mtime == _mtime:
        return  # nothing changed

    data = json.loads(path.read_text(encoding="utf-8"))
    # Support both the new envelope format {meta, patterns, prepostScripts, deleteStrategies}
    # and a legacy bare array.
    if isinstance(data, list):
        _patterns          = data
        _prepost_scripts   = {}
        _delete_strategies = {}
    else:
        _patterns          = data.get("patterns", [])
        _prepost_scripts   = data.get("prepostScripts", {})
        _delete_strategies = data.get("deleteStrategies", {})

    _by_id = {p["id"]: p for p in _patterns}
    _mtime = current_mtime
    LOG.info("Loaded %d patterns from patterns_all.json", len(_patterns))


def _load_classifiers() -> None:
    """Load (or reload) classifiers_all.json when the file has changed on disk."""
    global _classifiers, _classifiers_by_id, _clf_mtime

    path = DATA_DIR / "classifiers_all.json"
    if not path.exists():
        if _classifiers is None:
            LOG.warning(
                "classifiers_all.json not found. "
                "Run:  python scripts/extract_classifiers.py --url ... --user ..."
            )
            _classifiers, _classifiers_by_id = [], {}
        return

    current_mtime = path.stat().st_mtime
    if _classifiers is not None and current_mtime == _clf_mtime:
        return

    data = json.loads(path.read_text(encoding="utf-8"))
    _classifiers       = data.get("classifiers", data) if isinstance(data, dict) else data
    _classifiers_by_id = {c["id"]: c for c in _classifiers}
    _clf_mtime         = current_mtime
    LOG.info("Loaded %d classifiers from classifiers_all.json", len(_classifiers))


# ── endpoints ──────────────────────────────────────────────────────────────────

@blueprint.route("/stats")
def get_stats():
    _load()
    by_cat, by_dt = {}, {}
    for p in _patterns:
        c = p["category"]
        d = p["discoveryType"]
        by_cat[c] = by_cat.get(c, 0) + 1
        by_dt[d]  = by_dt.get(d, 0) + 1
    return jsonify({
        "totalPatterns":   len(_patterns),
        "byCategory":      by_cat,
        "byDiscoveryType": by_dt,
    })


@blueprint.route("/patterns")
def get_patterns():
    _load()
    q   = (request.args.get("q")        or "").lower().strip()
    cat = (request.args.get("category") or "").strip()

    result = []
    for p in _patterns:
        if q and q not in p["name"].lower() and q not in (p.get("mainCi") or "").lower():
            continue
        if cat and p["category"] != cat:
            continue
        result.append({
            "id":                 p["id"],
            "name":               p["name"],
            "category":           p["category"],
            "color":              p["color"],
            "mainCi":             p.get("mainCi"),
            "discoveryType":      p["discoveryType"],
            "isExtensionSection": p.get("isExtensionSection", p.get("isExtension", False)),
        })
    return jsonify(result)


@blueprint.route("/patterns/<pattern_id>")
def get_pattern(pattern_id):
    _load()
    p = _by_id.get(pattern_id)
    if not p:
        return jsonify({"error": "Pattern not found"}), 404
    return jsonify(p)


@blueprint.route("/stages")
def get_stages():
    return jsonify(json.loads((LOCAL_DIR / "stages.json").read_text()))


@blueprint.route("/ire")
def get_ire():
    return jsonify(json.loads((LOCAL_DIR / "ire.json").read_text()))


@blueprint.route("/credentials")
def get_credentials():
    return jsonify(json.loads((LOCAL_DIR / "credentials.json").read_text()))


# ── classifiers ────────────────────────────────────────────────────────────────

@blueprint.route("/classifiers")
def get_classifiers():
    _load_classifiers()
    q      = (request.args.get("q")      or "").lower().strip()
    active = request.args.get("active")   # "true" | "false" | None

    result = []
    for c in _classifiers:
        if active == "true"  and not c.get("active"):  continue
        if active == "false" and     c.get("active"):  continue
        if q and q not in c["name"].lower() and q not in (c.get("ciTable") or "").lower():
            continue
        result.append({
            "id":           c["id"],
            "name":         c["name"],
            "ciTable":      c.get("ciTable", ""),
            "ciTableLabel": c.get("ciTableLabel", ""),
            "type":         c.get("type", ""),
            "active":       c.get("active", True),
            "criteriaCount": len(c.get("criteria", [])),
        })
    return jsonify(result)


@blueprint.route("/classifiers/<clf_id>")
def get_classifier(clf_id):
    _load_classifiers()
    c = _classifiers_by_id.get(clf_id)
    if not c:
        return jsonify({"error": "Classifier not found"}), 404
    return jsonify(c)


# ── AI chat ────────────────────────────────────────────────────────────────────

@blueprint.route("/chat/context", methods=["POST"])
def chat_context():
    """Return the RAG-enriched system prompt for a given query.

    The frontend calls OpenAI directly with the user's own API key.
    This endpoint only returns retrieved context — no API key is stored here.
    Accepts: { query: string, messages?: [{role, content}] }
    """
    from . import chat as ai

    data     = request.get_json(silent=True) or {}
    query    = data.get("query", "")
    messages = data.get("messages", [])

    if not query and not messages:
        return jsonify({"error": "query or messages required"}), 400

    # Build a messages list for the retrieval query builder
    if not messages and query:
        messages = [{"role": "user", "content": query}]

    ai._load_data()
    system = ai._BASE_SYSTEM + "\n\n" + ai._build_context(messages)

    return jsonify({"system": system})
