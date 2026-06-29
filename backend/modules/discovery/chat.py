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
_credentials: list | None = None
_mid_sections: list | None = None   # flattened MID Server sections for search
_mid_raw:      dict | None = None   # full mid_server.json for context injection
_stages:      list | None = None
_ire:         dict | None = None

# CMDB data (loaded from scripts/data/cmdb_classes.json)
_cmdb_classes:  list | None = None
_cmdb_idents:   list | None = None
_cmdb_rel_types: list | None = None
_cmdb_recon:    list | None = None

# Discovery Runs (loaded from scripts/data/discovery_runs.json)
_disco_run_docs: list | None = None   # flattened docs: one per CI + run summary
_disco_run_raw:  dict | None = None   # full data for summary injection

# BM25 indices (populated at load time, requires rank-bm25)
_pat_bm25   = None
_clf_bm25   = None
_cred_bm25  = None
_mid_bm25   = None
_cmdb_cls_bm25   = None
_cmdb_ident_bm25 = None
_cmdb_rel_bm25   = None
_cmdb_recon_bm25 = None
_disco_run_bm25  = None

# Semantic search (populated at load time, requires sentence-transformers)
_sem_model        = None
_pat_embeddings   = None   # np.ndarray (N, D)
_clf_embeddings   = None   # np.ndarray (M, D)
_cred_embeddings  = None   # np.ndarray (K, D)
_mid_embeddings   = None   # np.ndarray (S, D)
_cmdb_cls_embeddings   = None
_cmdb_ident_embeddings = None
_cmdb_rel_embeddings   = None
_cmdb_recon_embeddings = None
_disco_run_embeddings  = None

# Keywords that trigger inclusion of static reference sections
_STAGE_KWORDS = frozenset({
    'stage', 'stages', 'scanning', 'classification', 'exploration',
    'probe', 'sensor', 'pipeline', 'ecc', 'queue', 'l1', 'l2', 'l3',
})
_IRE_KWORDS = frozenset({
    'ire', 'reconciliation', 'duplicate', 'dedup', 'precedence',
    'serial', 'identification', 'merge', 'conflict',
})
_CRED_KWORDS = frozenset({
    'credential', 'credentials', 'ssh', 'snmp', 'windows', 'wmi', 'winrm',
    'vmware', 'aws', 'azure', 'gcp', 'jmx', 'jdbc', 'apikey', 'api_key',
    'vault', 'password', 'private_key', 'authentication', 'auth',
    'privilege', 'escalation', 'sudo', 'login', 'username',
})
_MID_KWORDS = frozenset({
    'mid', 'mid_server', 'midserver', 'agent', 'ecc', 'ecc_queue', 'proxy',
    'heartbeat', 'upgrade', 'validate', 'validation', 'thread', 'threads',
    'config.xml', 'cluster', 'affinity', 'pool', 'orchestration',
    'mid.max.threads', 'mid.log.level', 'java', 'jre', 'bundled',
    'down', 'upgrading', 'testing', 'stopped', 'purged',
})
_CMDB_CLASS_KWORDS = frozenset({
    'cmdb', 'class', 'classes', 'ci', 'extendable', 'principal',
    'hierarchy', 'superclass', 'cmdb_ci', 'configuration_item',
    'ci_type', 'table', 'scope', 'managed',
})
_CMDB_IDENT_KWORDS = frozenset({
    'identifier', 'identifiers', 'identification', 'identify',
    'attribute', 'attributes', 'main_attribute', 'matching', 'lookup',
    'hybrid', 'fallback', 'independent', 'ire', 'entry', 'entries',
})
_CMDB_REL_KWORDS = frozenset({
    'relation', 'relations', 'relationship', 'rel_type', 'reltype',
    'parent', 'child', 'descriptor', 'depends_on', 'runs_on',
    'hosted_on', 'connected_by', 'contains', 'member_of',
})
_CMDB_RECON_KWORDS = frozenset({
    'reconciliation', 'recon', 'datasource', 'data_source', 'precedence',
    'null_update', 'priority', 'reconcile', 'override', 'conflict',
    'source', 'authoritative',
})
_DISCO_RUN_KWORDS = frozenset({
    'discovered', 'find', 'found', 'inventoried', 'inventory',
    'latest', 'recent', 'last', 'scan', 'scanned',
    'dis', 'onprem', 'virtualbox', 'schedule',
    'linux', 'tomcat', 'server', 'host', 'hostname',
    'vm', 'virtual',
    'ip', 'address', 'range', 'subnet',
    'created', 'updated',
    'network',
    # Hardware / CI-attribute query terms
    'ram', 'memory', 'cpu', 'processor', 'cores', 'disk', 'storage',
    'kernel', 'hardware', 'spec', 'specs', 'fqdn',
    'version', 'operating', 'system',
})
# Populated at load time: tokens from every discovered CI name/FQDN.
# Lets queries mentioning a specific CI name ("webservices-infra") trigger the discovery block
# even when no generic keyword matches.
_disco_run_ci_toks: frozenset = frozenset()


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


def _cred_doc_text(ct: dict) -> str:
    parts = [
        ct.get("name", ""),
        ct.get("shortName", ""),
        ct.get("description", ""),
        " ".join(ct.get("protocols", [])),
        " ".join(ct.get("usedFor", [])),
        " ".join(ct.get("ciTypes", [])),
    ]
    for f in (ct.get("fields") or []):
        parts.extend([f.get("name", ""), f.get("label", ""), f.get("description", "")])
    parts.extend(ct.get("requiredPermissions", []))
    parts.extend(ct.get("notes", []))
    return " ".join(filter(None, parts))


def _mid_section_doc_text(s: dict) -> str:
    """Flatten a MID Server section dict to a searchable text string."""
    parts = [s.get("sectionId", ""), s.get("title", ""), s.get("body", "")]
    return " ".join(filter(None, parts))


def _cmdb_class_doc_text(c: dict) -> str:
    parts = [
        c.get("name", ""),
        c.get("label", ""),
        c.get("superClass", ""),
        c.get("description", ""),
        c.get("scope", ""),
        c.get("managedByGroup", ""),
    ]
    return " ".join(filter(None, parts))


def _cmdb_ident_doc_text(ident: dict) -> str:
    parts = [
        ident.get("name", ""),
        ident.get("appliesTo", ""),
    ]
    for e in (ident.get("entries") or []):
        parts.extend([
            e.get("searchTable", ""),
            e.get("mainTable", ""),
            " ".join(e.get("attributes") or []),
            " ".join(e.get("mainAttributes") or []),
            " ".join(e.get("hybridAttributes") or []),
        ])
    return " ".join(filter(None, parts))


def _cmdb_rel_doc_text(r: dict) -> str:
    parts = [
        r.get("name", ""),
        r.get("parentDescriptor", ""),
        r.get("childDescriptor", ""),
    ]
    return " ".join(filter(None, parts))


def _cmdb_recon_doc_text(rd: dict) -> str:
    parts = [
        rd.get("name", ""),
        rd.get("appliesTo", ""),
        rd.get("dataSource", ""),
        " ".join(rd.get("attributes") or []),
    ]
    return " ".join(filter(None, parts))


def _flatten_mid_server(data: dict) -> list[dict]:
    """Decompose mid_server.json into searchable section documents."""
    ov = data.get("overview", {})
    sections = []

    def _sec(sid, title, *text_parts):
        body = " ".join(str(p) for p in text_parts if p)
        sections.append({"sectionId": sid, "title": title, "body": body})

    # Overview
    _sec("overview", "MID Server Overview",
         ov.get("fullName"), ov.get("summary"), ov.get("eccModel"),
         " ".join(ov.get("keyFacts", [])))

    # Capabilities
    for cap in data.get("capabilities", []):
        _sec(f"cap_{cap['id']}", f"MID Server Capability: {cap['name']}",
             cap.get("description"), " ".join(cap.get("details", [])))

    # Platforms
    plat = data.get("platforms", {})
    hw   = plat.get("hardware", {})
    os_names = " ".join(
        f"{o['name']} {' '.join(o.get('versions', []))}"
        for o in plat.get("operatingSystems", [])
    )
    _sec("platforms", "MID Server System Requirements",
         os_names, hw.get("cpu"), hw.get("memory"), hw.get("disk"), hw.get("notes"),
         plat.get("java", {}).get("version"), plat.get("java", {}).get("notes"))

    # Network
    net = data.get("network", {})
    port_text = " ".join(
        f"port {p['port']} {p['protocol']} {p['purpose']}"
        for p in net.get("outboundToTargets", [])
    )
    _sec("network", "MID Server Network and Ports",
         net.get("summary"), port_text, net.get("proxySupport"))

    # Security
    sec = data.get("security", {})
    _sec("security", "MID Server Security",
         sec.get("communication"), sec.get("instanceAccount"),
         sec.get("credentialStorage"), sec.get("serviceAccount"),
         " ".join(sec.get("notes", [])))

    # Configuration
    cfg = data.get("configuration", {})
    param_text = " ".join(
        f"{p['name']} {p['description']}" for p in cfg.get("parameters", [])
    )
    _sec("configuration", "MID Server Configuration config.xml",
         cfg.get("description"), param_text)

    # States
    states_text = " ".join(
        f"{s['name']} {s['description']}" for s in data.get("states", [])
    )
    _sec("states", "MID Server States Up Down Upgrading Testing Stopped Purged", states_text)

    # Clustering
    cl = data.get("clustering", {})
    _sec("clustering", "MID Server Clustering Affinity Pool HA",
         cl.get("summary"), cl.get("affinity", {}).get("description"),
         cl.get("pool", {}).get("description"), cl.get("ha"),
         " ".join(cl.get("notes", [])))

    # Lifecycle
    lc = data.get("lifecycle", {})
    inst_steps = " ".join(lc.get("installation", {}).get("steps", []))
    upgr = lc.get("upgrade", {})
    val  = lc.get("validation", {})
    _sec("lifecycle", "MID Server Installation Upgrade Validation Lifecycle",
         inst_steps, upgr.get("description"), " ".join(upgr.get("notes", [])),
         val.get("description"), " ".join(val.get("steps", [])))

    # Troubleshooting
    for i, ts in enumerate(data.get("troubleshooting", [])):
        _sec(f"ts_{i}", f"MID Server Troubleshooting: {ts['symptom']}",
             ts.get("symptom"), " ".join(ts.get("causes", [])), ts.get("resolution"))

    return sections


def _flatten_disco_runs(data: dict) -> list[dict]:
    """Decompose discovery_runs.json into per-CI + summary searchable documents."""
    docs: list[dict] = []
    run      = data.get("latestRun", {})
    schedule = data.get("schedule",  {})
    mid      = data.get("midServer", {})

    # Summary document
    ranges      = " ".join(r.get("range", "") for r in schedule.get("ipRanges", []))
    summary_body = " ".join(filter(None, [
        f"Discovery Run {run.get('number', '')}",
        f"schedule {schedule.get('name', '')}",
        f"state {run.get('state', '')}",
        f"MID Server {mid.get('name', '')} status {mid.get('status', '')}",
        f"version {mid.get('version', '')}",
        f"progress {run.get('progress', '')}",
        f"IP ranges {ranges}",
    ]))
    docs.append({
        "docType": "run_summary",
        "title":   f"Discovery Run {run.get('number', '')} — {run.get('state', '')}",
        "body":    summary_body,
        "_run":    run,
        "_schedule": schedule,
        "_mid":    mid,
    })

    # One document per discovered CI
    for ci in run.get("discoveredCIs", []):
        table     = ci.get("ciTable", "cmdb_ci")
        label     = table.replace("cmdb_ci_", "").replace("_", " ")
        details   = ci.get("classDetails") or {}
        # Include both key and value so BM25 can match "ram", "cpu", "disk", etc.
        detail_text = " ".join(
            f"{k} {v}" for k, v in details.items() if v
        )
        rel_text  = " ".join(
            f"{r.get('relType', '')} {r.get('ciName', '')}"
            for r in (ci.get("relations") or [])
        )
        body = " ".join(filter(None, [
            ci.get("name", ""),
            ci.get("ipAddress", ""),
            ci.get("fqdn", ""),
            table, label,
            ci.get("state", ""),
            detail_text,
            rel_text,
            f"run {run.get('number', '')}",
            f"schedule {schedule.get('name', '')}",
        ]))
        docs.append({
            "docType": "discovered_ci",
            "title":   f"Discovered CI: {ci.get('name', '?')} ({label}) IP {ci.get('ipAddress', '?')}",
            "body":    body,
            "_ci":     ci,
        })

    return docs


def _run_doc_text(doc: dict) -> str:
    return doc.get("title", "") + " " + doc.get("body", "")


def _prose_run_doc(doc: dict) -> str:
    if doc["docType"] == "run_summary":
        run      = doc["_run"]
        schedule = doc["_schedule"]
        mid      = doc["_mid"]
        ranges   = ", ".join(r.get("range", "") for r in schedule.get("ipRanges", []))
        cis      = run.get("discoveredCIs", [])
        ci_count = len(cis)
        return (
            f"**Discovery Run {run.get('number', '?')}** — State: {run.get('state', '?')} | "
            f"Progress: {run.get('progress', '?')}% | "
            f"CIs discovered: {ci_count} | "
            f"Schedule: {schedule.get('name', '?')} | IP Ranges: {ranges} | "
            f"MID Server: {mid.get('name', '?')} ({mid.get('status', '?')}, v{mid.get('version', '?')})"
        )

    ci    = doc["_ci"]
    table = ci.get("ciTable", "cmdb_ci")
    label = table.replace("cmdb_ci_", "").replace("_", " ").title()
    lines = [
        f"**{ci.get('name', '?')}** — {label} | "
        f"IP: {ci.get('ipAddress', '?')} | "
        f"State: {ci.get('state', '?')}"
    ]
    if ci.get("fqdn"):
        lines[0] += f" | FQDN: {ci['fqdn']}"

    details = ci.get("classDetails") or {}
    if details:
        detail_str = " | ".join(
            f"{k}: {v}" for k, v in list(details.items())[:6] if v
        )
        if detail_str:
            lines.append(f"  Details: {detail_str}")

    rels = ci.get("relations") or []
    if rels:
        rel_str = "; ".join(
            f"{r.get('relType', '')} → {r.get('ciName', '')}"
            for r in rels[:5]
        )
        lines.append(f"  Relations: {rel_str}")

    return "\n".join(lines)


# ── Data loading ──────────────────────────────────────────────────────────────

def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _load_data():
    """Load JSON files and build BM25 + semantic indices (runs once on first request)."""
    global _patterns, _classifiers, _credentials, _mid_sections, _mid_raw, _stages, _ire
    global _cmdb_classes, _cmdb_idents, _cmdb_rel_types, _cmdb_recon
    global _disco_run_docs, _disco_run_raw, _disco_run_ci_toks
    global _pat_bm25, _clf_bm25, _cred_bm25, _mid_bm25
    global _cmdb_cls_bm25, _cmdb_ident_bm25, _cmdb_rel_bm25, _cmdb_recon_bm25, _disco_run_bm25
    global _sem_model, _pat_embeddings, _clf_embeddings, _cred_embeddings, _mid_embeddings
    global _cmdb_cls_embeddings, _cmdb_ident_embeddings, _cmdb_rel_embeddings, _cmdb_recon_embeddings
    global _disco_run_embeddings

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

    # ── Credentials ──
    cred_path = _LOCAL_DIR / "credentials.json"
    if cred_path.exists():
        raw          = _read_json(cred_path)
        _credentials = raw.get("credentialTypes", [])
        LOG.info("Loaded %d credential types", len(_credentials))
    else:
        _credentials = []
        LOG.warning("No credentials.json found — credential context will be empty")

    # ── MID Server ──
    mid_path = _LOCAL_DIR / "mid_server.json"
    if mid_path.exists():
        _mid_raw      = _read_json(mid_path)
        _mid_sections = _flatten_mid_server(_mid_raw)
        LOG.info("Loaded %d MID Server sections", len(_mid_sections))
    else:
        _mid_raw      = {}
        _mid_sections = []
        LOG.warning("No mid_server.json found — MID Server context will be empty")

    # ── Static reference docs ──
    _stages = _read_json(_LOCAL_DIR / "stages.json")
    _ire    = _read_json(_LOCAL_DIR / "ire.json")

    # ── CMDB data ──
    cmdb_path = _DATA_DIR / "cmdb_classes.json"
    if cmdb_path.exists():
        raw             = _read_json(cmdb_path)
        _cmdb_classes   = raw.get("classes", [])
        _cmdb_idents    = raw.get("identifiers", [])
        _cmdb_rel_types = raw.get("relationTypes", [])
        _cmdb_recon     = raw.get("reconciliationDefinitions", [])
        LOG.info(
            "Loaded CMDB data for RAG: %d classes, %d identifiers, %d rel types, %d recon defs",
            len(_cmdb_classes), len(_cmdb_idents), len(_cmdb_rel_types), len(_cmdb_recon),
        )
    else:
        _cmdb_classes = _cmdb_idents = _cmdb_rel_types = _cmdb_recon = []
        LOG.warning("cmdb_classes.json not found — CMDB context will be empty")

    # ── Discovery Runs ──
    runs_path = _DATA_DIR / "discovery_runs.json"
    if runs_path.exists():
        _disco_run_raw  = _read_json(runs_path)
        _disco_run_docs = _flatten_disco_runs(_disco_run_raw)
        # Build a set of CI name/FQDN tokens for dynamic keyword matching
        ci_name_toks: set[str] = set()
        for doc in _disco_run_docs:
            if doc["docType"] == "discovered_ci":
                ci = doc["_ci"]
                ci_name_toks.update(_tokens(ci.get("name", "")))
                ci_name_toks.update(_tokens(ci.get("fqdn", "")))
        _disco_run_ci_toks = frozenset(ci_name_toks)
        LOG.info(
            "Loaded %d discovery run documents (%d CI name tokens for dynamic matching)",
            len(_disco_run_docs), len(_disco_run_ci_toks),
        )
    else:
        _disco_run_raw  = {}
        _disco_run_docs = []
        _disco_run_ci_toks = frozenset()
        LOG.warning("discovery_runs.json not found — discovery run context will be empty")

    # ── Tier 1: BM25 indices ──
    try:
        from rank_bm25 import BM25Okapi
        if _patterns:
            _pat_bm25 = BM25Okapi([_tokens(_pat_doc_text(p)) for p in _patterns])
        if _classifiers:
            _clf_bm25 = BM25Okapi([_tokens(_clf_doc_text(c)) for c in _classifiers])
        if _credentials:
            _cred_bm25 = BM25Okapi([_tokens(_cred_doc_text(ct)) for ct in _credentials])
        if _mid_sections:
            _mid_bm25 = BM25Okapi([_tokens(_mid_section_doc_text(s)) for s in _mid_sections])
        if _cmdb_classes:
            _cmdb_cls_bm25 = BM25Okapi([_tokens(_cmdb_class_doc_text(c)) for c in _cmdb_classes])
        if _cmdb_idents:
            _cmdb_ident_bm25 = BM25Okapi([_tokens(_cmdb_ident_doc_text(i)) for i in _cmdb_idents])
        if _cmdb_rel_types:
            _cmdb_rel_bm25 = BM25Okapi([_tokens(_cmdb_rel_doc_text(r)) for r in _cmdb_rel_types])
        if _cmdb_recon:
            _cmdb_recon_bm25 = BM25Okapi([_tokens(_cmdb_recon_doc_text(rd)) for rd in _cmdb_recon])
        if _disco_run_docs:
            _disco_run_bm25 = BM25Okapi([_tokens(_run_doc_text(d)) for d in _disco_run_docs])
        LOG.info(
            "BM25 indices built (%d patterns, %d classifiers, %d credentials, %d MID sections, "
            "%d CMDB classes, %d identifiers, %d rel types, %d recon defs, %d disco run docs)",
            len(_patterns), len(_classifiers), len(_credentials), len(_mid_sections),
            len(_cmdb_classes), len(_cmdb_idents), len(_cmdb_rel_types), len(_cmdb_recon),
            len(_disco_run_docs),
        )
    except ImportError:
        LOG.warning("rank-bm25 not installed — falling back to keyword search. Run: pip install rank-bm25")

    # ── Tier 2: Semantic embeddings (graceful degradation) ──
    try:
        from sentence_transformers import SentenceTransformer
        _sem_model = SentenceTransformer("all-MiniLM-L6-v2")
        LOG.info(
            "Encoding %d patterns + %d classifiers + %d credentials + CMDB data for semantic search…",
            len(_patterns), len(_classifiers), len(_credentials),
        )
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
        if _credentials:
            _cred_embeddings = _sem_model.encode(
                [_cred_doc_text(ct) for ct in _credentials],
                convert_to_numpy=True, show_progress_bar=False,
            )
        if _mid_sections:
            _mid_embeddings = _sem_model.encode(
                [_mid_section_doc_text(s) for s in _mid_sections],
                convert_to_numpy=True, show_progress_bar=False,
            )
        if _cmdb_classes:
            _cmdb_cls_embeddings = _sem_model.encode(
                [_cmdb_class_doc_text(c) for c in _cmdb_classes],
                convert_to_numpy=True, show_progress_bar=False,
            )
        if _cmdb_idents:
            _cmdb_ident_embeddings = _sem_model.encode(
                [_cmdb_ident_doc_text(i) for i in _cmdb_idents],
                convert_to_numpy=True, show_progress_bar=False,
            )
        if _cmdb_rel_types:
            _cmdb_rel_embeddings = _sem_model.encode(
                [_cmdb_rel_doc_text(r) for r in _cmdb_rel_types],
                convert_to_numpy=True, show_progress_bar=False,
            )
        if _cmdb_recon:
            _cmdb_recon_embeddings = _sem_model.encode(
                [_cmdb_recon_doc_text(rd) for rd in _cmdb_recon],
                convert_to_numpy=True, show_progress_bar=False,
            )
        if _disco_run_docs:
            _disco_run_embeddings = _sem_model.encode(
                [_run_doc_text(d) for d in _disco_run_docs],
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


def _search_credentials(query: str, limit: int = 5) -> list:
    return _hybrid_search(query, _credentials, _cred_bm25, _cred_embeddings, _cred_doc_text, limit)


def _search_mid_sections(query: str, limit: int = 6) -> list:
    return _hybrid_search(query, _mid_sections, _mid_bm25, _mid_embeddings, _mid_section_doc_text, limit)


def _search_cmdb_classes(query: str, limit: int = 8) -> list:
    return _hybrid_search(query, _cmdb_classes, _cmdb_cls_bm25, _cmdb_cls_embeddings, _cmdb_class_doc_text, limit)


def _search_cmdb_idents(query: str, limit: int = 6) -> list:
    return _hybrid_search(query, _cmdb_idents, _cmdb_ident_bm25, _cmdb_ident_embeddings, _cmdb_ident_doc_text, limit)


def _search_cmdb_rel_types(query: str, limit: int = 10) -> list:
    return _hybrid_search(query, _cmdb_rel_types, _cmdb_rel_bm25, _cmdb_rel_embeddings, _cmdb_rel_doc_text, limit)


def _search_cmdb_recon(query: str, limit: int = 6) -> list:
    return _hybrid_search(query, _cmdb_recon, _cmdb_recon_bm25, _cmdb_recon_embeddings, _cmdb_recon_doc_text, limit)


def _search_disco_runs(query: str, limit: int = 8) -> list:
    return _hybrid_search(query, _disco_run_docs, _disco_run_bm25, _disco_run_embeddings, _run_doc_text, limit)


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


def _prose_mid_section(s: dict) -> str:
    title = f"**{s.get('title', '?')}**"
    body  = (s.get("body") or "").strip()
    if len(body) > 400:
        body = body[:397] + "…"
    return f"{title}\n  {body}" if body else title


def _prose_credential(ct: dict) -> str:
    name = f"**{ct.get('name', '?')}**"
    cid  = ct.get("id", "")
    if cid:
        name += f" (`{cid}`)"

    attrs = []
    if ct.get("protocols"):
        attrs.append(f"Protocols: {', '.join(ct['protocols'])}")
    if ct.get("ports"):
        attrs.append(f"Ports: {', '.join(ct['ports'])}")
    if ct.get("usedFor"):
        attrs.append(f"Used for: {', '.join(ct['usedFor'][:3])}")

    lines = [(name + " — " + " | ".join(attrs)) if attrs else name]

    desc = (ct.get("description") or "").strip()
    if desc:
        if len(desc) > 150:
            desc = desc[:147] + "…"
        lines.append(f"  Description: {desc}")

    req_fields = [f for f in (ct.get("fields") or []) if f.get("required")]
    if req_fields:
        labels = ", ".join(f.get("label", "") for f in req_fields)
        lines.append(f"  Required fields: {labels}")

    perms = ct.get("requiredPermissions", [])
    if perms:
        lines.append(f"  Permissions: {'; '.join(perms[:2])}")

    notes = ct.get("notes", [])
    if notes:
        lines.append(f"  Notes: {'; '.join(notes[:2])}")

    return "\n".join(lines)


def _prose_cmdb_class(c: dict) -> str:
    name = f"**{c.get('label') or c.get('name', '?')}**"
    if c.get("name"):
        name += f" (`{c['name']}`)"

    flags = []
    if c.get("principalClass"):
        flags.append("Principal")
    if c.get("isExtendable"):
        flags.append("Extendable")
    if c.get("superClass"):
        flags.append(f"Extends: {c['superClass']}")
    if c.get("scope"):
        flags.append(f"Scope: {c['scope']}")
    if c.get("fieldCount"):
        flags.append(f"Fields: {c['fieldCount']}")

    line = name
    if flags:
        line += " — " + " | ".join(flags)

    desc = (c.get("description") or "").strip()
    if desc:
        if len(desc) > 130:
            desc = desc[:127] + "…"
        line += f"\n  {desc}"

    return line


def _prose_cmdb_ident(ident: dict) -> str:
    name = f"**{ident.get('name', '?')}**"
    attrs = []
    if ident.get("appliesTo"):
        attrs.append(f"Class: {ident['appliesTo']}")
    if ident.get("independent"):
        attrs.append("Independent")
    if ident.get("active") is False:
        attrs.append("INACTIVE")

    lines = [(name + " — " + " | ".join(attrs)) if attrs else name]

    for e in (ident.get("entries") or [])[:3]:
        entry_parts = []
        if e.get("searchTable"):
            entry_parts.append(f"table: {e['searchTable']}")
        if e.get("mainAttributes"):
            entry_parts.append(f"main: {', '.join(e['mainAttributes'][:4])}")
        if e.get("attributes"):
            entry_parts.append(f"attrs: {', '.join(e['attributes'][:4])}")
        if entry_parts:
            lines.append(f"  Entry: " + " | ".join(entry_parts))

    return "\n".join(lines)


def _prose_cmdb_rel_type(r: dict) -> str:
    name = f"**{r.get('name', '?')}**"
    parts = []
    if r.get("parentDescriptor"):
        parts.append(f"Parent: \"{r['parentDescriptor']}\"")
    if r.get("childDescriptor"):
        parts.append(f"Child: \"{r['childDescriptor']}\"")
    return name + (" — " + " | ".join(parts) if parts else "")


def _prose_cmdb_recon(rd: dict) -> str:
    name = f"**{rd.get('name', '?')}**"
    attrs = []
    if rd.get("appliesTo"):
        attrs.append(f"Class: {rd['appliesTo']}")
    if rd.get("dataSource"):
        attrs.append(f"Source: {rd['dataSource']}")
    if rd.get("priority") is not None:
        attrs.append(f"Priority: {rd['priority']}")
    if rd.get("active") is False:
        attrs.append("INACTIVE")

    lines = [(name + " — " + " | ".join(attrs)) if attrs else name]

    fields = (rd.get("attributes") or [])[:5]
    if fields:
        lines.append(f"  Attributes: {', '.join(fields)}")

    return "\n".join(lines)


# ── System prompt ─────────────────────────────────────────────────────────────

_BASE_SYSTEM = """\
You are an expert assistant for ServiceNow Discovery and CMDB — the ITOM modules that \
automatically discover infrastructure and populate the Configuration Management Database. \
You help developers, consultants, and administrators understand Discovery patterns, stages, \
classifiers, probes, sensors, the IRE (Identification and Reconciliation Engine), CMDB CI \
classes, identification rules, relation types, and reconciliation definitions.

STRICT RULES — follow these exactly:
1. Answer questions ONLY using the data provided in the sections below.
2. Do NOT use general training knowledge about ServiceNow or any other topic.
3. If the answer cannot be found in the data below, respond with:
   "I don't have that information in the loaded data. For this topic, please refer to \
the official ServiceNow documentation: https://www.servicenow.com/docs/"
4. Never guess, infer, or fabricate details not present in the data.
5. Cite pattern names, CI class names, and IDs when relevant.
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

    if query_toks & _CRED_KWORDS:
        creds = _search_credentials(query)
        if creds:
            body = "\n".join(_prose_credential(ct) for ct in creds)
            parts.append(f"## Relevant Discovery Credentials ({len(creds)} matched)\n{body}")

    if query_toks & _MID_KWORDS:
        mid_hits = _search_mid_sections(query)
        if mid_hits:
            body = "\n".join(_prose_mid_section(s) for s in mid_hits)
            parts.append(f"## MID Server Reference ({len(mid_hits)} sections matched)\n{body}")

    # CMDB context — injected when query relates to CI classes, identifiers, relations, or recon
    if query_toks & _CMDB_CLASS_KWORDS:
        hits = _search_cmdb_classes(query)
        if hits:
            body = "\n".join(_prose_cmdb_class(c) for c in hits)
            parts.append(f"## CMDB CI Classes ({len(hits)} matched)\n{body}")

    if query_toks & _CMDB_IDENT_KWORDS:
        hits = _search_cmdb_idents(query)
        if hits:
            body = "\n".join(_prose_cmdb_ident(i) for i in hits)
            parts.append(f"## CMDB Identification Rules ({len(hits)} matched)\n{body}")

    if query_toks & _CMDB_REL_KWORDS and _cmdb_rel_types:
        # Only 52 relation types total — include all of them when the topic is relevant
        hits = _cmdb_rel_types
        body = "\n".join(_prose_cmdb_rel_type(r) for r in hits)
        parts.append(f"## CMDB Relation Types (all {len(hits)})\n{body}")

    if query_toks & _CMDB_RECON_KWORDS:
        hits = _search_cmdb_recon(query)
        if hits:
            body = "\n".join(_prose_cmdb_recon(rd) for rd in hits)
            parts.append(f"## CMDB Reconciliation Definitions ({len(hits)} matched)\n{body}")

    if (query_toks & _DISCO_RUN_KWORDS or query_toks & _disco_run_ci_toks) and _disco_run_docs:
        hits = _search_disco_runs(query)
        if hits:
            # Always ensure the run summary is first
            summary_docs = [d for d in hits if d["docType"] == "run_summary"]
            ci_docs      = [d for d in hits if d["docType"] == "discovered_ci"]
            ordered      = summary_docs + ci_docs
            body = "\n".join(_prose_run_doc(d) for d in ordered)
            run_num = (_disco_run_raw or {}).get("latestRun", {}).get("number", "?")
            parts.append(
                f"## Latest Discovery Run ({run_num}) — {len(ci_docs)} CI(s) matched\n{body}"
            )

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
