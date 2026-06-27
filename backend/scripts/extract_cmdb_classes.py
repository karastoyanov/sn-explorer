#!/usr/bin/env python3
"""
CMDB Class Manager Extractor

Connects to a ServiceNow instance and produces a self-contained JSON file
with CI class definitions, IRE identification rules, relation types, and
reconciliation definitions.

Tables queried (verified against real SN schema):
  sys_db_object                    – CI class definitions (nameSTARTSWITHcmdb_ci)
  sys_dictionary                   – Field definitions per class
  cmdb_class_info                  – Principal-class flag, description, managed-by group
  cmdb_identifier                  – Top-level identifier (applies_to → CI class)
  cmdb_identifier_entry            – Identification entries under each identifier
                                     (attributes, main_attributes, table, order …)
  cmdb_rel_type                    – Relationship type catalog
  cmdb_reconciliation_definition   – Reconciliation rules per data source / CI class

Output structure:
  {
    "meta": { instance, extractedAt, counts },
    "classes": [
      {
        "id", "name", "label", "superClass", "scope",
        "isExtendable", "principalClass", "description",
        "fieldCount", "fields": [{ name, label, type, mandatory }],
        "identifierId"   -- sys_id of cmdb_identifier (null if none)
      }
    ],
    "identifiers": [
      {
        "id", "name", "appliesTo", "independent", "active",
        "entries": [
          {
            "id", "order", "active",
            "searchTable", "mainTable",
            "attributes":     ["field", …],   -- Criterion attributes
            "mainAttributes": ["field", …],   -- Main criterion attributes
            "allowFallback", "allowNullAttribute", "exactCountMatch"
          }
        ]
      }
    ],
    "relationTypes": [
      { "id", "name", "parentDescriptor", "childDescriptor" }
    ],
    "reconciliationDefinitions": [
      {
        "id", "name", "appliesTo", "dataSource",
        "attributes": ["field", …],
        "nullUpdate":  ["field", …],
        "priority", "active"
      }
    ]
  }

Usage:
    python extract_cmdb_classes.py \\
        --url  https://<instance>.service-now.com \\
        --user <user> \\
        [--password <pass>] \\
        [--output scripts/data/cmdb_classes.json] \\
        [--no-fields]   # skip sys_dictionary (faster, fieldCount = 0)
"""
from __future__ import annotations

import argparse
import getpass
import json
import logging
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

LOG = logging.getLogger("cmdb_extractor")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _val(v: Any) -> str:
    if isinstance(v, dict):
        return str(v.get("value") or "").strip()
    return str(v or "").strip()


def _dv(v: Any) -> str:
    if isinstance(v, dict):
        return str(v.get("display_value") or v.get("value") or "").strip()
    return str(v or "").strip()


def _bool(v: Any) -> bool:
    return _val(v).lower() in ("true", "1", "yes")


def _int(v: Any) -> int | None:
    try:
        return int(_val(v))
    except (ValueError, TypeError):
        return None


def _field_list(v: Any) -> list[str]:
    """Split a ServiceNow Field List value (comma-separated) into a list."""
    raw = _val(v)
    return [f.strip() for f in raw.split(",") if f.strip()] if raw else []


# ── ServiceNow client ─────────────────────────────────────────────────────────

class SnClient:
    def __init__(self, url: str, user: str, password: str) -> None:
        self.base = url.rstrip("/") + "/api/now/table"
        self.session = requests.Session()
        self.session.auth = (user, password)
        self.session.headers.update({"Accept": "application/json"})

    def query(
        self,
        table: str,
        *,
        fields: list[str],
        query: str = "",
        limit: int = 2_000,
        display_value: str = "all",
    ) -> list[dict]:
        params: dict[str, Any] = {
            "sysparm_fields":                ",".join(fields),
            "sysparm_display_value":         display_value,
            "sysparm_exclude_reference_link": "true",
        }
        if query:
            params["sysparm_query"] = query

        rows: list[dict] = []
        offset = 0
        page_limit = limit
        while True:
            params["sysparm_limit"]  = page_limit
            params["sysparm_offset"] = offset
            resp = self.session.get(f"{self.base}/{table}", params=params, timeout=60)
            resp.raise_for_status()
            try:
                batch = resp.json().get("result", [])
            except Exception:
                if page_limit <= 100:
                    LOG.warning("  JSON decode failed at offset %d (limit %d) — skipping page", offset, page_limit)
                    offset += page_limit
                    page_limit = limit
                    continue
                page_limit = max(100, page_limit // 2)
                LOG.warning("  JSON decode error — retrying with limit=%d at offset=%d", page_limit, offset)
                continue
            rows.extend(batch)
            if len(batch) < page_limit:
                break
            offset += page_limit
            page_limit = limit  # restore after any retry

        LOG.info("  %-52s → %d rows", table, len(rows))
        return rows


def _client(args: argparse.Namespace) -> SnClient:
    return SnClient(args.url, args.user, args.password)


# ── Core extraction ───────────────────────────────────────────────────────────

def extract(args: argparse.Namespace) -> dict:
    LOG.info("Connecting to %s …", args.url)

    # ── 1. CI classes ─────────────────────────────────────────────────────────
    LOG.info("Fetching CI classes (sys_db_object) …")
    raw_classes = _client(args).query(
        "sys_db_object",
        fields=["sys_id", "name", "label", "super_class", "sys_scope", "is_extendable"],
        query="nameSTARTSWITHcmdb_ci",
    )
    LOG.info("  %d CI classes found", len(raw_classes))

    # ── 2. Field definitions ──────────────────────────────────────────────────
    fields_by_table: dict[str, list[dict]] = defaultdict(list)
    if not args.no_fields:
        LOG.info("Fetching field definitions (sys_dictionary) …")
        raw_fields = _client(args).query(
            "sys_dictionary",
            fields=["name", "element", "column_label", "internal_type", "mandatory"],
            query="nameSTARTSWITHcmdb_ci^elementISNOTEMPTY^active=true",
        )
        for rf in raw_fields:
            tbl = _val(rf["name"])
            if tbl:
                fields_by_table[tbl].append({
                    "name":      _val(rf["element"]),
                    "label":     _dv(rf["column_label"]),
                    "type":      _dv(rf["internal_type"]),
                    "mandatory": _bool(rf.get("mandatory")),
                })

    # ── 3. Parallel secondary fetches ────────────────────────────────────────
    SECONDARY: dict[str, dict] = {
        "cmdb_class_info": {
            "fields": ["sys_id", "class", "description",
                       "managed_by_group", "principal_class"],
        },
        "cmdb_identifier": {
            "fields": ["sys_id", "name", "applies_to", "independent", "active"],
        },
        "cmdb_identifier_entry": {
            "fields": ["sys_id", "identifier", "order", "active",
                       "table", "main_table",
                       "attributes", "main_attributes",
                       "hybrid_entry_ci_criterion_attributes",
                       "allow_fallback", "allow_null_attribute", "exact_count_match"],
        },
        "cmdb_rel_type": {
            "fields": ["sys_id", "name", "parent_descriptor", "child_descriptor"],
        },
        "cmdb_reconciliation_definition": {
            "fields": ["sys_id", "name", "active", "applies_to",
                       "discovery_source", "attributes", "null_update", "priority"],
        },
    }

    def _fetch(item: tuple[str, dict]) -> tuple[str, list[dict]]:
        table, cfg = item
        return table, _client(args).query(table, fields=cfg["fields"])

    LOG.info("Fetching %d secondary tables (parallel) …", len(SECONDARY))
    raw: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        for tbl, rows in pool.map(_fetch, SECONDARY.items()):
            raw[tbl] = rows

    # ── 4. Class info lookup ──────────────────────────────────────────────────
    class_info_by_name: dict[str, dict] = {}
    for r in raw["cmdb_class_info"]:
        cls = _val(r["class"])
        if cls:
            class_info_by_name[cls] = {
                "principalClass":  _bool(r.get("principal_class")),
                "description":     _val(r.get("description")),
                "managedByGroup":  _dv(r.get("managed_by_group")),
            }

    # ── 5. Identifiers ────────────────────────────────────────────────────────
    # Group entries by their parent identifier sys_id
    entries_by_identifier: dict[str, list[dict]] = defaultdict(list)
    for r in raw["cmdb_identifier_entry"]:
        parent_id = _val(r.get("identifier"))
        if not parent_id:
            continue
        entries_by_identifier[parent_id].append({
            "id":              _val(r["sys_id"]),
            "order":           _int(r.get("order")),
            "active":          _bool(r.get("active")),
            "searchTable":     _val(r.get("table")),
            "mainTable":       _val(r.get("main_table")),
            "attributes":      _field_list(r.get("attributes")),
            "mainAttributes":  _field_list(r.get("main_attributes")),
            "hybridAttributes": _field_list(r.get("hybrid_entry_ci_criterion_attributes")),
            "allowFallback":       _bool(r.get("allow_fallback")),
            "allowNullAttribute":  _bool(r.get("allow_null_attribute")),
            "exactCountMatch":     _bool(r.get("exact_count_match")),
        })

    identifiers: list[dict] = []
    identifier_id_by_class: dict[str, str] = {}  # class_name → identifier sys_id
    for r in raw["cmdb_identifier"]:
        iid        = _val(r["sys_id"])
        applies_to = _val(r.get("applies_to"))
        if applies_to:
            identifier_id_by_class[applies_to] = iid

        entries = sorted(
            entries_by_identifier.get(iid, []),
            key=lambda e: (e["order"] or 0),
        )
        identifiers.append({
            "id":          iid,
            "name":        _val(r.get("name")),
            "appliesTo":   applies_to,
            "independent": _bool(r.get("independent")),
            "active":      _bool(r.get("active")),
            "entries":     entries,
        })

    identifiers.sort(key=lambda x: (x["appliesTo"] or "").lower())

    # ── 6. Relation types ─────────────────────────────────────────────────────
    relation_types: list[dict] = []
    for r in raw["cmdb_rel_type"]:
        relation_types.append({
            "id":               _val(r["sys_id"]),
            "name":             _val(r.get("name")),
            "parentDescriptor": _val(r.get("parent_descriptor")),
            "childDescriptor":  _val(r.get("child_descriptor")),
        })
    relation_types.sort(key=lambda t: (t["name"] or "").lower())

    # ── 7. Reconciliation definitions ─────────────────────────────────────────
    recon_defs: list[dict] = []
    for r in raw["cmdb_reconciliation_definition"]:
        recon_defs.append({
            "id":         _val(r["sys_id"]),
            "name":       _val(r.get("name")),
            "appliesTo":  _val(r.get("applies_to")),
            "dataSource": _val(r.get("discovery_source")),
            "attributes": _field_list(r.get("attributes")),
            "nullUpdate":  _field_list(r.get("null_update")),
            "priority":   _int(r.get("priority")),
            "active":     _bool(r.get("active")),
        })
    recon_defs.sort(key=lambda x: (_int(x["priority"]) or 0, (x["appliesTo"] or "").lower()))

    # ── 8. Assemble class objects ─────────────────────────────────────────────
    classes: list[dict] = []
    for r in raw_classes:
        name    = _val(r["name"])
        flds    = sorted(fields_by_table.get(name, []), key=lambda f: f["name"].lower())
        info    = class_info_by_name.get(name, {})

        classes.append({
            "id":             _val(r["sys_id"]),
            "name":           name,
            "label":          _dv(r["label"]),
            "superClass":     _dv(r.get("super_class")),
            "scope":          _dv(r.get("sys_scope")),
            "isExtendable":   _bool(r.get("is_extendable")),
            "principalClass": info.get("principalClass", False),
            "description":    info.get("description", ""),
            "managedByGroup": info.get("managedByGroup", ""),
            "fieldCount":     len(flds),
            "fields":         flds,
            "identifierId":   identifier_id_by_class.get(name),
        })

    classes.sort(key=lambda c: (c["name"] or "").lower())
    LOG.info("Assembled %d CI classes", len(classes))

    # ── 9. Output ─────────────────────────────────────────────────────────────
    return {
        "meta": {
            "instance":          args.url.rstrip("/"),
            "extractedAt":       datetime.now(timezone.utc).isoformat(),
            "classCount":        len(classes),
            "identifierCount":   len(identifiers),
            "relationTypeCount": len(relation_types),
            "reconDefCount":     len(recon_defs),
            "fieldsIncluded":    not args.no_fields,
        },
        "classes":                  classes,
        "identifiers":              identifiers,
        "relationTypes":            relation_types,
        "reconciliationDefinitions": recon_defs,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Extract ServiceNow CMDB class metadata to JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--url",      required=True, help="ServiceNow instance URL")
    p.add_argument("--user",     required=True, help="Username")
    p.add_argument("--password", default=None,  help="Password (prompted if omitted)")
    p.add_argument(
        "--output",
        default=str(Path(__file__).parent / "data" / "cmdb_classes.json"),
        help="Output JSON file path",
    )
    p.add_argument(
        "--no-fields",
        action="store_true",
        help="Skip sys_dictionary fetch (faster, fieldCount will be 0)",
    )
    p.add_argument("--debug", action="store_true", help="Enable debug logging")
    return p


def main() -> None:
    args = _build_parser().parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.debug else logging.INFO,
        format="%(asctime)s  %(levelname)-7s  %(message)s",
        datefmt="%H:%M:%S",
    )

    if not args.password:
        args.password = getpass.getpass(f"Password for {args.user}@{args.url}: ")

    try:
        data = extract(args)
    except requests.HTTPError as exc:
        LOG.error("HTTP error: %s", exc)
        sys.exit(1)
    except requests.ConnectionError as exc:
        LOG.error("Connection error: %s", exc)
        sys.exit(1)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    m = data["meta"]
    LOG.info(
        "Done. %d classes, %d identifiers, %d relation types, "
        "%d recon definitions → %s",
        m["classCount"], m["identifierCount"],
        m["relationTypeCount"], m["reconDefCount"], out,
    )


if __name__ == "__main__":
    main()
