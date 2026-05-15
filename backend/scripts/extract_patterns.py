#!/usr/bin/env python3
"""
ITOM Pattern Configuration Extractor

Connects to a ServiceNow instance and produces ONE self-contained JSON file
that represents every pattern, shared library, and extension section.

Shared objects (sensor scripts used by multiple patterns, delete strategies)
are stored ONCE in top-level lookup maps and cross-referenced by ID from
each pattern entry.

Output structure:
  {
    "meta":             { instance, extractedAt, counts },
    "patterns":         [ { ... per-pattern object ... } ],
    "prepostScripts":   { "<sys_id>": { id, name, phase, script, usedByPatternIds } },
    "deleteStrategies": { "<sys_id>": { id, name, script } }
  }

Each pattern object is fully self-contained:
  - prepostScripts   : inline array (script body included); isShared/sharedWithPatternIds
                       tell you when a script is reused across patterns
  - ciMappings       : includes deleteStrategyId + deleteStrategyName for quick display
  - extensionSections: forward refs  (patternId, patternName, order)
  - isExtensionOf    : back-refs     (patternId, patternName)
  - triggerRules     : asParent / asChild arrays
  - launchParams, discoveryProbes, trackedFiles: embedded

Usage:
    python extract_patterns.py \\
        --url  https://<instance>.service-now.com \\
        --user <user> \\
        [--password <pass>] \\
        [--output scripts/data/patterns_all.json] \\
        [--scope sn_itom_pattern]
"""
from __future__ import annotations

import argparse
import getpass
import json
import logging
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

LOG = logging.getLogger("pattern_extractor")


# ── Type / category constants ─────────────────────────────────────────────────

CPATTERN_TYPE_LABEL: dict[str, str] = {
    "1": "Application",
    "2": "Cloud",
    "3": "Infrastructure",
    "4": "Shared Library",
}

DELETION_STRATEGY_LABEL: dict[str, str] = {
    "1": "Keep",
    "2": "Delete",
    "3": "Mark as Absent",
    "4": "Delete Relations",
    "5": "Mark as Retired",
}

CATEGORY_COLOR: dict[str, str] = {
    "Application":    "#10b981",
    "Cloud":          "#3b82f6",
    "Infrastructure": "#64748b",
    "Library":        "#8b5cf6",
    "Other":          "#6b7280",
}

# CI class prefixes that signal a cloud-platform resource
# NOTE: cmdb_ci_appl_generic is intentionally excluded — it is a generic
# placeholder used by Shared Library patterns and carries no cloud signal.
_CLOUD_CI_PREFIXES = (
    "cmdb_ci_cloud_", "cmdb_ci_cmp_",
    "cmdb_ci_aws_",   "cmdb_ci_ec2_",
    "cmdb_ci_azure_",
    "cmdb_ci_gcp_",   "cmdb_ci_google_",
    "cmdb_ci_alibaba_",
    "cmdb_ci_oci_",
)

# Pattern name prefixes (lower-cased) that signal a cloud-platform pattern
_CLOUD_NAME_PREFIXES = (
    "amazon", "aws ", "azure", "google cloud", "gcp ",
    "alibaba", "oracle cloud", "oracle oci", "oci ", "openstack",
    "vmware cloud", "nutanix", "huawei cloud",
)

# Pattern name prefixes that signal on-prem infrastructure tooling
_INFRA_NAME_PREFIXES = ("rubrik", "infinibox")


def _effective_category(ctype_label: str, main_ci: str, pattern_name: str) -> str:
    """Derive display category from pattern type, CI class, and name.

    For Shared Library (LP) patterns the cpattern_type is always 4, so we
    inspect main_ci and the pattern name to find the actual domain.
    """
    if ctype_label == "Application":    return "Application"
    if ctype_label == "Cloud":          return "Cloud"
    if ctype_label == "Infrastructure": return "Infrastructure"
    if ctype_label != "Shared Library": return "Other"

    ci   = (main_ci or "").lower()
    name = (pattern_name or "").lower()

    if any(ci.startswith(p) for p in _CLOUD_CI_PREFIXES):   return "Cloud"
    if any(name.startswith(p) for p in _CLOUD_NAME_PREFIXES): return "Cloud"
    if ci.startswith("cmdb_ci_appl_") and ci != "cmdb_ci_appl_generic": return "Application"
    if ci.startswith(("cmdb_ci_netw", "cmdb_ci_ip_", "cmdb_ci_computer",
                       "cmdb_ci_server", "cmdb_ci_win_", "cmdb_ci_linux_",
                       "cmdb_ci_unix_", "cmdb_ci_infinibox_", "cmdb_ci_storage_",
                       "cmdb_ci_nas_", "cmdb_ci_file_system")):
        return "Infrastructure"
    if any(name.startswith(p) for p in _INFRA_NAME_PREFIXES): return "Infrastructure"
    return "Library"


# ── NDL parser ────────────────────────────────────────────────────────────────

def _scalar(block: str, key: str) -> str | None:
    m = re.search(rf'\b{re.escape(key)}\s*=\s*"([^"]*)"', block)
    return m.group(1) if m else None


def _find_blocks(text: str, block_name: str) -> list[str]:
    """Return bodies of every `block_name { … }` in text, brace-balanced."""
    out: list[str] = []
    needle = block_name
    i = 0
    while True:
        idx = text.find(needle, i)
        if idx < 0:
            break
        # word-boundary check: char before must not be identifier char
        if idx > 0 and (text[idx - 1].isalnum() or text[idx - 1] == "_"):
            i = idx + len(needle)
            continue
        # skip whitespace after needle, expect '{'
        j = idx + len(needle)
        while j < len(text) and text[j] in " \t\r\n":
            j += 1
        if j >= len(text) or text[j] != "{":
            i = idx + len(needle)
            continue
        # walk balanced braces
        depth, k = 1, j + 1
        while k < len(text) and depth:
            if   text[k] == "{": depth += 1
            elif text[k] == "}": depth -= 1
            k += 1
        out.append(text[j + 1 : k - 1])
        i = k
    return out


def _scalar_any(block: str, key: str) -> str | None:
    """Match quoted OR bare-identifier value after key=."""
    m = re.search(rf'\b{re.escape(key)}\s*=\s*"([^"]*)"', block)
    if m:
        return m.group(1)
    m = re.search(rf'\b{re.escape(key)}\s*=\s*([A-Z_a-zA-Z0-9.*-]+)', block)
    return m.group(1) if m else None


def _attr_value(block: str) -> str | None:
    """Extract a connection attribute value — returns literal, ${var}, or <expr>."""
    # Literal string: value = "..."
    m = re.search(r'\bvalue\s*=\s*"([^"]*)"', block)
    if m:
        return m.group(1)
    # get_attr { "var.path" }  → ${var.path}
    m = re.search(r'\bvalue\s*=\s*get_attr\s*\{\s*"([^"]*)"\s*\}', block)
    if m:
        return f'${{{m.group(1)}}}'
    # any other complex expression (concat, eval …)
    m = re.search(r'\bvalue\s*=\s*([a-z_]+)\s*\{', block)
    if m:
        return f'<{m.group(1)}>'
    return None


def _parse_connection_block(body: str) -> dict:
    """Parse one top-level connection { } block from NDL."""
    creates = []
    for cc in _find_blocks(body, "create_connection"):
        attrs: dict[str, str] = {}
        for ab in _find_blocks(cc, "attribute"):
            k = _scalar(ab, "name")
            v = _attr_value(ab)
            if k is not None:
                attrs[k] = v or ""
        creates.append({
            "connectionType": _scalar_any(cc, "connection_type"),
            "targetCiType":   _scalar(cc, "target_ci_type"),
            "entryPointType": _scalar(cc, "entry_point_type"),
            "isArtificial":   _scalar(cc, "is_artificial") != "true",
            "trafficBased":   _scalar(cc, "traffic_based") == "true",
            "attributes":     attrs,
        })
    return {
        "name":              _scalar(body, "name"),
        "stepCount":         len(_find_blocks(body, "step")),
        "createConnections": creates,
    }


def _parse_identification_meta(ndl: str) -> list[dict]:
    """Extract all identification blocks from the NDL (a pattern may have several)."""
    ident_bodies = _find_blocks(ndl, "identification")
    if not ident_bodies:
        return []

    # apply_to_os_families lives in the pattern-level metadata, shared by all idents
    applies_to = None
    for meta in _find_blocks(ndl, "metadata"):
        applies_to = _scalar(meta, "apply_to_os_families")
        if applies_to:
            break

    result = []
    for body in ident_bodies:
        ep_type = None
        for ep in _find_blocks(body, "entry_point"):
            ep_type = _scalar_any(ep, "type")
            if ep_type:
                break

        strategy = None
        for fps in _find_blocks(body, "find_process_strategy"):
            strategy = _scalar_any(fps, "strategy")
            if strategy:
                break

        result.append({
            "name":            _scalar(body, "name"),
            "entryPointType":  ep_type,
            "processStrategy": strategy,
            "appliesToFamily": applies_to,
        })

    return result


def _table_type(name: str) -> str:
    if name.startswith("cmdb_ci_"):
        return "cmdb_ci"
    if name.startswith("cmdb_"):
        return "cmdb"
    return "temp"


# Matches  var_names / to_var_names = table { ... }  (no nested braces inside table{})
_VAR_TABLE_RE = re.compile(
    r'(?:var_names|to_var_names|result_var_names)\s*=\s*table\s*\{([^}]*)\}',
    re.DOTALL,
)


def _extract_var_tables(text: str) -> list[tuple[str, list[str]]]:
    """Return (table_name, [col, ...]) for every var/to_var table literal in text."""
    results = []
    for m in _VAR_TABLE_RE.finditer(text):
        body = m.group(1)
        name_m = re.search(r'\bname\s*=\s*"([^"]*)"', body)
        if not name_m:
            continue
        tbl = name_m.group(1).strip()
        if not tbl:
            continue
        col_m = re.search(r'\bcol_names\s*=\s*', body)
        cols: list[str] = []
        if col_m:
            cols = re.findall(r'"([^"]*)"', body[col_m.end():])
        results.append((tbl, cols))
    return results


def _parse_transform(body: str) -> dict:
    fields = [
        _scalar(sf, "field_name")
        for sf in _find_blocks(body, "set_field")
        if _scalar(sf, "field_name")
    ]
    return {
        "type":        "transform",
        "srcTable":    _scalar(body, "src_table_name"),
        "targetTable": _scalar(body, "target_table_name"),
        "setFields":   fields,
    }


def _parse_relation_reference(body: str) -> dict:
    return {
        "type":             "relation_reference",
        "table1":           _scalar(body, "table1_name"),
        "key1":             _scalar(body, "key1_name"),
        "table2":           _scalar(body, "table2_name"),
        "key2":             _scalar(body, "key2_name"),
        "resultTable":      _scalar(body, "result_table_name"),
        "refDirection":     _scalar(body, "ref_direction"),
        "refField":         _scalar(body, "ref_field_name"),
        "relationshipType": _scalar(body, "relation_type"),
    }


def _parse_create_relation(body: str) -> dict:
    return {
        "type":        "create_relation",
        "table1":      _scalar(body, "table1_name"),
        "key1":        _scalar(body, "key1_name"),
        "table2":      _scalar(body, "table2_name"),
        "key2":        _scalar(body, "key2_name"),
        "relType":     _scalar(body, "rel_type"),
        "resultTable": _scalar(body, "result_table_name"),
    }


def _parse_custom_operation(body: str) -> dict:
    attrs: dict[str, str] = {}
    for ab in _find_blocks(body, "attribute"):
        n = _scalar(ab, "name")
        v = _scalar(ab, "value")
        if n is not None:
            attrs[n] = v or ""
    return {
        "type":          "custom_operation",
        "sysIdOp":       _scalar(body, "sys_id_op"),
        "targetTable":   attrs.get("table_name"),
        "targetColumns": attrs.get("target_columns"),
        "attributes":    attrs,
    }


def _parse_filter(body: str) -> dict:
    return {
        "type":        "filter",
        "srcTable":    _scalar(body, "src_table_name"),
        "targetTable": _scalar(body, "target_table_name"),
    }


def _parse_merge(body: str) -> dict:
    return {
        "type":        "merge",
        "table1":      _scalar(body, "table1_name"),
        "table2":      _scalar(body, "table2_name"),
        "key1":        _scalar(body, "key1_name"),
        "key2":        _scalar(body, "key2_name"),
        "resultTable": _scalar(body, "result_table_name"),
    }


def _parse_union(body: str) -> dict:
    return {
        "type":        "union",
        "table1":      _scalar(body, "table1_name"),
        "table2":      _scalar(body, "table2_name"),
        "resultTable": _scalar(body, "result_table_name"),
    }


def _parse_set_attr(body: str) -> dict:
    first_q = re.search(r'"([^"]*)"', body)
    return {
        "type": "set_attr",
        "attr": first_q.group(1) if first_q else None,
    }


def _parse_match(body: str) -> dict:
    return {
        "type":        "match",
        "srcTable":    _scalar(body, "src_table_name"),
        "targetTable": _scalar(body, "target_table_name"),
    }


def _parse_parse_op(op_type: str):
    def _p(body: str) -> dict:
        return {
            "type":     op_type,
            "srcVar":   _scalar(body, "from_var_name") or _scalar(body, "src_var_name"),
            "srcTable": _scalar(body, "src_table_name"),
        }
    return _p


def _parse_runcmd_to_var(body: str) -> dict:
    return {
        "type":    "runcmd_to_var",
        "command": _scalar(body, "cmd") or _scalar(body, "command_value"),
    }


def _parse_generic(op_type: str):
    def _p(_body: str) -> dict:
        return {"type": op_type}
    return _p


_OP_PARSERS: list[tuple[str, Any]] = [
    ("transform",                _parse_transform),
    ("relation_reference",       _parse_relation_reference),
    ("create_relation",          _parse_create_relation),
    ("custom_operation",         _parse_custom_operation),
    ("filter",                   _parse_filter),
    ("merge",                    _parse_merge),
    ("union",                    _parse_union),
    ("runcmd_to_var",            _parse_runcmd_to_var),
    ("parse_xml_file_to_var",    _parse_parse_op("parse_xml_file_to_var")),
    ("parse_text_file_to_var",   _parse_parse_op("parse_text_file_to_var")),
    ("parse_url_to_var",         _parse_parse_op("parse_url_to_var")),
    ("parse_var_to_var",         _parse_parse_op("parse_var_to_var")),
    ("find_registry_val_to_var", _parse_parse_op("find_registry_val_to_var")),
    ("set_attr",                 _parse_set_attr),
    ("match",                    _parse_match),
    ("if",                       _parse_generic("if")),
    ("change_user",              _parse_generic("change_user")),
    ("unchange_user",            _parse_generic("unchange_user")),
    ("put_file",                 _parse_generic("put_file")),
    ("create_connection",        _parse_generic("create_connection")),
]


def _add_table(tables: dict, name: str, cols: list[str], src: str | None = None) -> None:
    t = tables.setdefault(name, {
        "table": name, "tableType": _table_type(name),
        "columns": set(), "sourceTables": set(),
    })
    for c in cols:
        if c:
            t["columns"].add(c)
    if src:
        t["sourceTables"].add(src)


def parse_ndl(ndl: str) -> dict:
    """Parse NDL text into structured steps / tablesPopulated / relations."""
    if not ndl:
        return {"steps": [], "tablesPopulated": [], "relations": []}

    steps:     list[dict]      = []
    tables:    dict[str, dict] = {}
    relations: list[dict]      = []

    for step_body in _find_blocks(ndl, "step"):
        nm  = re.search(r'\bname\s*=\s*"([^"]*)"', step_body)
        ops: list[dict] = []

        for kind, parser in _OP_PARSERS:
            for body in _find_blocks(step_body, kind):
                op = parser(body)
                ops.append(op)

                if kind == "transform" and op.get("targetTable"):
                    _add_table(tables, op["targetTable"],
                               op.get("setFields") or [],
                               op.get("srcTable"))

                elif kind == "custom_operation" and op.get("targetTable"):
                    cols = [
                        c.split(":", 1)[0].strip()
                        for c in (op.get("targetColumns") or "").split(",")
                    ]
                    _add_table(tables, op["targetTable"], cols)

                elif kind == "filter" and op.get("targetTable"):
                    _add_table(tables, op["targetTable"], [],
                               op.get("srcTable"))

                elif kind == "merge" and op.get("resultTable"):
                    _add_table(tables, op["resultTable"], [])

                elif kind == "union" and op.get("resultTable"):
                    _add_table(tables, op["resultTable"], [])

                # Capture var-table literals embedded in any op body
                for tbl, cols in _extract_var_tables(body):
                    _add_table(tables, tbl, cols)

                if kind in ("relation_reference", "create_relation"):
                    relations.append(op)

        # Also pick up var-table literals defined at step level (outside op blocks)
        for tbl, cols in _extract_var_tables(step_body):
            _add_table(tables, tbl, cols)

        steps.append({"name": nm.group(1) if nm else None, "operations": ops})

    connections = [_parse_connection_block(b) for b in _find_blocks(ndl, "connection")]

    return {
        "identifications": _parse_identification_meta(ndl),
        "connections": connections,
        "steps": steps,
        "tablesPopulated": [
            {
                "table":        t["table"],
                "tableType":    t["tableType"],
                "columns":      sorted(t["columns"]),
                "sourceTables": sorted(t["sourceTables"]),
            }
            for t in tables.values()
        ],
        "relations": relations,
    }


def _suppress_library_connections(ndl_data: dict, ctype_code: str, ndl_raw: str) -> dict:
    """Shared Library (LP) patterns — Pattern Designer never shows connection sections.
    Clear connections so the UI stays consistent with what ServiceNow exposes."""
    is_shared_lib = ctype_code == "4" or ndl_raw.lstrip().startswith("library")
    if is_shared_lib:
        ndl_data = {**ndl_data, "connections": []}
    return ndl_data


# ── ServiceNow client helpers ─────────────────────────────────────────────────

def _require_pysnow():
    try:
        import pysnow  # noqa: F401
    except ImportError as exc:
        raise SystemExit("pysnow not installed.  Run:  pip install pysnow") from exc
    return pysnow


def make_client(url: str, user: str, password: str):
    pysnow = _require_pysnow()
    host = url.replace("https://", "").replace("http://", "").rstrip("/")
    return pysnow.Client(
        host=host, user=user, password=password,
        request_params={
            "sysparm_display_value": "all",
            "sysparm_exclude_reference_link": "true",
        },
    )


def verify_auth(url: str, user: str, password: str) -> None:
    endpoint = (
        f"{url.rstrip('/')}/api/now/table/sys_properties"
        "?sysparm_limit=1&sysparm_fields=name"
    )
    try:
        resp = requests.get(endpoint, auth=(user, password), timeout=30)
    except requests.RequestException as exc:
        raise SystemExit(f"Cannot reach {url}: {exc}") from exc
    ct = resp.headers.get("Content-Type", "")
    if resp.text.lstrip().startswith("<") or "text/html" in ct:
        raise SystemExit(
            f"ServiceNow returned HTML (HTTP {resp.status_code}) — "
            "credentials rejected or URL wrong.\n"
            f"Tried: GET {endpoint}"
        )
    if resp.status_code == 401:
        raise SystemExit("HTTP 401 — check --user / --password.")
    resp.raise_for_status()
    LOG.info("Auth OK (HTTP %d)", resp.status_code)


# ── Field accessors for display_value=all responses ───────────────────────────

def _val(v: Any) -> str:
    """Return the raw `value` from a {value, display_value} dict, or str(v)."""
    if isinstance(v, dict):
        return str(v.get("value") or "")
    return str(v) if v is not None else ""


def _dv(v: Any) -> str:
    """Return the display_value (human label) of a reference field."""
    if isinstance(v, dict):
        return str(v.get("display_value") or v.get("value") or "")
    return str(v) if v is not None else ""


def _bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    return str(v).lower() in ("true", "1", "yes")


def _normalize(row: dict) -> dict:
    """Collapse {value, display_value} pairs: keep dict only when they differ."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, dict) and "value" in v:
            val, dv = v.get("value"), v.get("display_value")
            out[k] = {"value": val, "display_value": dv} if dv and dv != val else val
        else:
            out[k] = v
    return out


def fetch_all(client, table: str, query: Any = None) -> list[dict]:
    resource = client.resource(api_path=f"/table/{table}")
    rows = [_normalize(r) for r in resource.get(query=query or {}, stream=True).all()]
    LOG.info("  %-50s → %d rows", table, len(rows))
    return rows


# ── Phase detection for prepost scripts ──────────────────────────────────────

def _script_phase(r: dict) -> str:
    """Determine pre/post phase from when_to_exec, falling back to execution_type."""
    wte     = r.get("when_to_exec")
    wte_val = _val(wte)
    wte_lbl = _dv(wte).lower()
    if wte_val == "1" or "pre" in wte_lbl:   return "pre"
    if wte_val == "2" or "post" in wte_lbl:  return "post"
    # execution_type: 1=pre-sensor, 2=post-sensor
    return "pre" if _val(r.get("execution_type")) == "1" else "post"


# ── Secondary data fetch strategies ──────────────────────────────────────────

def _fetch_raw_bulk(args: argparse.Namespace) -> dict[str, list[dict]]:
    """Fetch all secondary tables globally then filter in memory.

    Best for full extractions (hundreds of patterns). Nine parallel requests,
    one per table, regardless of how many patterns are in scope.
    """
    SECONDARY = [
        "sa_pattern_prepost_script",
        "sa_ci_to_pattern",
        "sa_pattern_extension",
        "sn_pattern_trigger_rule",
        "discovery_ptrn_lnch_param_def_ext",
        "sa_cloud_topology_discovery_pattern",
        "sa_tracked_file_definition",
        "discovery_classifier_probe",
    ]

    def _fetch(table: str) -> tuple[str, list[dict]]:
        c = make_client(args.url, args.user, args.password)
        return table, fetch_all(c, table)

    LOG.info("Fetching %d secondary tables (bulk, parallel)…", len(SECONDARY))
    raw: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for table, rows in pool.map(_fetch, SECONDARY):
            raw[table] = rows
    return raw


def _fetch_raw_targeted(args: argparse.Namespace, ids: list[str]) -> dict[str, list[dict]]:
    """Fetch secondary data with targeted queries for a small set of pattern IDs.

    Best for single-pattern test/validate runs. Only fetches rows relevant to
    the given IDs — much faster than bulk when the set is small.
    """
    def _c():
        return make_client(args.url, args.user, args.password)

    def _or(field: str) -> str:
        return "^OR".join(f"{field}={i}" for i in ids)

    raw: dict[str, list[dict]] = {}

    # Tables with a direct `pattern` FK — simple OR query
    LOG.info("Fetching secondary tables (targeted, %d pattern IDs)…", len(ids))
    direct_tables = [
        "sa_ci_to_pattern",
        "discovery_ptrn_lnch_param_def_ext",
        "sa_cloud_topology_discovery_pattern",
        "sa_tracked_file_definition",
        "discovery_classifier_probe",
    ]

    def _fetch_direct(table: str) -> tuple[str, list[dict]]:
        return table, fetch_all(_c(), table, query=_or("pattern"))

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for table, rows in pool.map(_fetch_direct, direct_tables):
            raw[table] = rows

    # sa_pattern_extension: fetch both directions
    #   pattern=<id>  → extension sections this pattern uses
    #   extension=<id> → patterns that use this pattern as a section (isExtensionOf)
    ext_fwd = fetch_all(_c(), "sa_pattern_extension", query=_or("pattern"))
    ext_rev = fetch_all(_c(), "sa_pattern_extension", query=_or("extension"))
    seen_ext: set[str] = {_val(r.get("sys_id")) for r in ext_fwd}
    for r in ext_rev:
        if _val(r.get("sys_id")) not in seen_ext:
            ext_fwd.append(r)
    raw["sa_pattern_extension"] = ext_fwd

    # sn_pattern_trigger_rule: pattern appears in either column
    tr_parent = fetch_all(_c(), "sn_pattern_trigger_rule", query=_or("parent_pattern_id"))
    tr_child  = fetch_all(_c(), "sn_pattern_trigger_rule", query=_or("pattern_id"))
    seen_tr: set[str] = {_val(r.get("sys_id")) for r in tr_parent}
    merged_tr = list(tr_parent)
    for r in tr_child:
        if _val(r.get("sys_id")) not in seen_tr:
            merged_tr.append(r)
    raw["sn_pattern_trigger_rule"] = merged_tr

    # sa_pattern_prepost_script: `pattern` is a CSV — must query with LIKE per ID
    # then verify exact membership to avoid substring false-positives.
    pp_all: list[dict] = []
    pp_seen: set[str] = set()
    for sid in ids:
        pp_raw = fetch_all(_c(), "sa_pattern_prepost_script", query=f"patternLIKE{sid}")
        for r in pp_raw:
            csv = _val(r.get("pattern")) or ""
            if sid in {p.strip() for p in csv.split(",") if p.strip()}:
                script_id = _val(r.get("sys_id"))
                if script_id not in pp_seen:
                    pp_seen.add(script_id)
                    pp_all.append(r)
    raw["sa_pattern_prepost_script"] = pp_all

    return raw


# ── Core extraction ───────────────────────────────────────────────────────────

def extract(args: argparse.Namespace) -> dict:
    LOG.info("Connecting to %s", args.url)

    # ── 1. Fetch sa_pattern (primary table) ───────────────────────────────────

    target_ids: list[str] = []
    if args.pattern_sys_id:
        target_ids = [s.strip() for s in args.pattern_sys_id.split(",") if s.strip()]

    pat_query: Any = {}
    if target_ids:
        pat_query = "^OR".join(f"sys_id={i}" for i in target_ids)
    elif args.scope:
        pat_query = f"sys_scope.scope={args.scope}"
    elif args.active_only:
        pat_query = {"active": "true"}

    c = make_client(args.url, args.user, args.password)
    patterns = fetch_all(c, "sa_pattern", query=pat_query)
    pattern_ids = {_val(r.get("sys_id")) for r in patterns}
    LOG.info("Loaded %d patterns", len(patterns))

    # ── 2. Fetch secondary tables ─────────────────────────────────────────────
    #
    # Targeted mode  (≤ 20 patterns): per-table queries scoped to those IDs.
    #                                  Fast for single-pattern validation runs.
    # Bulk mode      (> 20 patterns): global fetch + in-memory filter.
    #                                  Fast for full extractions.

    if target_ids and len(target_ids) <= 20:
        raw = _fetch_raw_targeted(args, target_ids)
    else:
        raw = _fetch_raw_bulk(args)

    # ── 2. Group secondary rows by pattern sys_id ─────────────────────────────

    def _group(rows: list[dict], key: str = "pattern") -> dict[str, list[dict]]:
        g: dict[str, list[dict]] = {}
        for r in rows:
            pid = _val(r.get(key))
            if pid in pattern_ids:
                g.setdefault(pid, []).append(r)
        return g

    ci_by_pat   = _group(raw["sa_ci_to_pattern"])
    trig_parent = _group(raw["sn_pattern_trigger_rule"], "parent_pattern_id")
    trig_child  = _group(raw["sn_pattern_trigger_rule"], "pattern_id")
    lp_by_pat   = _group(raw["discovery_ptrn_lnch_param_def_ext"])
    topo_by_pat = {}
    for r in raw["sa_cloud_topology_discovery_pattern"]:
        pid = _val(r.get("pattern"))
        if pid and pid not in topo_by_pat:
            topo_by_pat[pid] = r
    tf_by_pat   = _group(raw["sa_tracked_file_definition"])
    cp_by_pat   = _group(raw["discovery_classifier_probe"])   # classifier probes

    # Extension relationships — both directions
    ext_sections:  dict[str, list[dict]] = {}  # parent → [extension link rows]
    ext_is_ext_of: dict[str, list[dict]] = {}  # extension pattern → [parent refs]
    for r in raw["sa_pattern_extension"]:
        parent_id   = _val(r.get("pattern"))
        parent_name = _dv(r.get("pattern"))
        ext_id      = _val(r.get("extension"))
        if parent_id in pattern_ids:
            ext_sections.setdefault(parent_id, []).append(r)
        if ext_id:
            ext_is_ext_of.setdefault(ext_id, []).append({
                "patternId":   parent_id,
                "patternName": parent_name,
            })

    extension_section_ids: set[str] = {
        _val(r.get("extension"))
        for r in raw["sa_pattern_extension"]
        if _val(r.get("extension"))
    }

    # ── 3. Prepost scripts ────────────────────────────────────────────────────
    #
    # `pattern` field is a comma-separated list of pattern sys_ids.
    # One script can legitimately belong to multiple patterns.

    prepost_by_id:  dict[str, dict]       = {}
    scripts_by_pat: dict[str, list[str]]  = {}  # pattern_id → [script_id, …]

    for r in raw["sa_pattern_prepost_script"]:
        sid  = _val(r.get("sys_id"))
        csv  = _val(r.get("pattern")) or ""
        pids = [p.strip() for p in csv.split(",") if p.strip()]

        # Only track patterns we actually loaded
        relevant = [p for p in pids if p in pattern_ids]

        prepost_by_id[sid] = {
            "id":               sid,
            "name":             _val(r.get("name")) or _dv(r.get("name")) or "",
            "phase":            _script_phase(r),
            "order":            _val(r.get("order")) or "0",
            "active":           _bool(r.get("active")),
            "usedByPatternIds": pids,   # all SN-declared patterns (including out-of-scope)
            "script":           _val(r.get("script")) or "",
        }
        for pid in relevant:
            scripts_by_pat.setdefault(pid, []).append(sid)

    # ── 4. Discovery probes ───────────────────────────────────────────────────
    #
    # discovery_classifier_probe.child is a reference to discovery_probes.
    # The display_value of child already carries the probe name — use it directly
    # rather than making an extra round-trip to discovery_probes.

    # ── 5. Delete strategies ──────────────────────────────────────────────────
    #
    # Collected from sa_ci_to_pattern.strategy_script, fetched in one batch.

    strategy_ids: set[str] = set()
    for rows in ci_by_pat.values():
        for r in rows:
            s = _val(r.get("strategy_script"))
            if s:
                strategy_ids.add(s)

    delete_strategies: dict[str, dict] = {}
    if strategy_ids:
        strat_q = "^OR".join(f"sys_id={s}" for s in sorted(strategy_ids))
        c = make_client(args.url, args.user, args.password)
        for r in fetch_all(c, "sn_discovery_delete_strategy", query=strat_q):
            sid = _val(r.get("sys_id"))
            delete_strategies[sid] = {
                "id":     sid,
                "name":   _val(r.get("name")) or _dv(r.get("name")) or "",
                "script": _val(r.get("script")) or "",
            }

    # ── 6. Build the pattern objects ──────────────────────────────────────────

    def _sort_order(s: int | str) -> int:
        try:
            return int(s)
        except (TypeError, ValueError):
            return 9999

    out_patterns: list[dict] = []

    for row in patterns:
        sid  = _val(row.get("sys_id"))
        name = _val(row.get("name")) or sid

        # NDL
        ndl_raw = row.get("ndl")
        if isinstance(ndl_raw, dict):
            ndl_raw = _val(ndl_raw)
        ndl_raw = ndl_raw or ""

        # NDL embedded name is authoritative — the DB name field is sometimes a
        # generic placeholder (e.g. "Horizontal Pattern") that doesn't reflect
        # the real pattern name stored inside the NDL metadata block.
        ndl_name = _scalar(ndl_raw, "name")
        if ndl_name:
            name = ndl_name

        # Category
        ctype_code  = _val(row.get("cpattern_type")) or ""
        ctype_label = CPATTERN_TYPE_LABEL.get(ctype_code, "Unknown")
        main_ci     = _val(row.get("ci_type")) or ""
        category    = _effective_category(ctype_label, main_ci, name)
        # NDL root keyword is the authoritative Library signal: ServiceNow sometimes
        # stores library patterns with cpattern_type=2/3 (Cloud/Infra) in the DB.
        if ndl_raw.lstrip().startswith("library"):
            category = "Library"

        # Discovery type (Horizontal / Top-Down)
        topo = topo_by_pat.get(sid)
        if topo:
            dt_code = _val(topo.get("discover_topology_type"))
            disc_type = "Top-Down" if dt_code in ("2", "3") else "Horizontal"
        else:
            disc_type = "Horizontal"
        # Application patterns are vertical by definition — always Top-Down
        if category == "Application":
            disc_type = "Top-Down"

        # CI mappings
        ci_mappings: list[dict] = []
        for r in sorted(
            ci_by_pat.get(sid, []),
            key=lambda r: (not _bool(r.get("is_main_ci")), _val(r.get("ci_type")))
        ):
            strat_id   = _val(r.get("strategy_script"))
            strat_code = _val(r.get("deletion_strategy"))
            ci_mappings.append({
                "ciType":               _val(r.get("ci_type")),
                "isMainCi":             _bool(r.get("is_main_ci")),
                "deletionStrategy":     strat_code,
                "deletionStrategyLabel": DELETION_STRATEGY_LABEL.get(strat_code, strat_code or "—"),
                "deleteStrategyId":     strat_id or None,
                "deleteStrategyName":   (delete_strategies[strat_id]["name"]
                                         if strat_id and strat_id in delete_strategies else None),
            })

        # Prepost scripts (inline, sorted pre→post then by order)
        script_ids = sorted(
            scripts_by_pat.get(sid, []),
            key=lambda s: (
                prepost_by_id.get(s, {}).get("phase") != "pre",
                _sort_order(prepost_by_id.get(s, {}).get("order", 0)),
            )
        )
        prepost_scripts: list[dict] = []
        for s_id in script_ids:
            sc = prepost_by_id.get(s_id)
            if not sc:
                continue
            shared_with = [p for p in sc["usedByPatternIds"] if p != sid]
            prepost_scripts.append({
                "id":                 s_id,
                "name":               sc["name"],
                "phase":              sc["phase"],
                "order":              sc["order"],
                "active":             sc["active"],
                "isShared":           len(sc["usedByPatternIds"]) > 1,
                "sharedWithPatternIds": shared_with,
                "script":             sc["script"],
            })

        # Extension sections this pattern includes
        ext_secs: list[dict] = []
        for e in sorted(ext_sections.get(sid, []), key=lambda r: _sort_order(_val(r.get("order")))):
            ext_secs.append({
                "patternId":   _val(e.get("extension")),
                "patternName": _dv(e.get("extension")),
                "order":       _val(e.get("order")),
            })


        # Trigger rules
        def _trig(r: dict, id_key: str) -> dict:
            return {
                "patternId":       _val(r.get(id_key)),
                "patternName":     _dv(r.get(id_key)),
                "batchSize":       _val(r.get("batch_size")) or "1",
                "useFilterScript": _bool(r.get("use_filter_script")),
                "script":          _val(r.get("script")) or "",
            }

        # Launch parameters
        launch_params: list[dict] = []
        for lp in lp_by_pat.get(sid, []):
            attrs_raw = _val(lp.get("ci_attributes")) or ""
            launch_params.append({
                "id":           _val(lp.get("sys_id")),
                "ciClass":      _val(lp.get("ci_class")),
                "key":          _val(lp.get("key")),
                "ciAttributes": [a.strip() for a in attrs_raw.split(",") if a.strip()],
                "isGlobal":     _bool(lp.get("is_global")),
            })

        # Discovery probes — child display_value = probe name, classy = classifier, phase
        probe_seen: set[str] = set()
        probe_names: list[dict] = []
        for r in cp_by_pat.get(sid, []):
            probe_name = _dv(r.get("child")) or _val(r.get("child"))
            if not probe_name or probe_name in probe_seen:
                continue
            probe_seen.add(probe_name)
            probe_names.append({
                "name":       probe_name,
                "classifier": _dv(r.get("classy")) or "",
                "phase":      _val(r.get("phase")) or "",
            })

        # Tracked files
        tracked_files: list[dict] = []
        for tf in tf_by_pat.get(sid, []):
            tracked_files.append({
                "id":        _val(tf.get("sys_id")),
                "name":      _val(tf.get("name")) or _dv(tf.get("name")) or "",
                "path":      _val(tf.get("path")) or "",
                "extension": _val(tf.get("file_extension")) or "",
                "ciType":    _val(tf.get("ci_type")) or "",
            })

        out_patterns.append({
            # ── Identity ──
            "id":               sid,
            "name":             name,
            "patternType":      ctype_label,
            "category":         category,
            "color":            CATEGORY_COLOR.get(category, "#6b7280"),
            "discoveryType":    disc_type,
            "active":           _bool(row.get("active")),
            "mainCi":           main_ci or None,
            "description":      (_val(row.get("description")) or "").strip(),
            # True when this pattern is referenced as an extension section of another pattern
            "isExtensionSection": sid in extension_section_ids,
            # ── NDL ──
            "ndl":              _suppress_library_connections(parse_ndl(ndl_raw), ctype_code, ndl_raw),
            "ndlRaw":           ndl_raw,
            # ── Relationships ──
            "ciMappings":       ci_mappings,
            "prepostScripts":   prepost_scripts,
            "prepostScriptIds": script_ids,       # IDs for quick lookup in prepostScripts map
            "extensionSections": ext_secs,        # sections this pattern pulls in
            "isExtensionOf":    ext_is_ext_of.get(sid, []),  # patterns that include this as section
            "triggerRules": {
                "asParent": [_trig(r, "pattern_id")        for r in trig_parent.get(sid, [])],
                "asChild":  [_trig(r, "parent_pattern_id") for r in trig_child.get(sid, [])],
            },
            "launchParams":    launch_params,
            "discoveryProbes": probe_names,
            "trackedFiles":    tracked_files,
        })

    out_patterns.sort(key=lambda p: (p["name"] or "").lower())

    # ── 7. Assemble final output ──────────────────────────────────────────────

    shared_script_count = sum(
        1 for s in prepost_by_id.values() if len(s["usedByPatternIds"]) > 1
    )

    return {
        "meta": {
            "instance":           args.url,
            "extractedAt":        datetime.now(tz=timezone.utc).isoformat(),
            "patternCount":       len(out_patterns),
            "extensionSectionCount": len(extension_section_ids),
            "prepostScriptCount": len(prepost_by_id),
            "sharedScriptCount":  shared_script_count,
            "deleteStrategyCount": len(delete_strategies),
        },
        # Every pattern, shared library, and extension section — one entry each.
        "patterns": out_patterns,
        # Lookup map for scripts that appear in multiple patterns.
        # Each entry holds the full script body + usedByPatternIds.
        "prepostScripts": prepost_by_id,
        # Lookup map for delete strategies referenced by ci_mappings.
        # Includes the strategy script body.
        "deleteStrategies": delete_strategies,
    }


# ── Validation printer ────────────────────────────────────────────────────────

def _print_validation(result: dict) -> None:
    """Print a human-readable summary of extracted patterns to stdout.

    Called automatically when --pattern-sys-id is used, so you can eyeball
    the data before committing to a full extraction.
    """
    W = 72
    SEP  = "─" * W
    SEP2 = "═" * W

    def _row(label: str, value: Any) -> None:
        print(f"  {label:<24}{value}")

    def _section(title: str) -> None:
        print(f"\n  ── {title}")

    patterns = result["patterns"]
    prepost  = result["prepostScripts"]
    strats   = result["deleteStrategies"]

    print()
    print(SEP2)
    print(f"  VALIDATION REPORT  —  {len(patterns)} pattern(s) extracted")
    print(SEP2)

    for p in patterns:
        ndl      = p.get("ndl") or {}
        ci_maps  = p.get("ciMappings") or []
        scripts  = p.get("prepostScripts") or []
        ext_secs = p.get("extensionSections") or []
        ext_of   = p.get("isExtensionOf") or []
        tr       = p.get("triggerRules") or {}
        lp       = p.get("launchParams") or []
        probes   = p.get("discoveryProbes") or []
        tf       = p.get("trackedFiles") or []

        print()
        print(SEP)
        print(f"  {p['name']}")
        print(SEP)
        _row("ID",             p["id"])
        _row("Pattern type",   p["patternType"])
        _row("Category",       p["category"])
        _row("Discovery type", p["discoveryType"])
        _row("Active",         p["active"])
        _row("Main CI",        p.get("mainCi") or "—")
        _row("Ext. section",   "YES — used inside other patterns" if p["isExtensionSection"] else "no")
        if p.get("description"):
            _row("Description", p["description"][:60] + ("…" if len(p["description"]) > 60 else ""))

        # NDL
        _section("NDL")
        _row("Steps",          len(ndl.get("steps") or []))
        _row("Tables written", len(ndl.get("tablesPopulated") or []))
        _row("Relations",      len(ndl.get("relations") or []))
        for t in (ndl.get("tablesPopulated") or []):
            cols   = t.get("columns") or []
            tt     = t.get("tableType", "temp")
            marker = {"cmdb_ci": "⬡", "cmdb": "◈", "temp": "○"}.get(tt, "○")
            print(f"    {marker} [{tt:7}] {t['table']}  ({len(cols)} cols: {', '.join(cols[:6])}{'…' if len(cols) > 6 else ''})")

        # CI mappings
        _section(f"CI Mappings  ({len(ci_maps)})")
        for ci in ci_maps:
            flag = " ← main" if ci["isMainCi"] else ""
            strat = ci.get("deletionStrategyLabel") or ci.get("deletionStrategy") or "—"
            strat_name = ci.get("deleteStrategyName")
            strat_str  = f"{strat}" + (f"  [{strat_name}]" if strat_name else "")
            print(f"    {'★' if ci['isMainCi'] else '·'} {ci['ciType'] or '—':<50}  del={strat_str}{flag}")

        # Pre/post scripts
        _section(f"Pre/Post Sensor Scripts  ({len(scripts)})")
        if scripts:
            for s in scripts:
                shared_note = f"  ⚠ shared with {len(s['sharedWithPatternIds'])} other pattern(s)" if s["isShared"] else ""
                lines = len((s.get("script") or "").splitlines())
                print(f"    [{s['phase']:4}]  {s['name']}  ({lines} lines){shared_note}")
        else:
            print("    (none)")

        # Extension sections
        if ext_secs:
            _section(f"Extension Sections used  ({len(ext_secs)})")
            for e in ext_secs:
                print(f"    order {e.get('order') or '?'}  →  {e['patternName']}")

        # isExtensionOf
        if ext_of:
            _section(f"Used as extension section by  ({len(ext_of)})")
            for e in ext_of:
                print(f"    ← {e['patternName']}")

        # Trigger rules
        as_parent = tr.get("asParent") or []
        as_child  = tr.get("asChild")  or []
        if as_parent or as_child:
            _section(f"Trigger Rules  ({len(as_parent)} as parent, {len(as_child)} as child)")
            for r in as_parent:
                print(f"    parent → triggers:  {r['patternName']}")
            for r in as_child:
                print(f"    child  ← triggered by:  {r['patternName']}")

        # Launch params
        if lp:
            _section(f"Launch Parameters  ({len(lp)})")
            for p2 in lp:
                attrs = ", ".join(p2.get("ciAttributes") or [])
                print(f"    {p2['ciClass'] or '?'}  [{attrs}]")

        # Probes
        if probes:
            _section(f"Discovery Probes  ({len(probes)})")
            for pr in probes:
                nm  = pr.get("name", pr) if isinstance(pr, dict) else pr
                cl  = pr.get("classifier", "") if isinstance(pr, dict) else ""
                ph  = pr.get("phase", "")      if isinstance(pr, dict) else ""
                print(f"    · {nm}  [{cl}]  phase={ph}")

        # Tracked files
        if tf:
            _section(f"Tracked Files  ({len(tf)})")
            for f2 in tf:
                print(f"    {f2['name'] or '?'}  {f2['path']}")

    # Global shared objects summary
    shared_scripts = [s for s in prepost.values() if len(s["usedByPatternIds"]) > 1]
    print()
    print(SEP2)
    print("  SHARED OBJECTS")
    print(SEP2)
    print(f"  Prepost scripts in result : {len(prepost)}")
    print(f"  Shared across patterns    : {len(shared_scripts)}")
    if shared_scripts:
        for s in shared_scripts:
            print(f"    ⚠ '{s['name']}'  used by {len(s['usedByPatternIds'])} patterns")
    print(f"  Delete strategies in result: {len(strats)}")
    if strats:
        for st in strats.values():
            print(f"    · {st['name']}")
    print()


# ── Driver ────────────────────────────────────────────────────────────────────

def run(args: argparse.Namespace) -> int:
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if not args.password:
        args.password = (
            os.environ.get("SNOW_PASSWORD")
            or getpass.getpass(f"Password for {args.user}@{args.url}: ")
        )

    verify_auth(args.url, args.user, args.password)

    result = extract(args)

    # When extracting specific patterns, print a human-readable summary so you
    # can validate the data before running a full extraction.
    if args.pattern_sys_id:
        _print_validation(result)

    out_path = Path(args.output).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, separators=(",", ":"))

    size_kb = out_path.stat().st_size // 1024
    meta = result["meta"]
    LOG.info(
        "Done. %d patterns (%d extension sections), %d scripts (%d shared), "
        "%d delete strategies → %s (%s KB)",
        meta["patternCount"],
        meta["extensionSectionCount"],
        meta["prepostScriptCount"],
        meta["sharedScriptCount"],
        meta["deleteStrategyCount"],
        out_path,
        f"{size_kb:,}",
    )

    if args.pattern_sys_id:
        LOG.info(
            "Single-pattern validation complete. "
            "Re-run without --pattern-sys-id to extract all patterns."
        )

    return 0


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Extract all ServiceNow Discovery / SM pattern data into a single "
            "self-contained JSON file with cross-references for shared objects."
        )
    )
    p.add_argument("--url",  required=True, help="https://<instance>.service-now.com")
    p.add_argument("--user", required=True)
    p.add_argument(
        "--password",
        help="Password (or set $SNOW_PASSWORD env var, or be prompted)",
    )
    p.add_argument(
        "--output",
        default="scripts/data/patterns_all.json",
        help="Output file path (default: scripts/data/patterns_all.json)",
    )
    p.add_argument(
        "--scope",
        help="Limit sa_pattern fetch to this application scope (e.g. sn_itom_pattern)",
    )
    p.add_argument(
        "--active-only",
        action="store_true",
        help="Skip inactive (active=false) patterns",
    )
    p.add_argument(
        "--pattern-sys-id",
        help=(
            "Comma-separated sa_pattern sys_ids to extract. "
            "Uses targeted queries (fast) and prints a validation summary. "
            "Omit to extract all patterns."
        ),
    )
    p.add_argument(
        "--workers",
        type=int,
        default=6,
        help="Parallel fetch threads for bulk table fetches (default: 6)",
    )
    p.add_argument("-v", "--verbose", action="store_true")
    return p


if __name__ == "__main__":
    sys.exit(run(build_argparser().parse_args()))
