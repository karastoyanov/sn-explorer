#!/usr/bin/env python3
"""
Discovery Classifier Extractor

Connects to a ServiceNow instance and produces a self-contained JSON file
with every Discovery Classifier and its classification criteria.

Tables queried:
  discovery_classy          – classifier definitions (name, table, script)
  discovery_class_criteria  – per-classifier matching rules

Output structure:
  {
    "meta": { instance, extractedAt, classifierCount, criteriaCount },
    "classifiers": [
      {
        "id":          "<sys_id>",
        "name":        "Linux",
        "ciTable":     "cmdb_ci_linux_server",
        "ciTableLabel":"Linux Server",
        "type":        "SSH",
        "active":      true,
        "script":      "// classification script …",
        "criteria": [
          {
            "id":       "<sys_id>",
            "type":     "ssh_command",
            "field":    "uname",
            "operator": "contains",
            "value":    "Linux",
            "order":    100
          },
          …
        ]
      },
      …
    ]
  }

Usage:
    python extract_classifiers.py \\
        --url  https://<instance>.service-now.com \\
        --user <user> \\
        [--password <pass>] \\
        [--output scripts/data/classifiers_all.json]
"""
from __future__ import annotations

import argparse
import getpass
import json
import logging
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

LOG = logging.getLogger("classifier_extractor")

# ── helpers ───────────────────────────────────────────────────────────────────

def _strip(v: Any) -> str:
    """Flatten a ServiceNow display-value dict or plain string."""
    if isinstance(v, dict):
        return str(v.get("value") or v.get("display_value") or "").strip()
    return str(v or "").strip()


def _display(v: Any) -> str:
    """Return display_value if present, else value."""
    if isinstance(v, dict):
        dv = str(v.get("display_value") or "").strip()
        return dv if dv else str(v.get("value") or "").strip()
    return str(v or "").strip()


def _bool(v: Any) -> bool:
    return str(_strip(v)).lower() in ("true", "1", "yes")


class SnClient:
    """Minimal ServiceNow Table API client."""

    def __init__(self, url: str, user: str, password: str) -> None:
        self.base   = url.rstrip("/") + "/api/now/table"
        self.auth   = (user, password)
        self.session = requests.Session()
        self.session.auth = self.auth
        self.session.headers.update({"Accept": "application/json"})

    def query(
        self,
        table: str,
        *,
        fields: list[str],
        query: str = "",
        limit: int = 10_000,
        display_value: str = "all",
    ) -> list[dict]:
        params: dict[str, Any] = {
            "sysparm_fields":        ",".join(fields),
            "sysparm_limit":         limit,
            "sysparm_display_value": display_value,
            "sysparm_exclude_reference_link": "true",
        }
        if query:
            params["sysparm_query"] = query

        rows: list[dict] = []
        offset = 0
        while True:
            params["sysparm_offset"] = offset
            LOG.debug("GET %s offset=%d", table, offset)
            resp = self.session.get(f"{self.base}/{table}", params=params, timeout=60)
            resp.raise_for_status()
            batch = resp.json().get("result", [])
            rows.extend(batch)
            if len(batch) < limit:
                break
            offset += limit

        LOG.info("  %s → %d rows", table, len(rows))
        return rows


# ── main extraction ────────────────────────────────────────────────────────────

def extract(url: str, user: str, password: str) -> dict:
    client = SnClient(url, user, password)

    # ── 1. Fetch classifiers ──────────────────────────────────────────────────
    # sys_class_name tells us the protocol subtype (discovery_classy_cim,
    # discovery_classy_ssh, etc.) — we use it to derive a human-readable type.
    LOG.info("Fetching discovery_classy …")
    raw_classifiers = client.query(
        "discovery_classy",
        fields=[
            "sys_id", "name", "table", "script",
            "active", "sys_class_name", "match_criteria", "order",
        ],
        display_value="all",
    )

    # ── 2. Fetch criteria ────────────────────────────────────────────────────
    # Key fields from the actual table schema:
    #   classy     – reference to discovery_classy (join key)
    #   name       – short label for this criterion
    #   criterion  – the match pattern (e.g. "CIM_ObjectManager[0].*")
    #   operator   – e.g. "equals", "contains"
    #   value      – optional value to compare against
    LOG.info("Fetching discovery_class_criteria …")
    raw_criteria = client.query(
        "discovery_class_criteria",
        fields=[
            "sys_id", "classy", "name", "criterion",
            "operator", "value", "order",
        ],
        display_value="all",
    )

    # ── 3. Index criteria by classifier sys_id ───────────────────────────────
    criteria_by_classifier: dict[str, list[dict]] = defaultdict(list)
    for rc in raw_criteria:
        # "classy" value is the sys_id of the parent classifier; display_value is
        # the classifier name — either works for joining, sys_id is more reliable.
        clf_id = _strip(rc.get("classy"))
        if not clf_id:
            continue
        criteria_by_classifier[clf_id].append({
            "id":        _strip(rc.get("sys_id")),
            "name":      _strip(rc.get("name")),
            "criterion": _strip(rc.get("criterion")),
            "operator":  _strip(rc.get("operator")),
            "value":     _strip(rc.get("value")),
            "order":     _int(rc.get("order")),
        })

    # Sort criteria within each classifier by order then name
    for cid in criteria_by_classifier:
        criteria_by_classifier[cid].sort(key=lambda c: (c["order"] or 0, c["name"] or ""))

    # ── 4. Assemble classifier objects ───────────────────────────────────────
    classifiers: list[dict] = []
    for rc in raw_classifiers:
        cid        = _strip(rc.get("sys_id"))
        ci_table   = _strip(rc.get("table"))
        ci_label   = _display(rc.get("table"))
        sys_cls    = _strip(rc.get("sys_class_name"))

        classifiers.append({
            "id":            cid,
            "name":          _strip(rc.get("name")),
            "ciTable":       ci_table,
            "ciTableLabel":  ci_label if ci_label != ci_table else "",
            "type":          _classifier_type(sys_cls),
            "sysClassName":  sys_cls,
            "matchCriteria": _strip(rc.get("match_criteria")),  # "Any" | "All"
            "order":         _int(rc.get("order")),
            "active":        _bool(rc.get("active")),
            "script":        _strip(rc.get("script")),
            "criteria":      criteria_by_classifier.get(cid, []),
        })

    classifiers.sort(key=lambda c: c["name"].lower())

    total_criteria = sum(len(c["criteria"]) for c in classifiers)
    LOG.info("Assembled %d classifiers, %d criteria total", len(classifiers), total_criteria)

    return {
        "meta": {
            "instance":       url.rstrip("/"),
            "extractedAt":    datetime.now(timezone.utc).isoformat(),
            "classifierCount": len(classifiers),
            "criteriaCount":  total_criteria,
        },
        "classifiers": classifiers,
    }


_SYS_CLASS_TO_TYPE: dict[str, str] = {
    "discovery_classy_cim":        "CIM/WBEM",
    "discovery_classy_ssh":        "SSH",
    "discovery_classy_wmi":        "WMI",
    "discovery_classy_snmp":       "SNMP",
    "discovery_classy_powershell": "PowerShell",
    "discovery_classy_script":     "Script",
    "discovery_classy_tcp":        "TCP",
    "discovery_classy_jdbc":       "JDBC",
    "discovery_classy":            "Generic",
}


def _classifier_type(sys_class_name: str) -> str:
    return _SYS_CLASS_TO_TYPE.get(sys_class_name or "", sys_class_name or "Unknown")


def _int(v: Any) -> int | None:
    try:
        return int(_strip(v))
    except (ValueError, TypeError):
        return None


# ── CLI ────────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Extract ServiceNow Discovery Classifiers to JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--url",      required=True,  help="ServiceNow instance URL")
    p.add_argument("--user",     required=True,  help="Username")
    p.add_argument("--password", default=None,   help="Password (prompted if omitted)")
    p.add_argument(
        "--output",
        default=str(Path(__file__).parent / "data" / "classifiers_all.json"),
        help="Output JSON file path",
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

    password = args.password or getpass.getpass(f"Password for {args.user}@{args.url}: ")

    LOG.info("Connecting to %s …", args.url)
    try:
        data = extract(args.url, args.user, password)
    except requests.HTTPError as exc:
        LOG.error("HTTP error: %s", exc)
        sys.exit(1)
    except requests.ConnectionError as exc:
        LOG.error("Connection error: %s", exc)
        sys.exit(1)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    meta = data["meta"]
    LOG.info(
        "Wrote %d classifiers (%d criteria) → %s",
        meta["classifierCount"], meta["criteriaCount"], out,
    )


if __name__ == "__main__":
    main()
