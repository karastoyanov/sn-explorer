#!/usr/bin/env python3
"""
Discovery Logs & Run Extractor

Connects to a ServiceNow instance and extracts:
  1. MID Server record from ecc_agent (status, version, health)
  2. Discovery schedule from discovery_schedule + IP ranges from discovery_range_item
  3. Latest discovery run from discovery_status + log messages from discovery_log
  4. All CIs for that run from discovery_log_ci, then enriched dynamically:
       - Base attributes from cmdb_ci
       - Class-specific attributes from the actual CI table (e.g. cmdb_ci_linux_server)
       - Relations from cmdb_rel_ci

Change the two global vars at the top to target a different MID Server or Schedule.

Usage:
    python extract_discovery_logs.py \\
        --url  https://<instance>.service-now.com \\
        --user <user> \\
        [--password <pass>] \\
        [--output scripts/data/discovery_runs.json]
"""
from __future__ import annotations

# ══════════════════════════════════════════════════════════════════════════════
#  TARGET CONFIGURATION — edit these to switch MID Server / Schedule
# ══════════════════════════════════════════════════════════════════════════════
MID_SERVER_NAME         = "OnPrem_MID"
DISCOVERY_SCHEDULE_NAME = "OnPrem_Discovery_VirtualBox_Infra"
# ══════════════════════════════════════════════════════════════════════════════

import argparse
import getpass
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

LOG = logging.getLogger("discovery_logs")

# ── Per-class extra fields ────────────────────────────────────────────────────
# Fields fetched from the actual CI class table (in addition to base cmdb_ci)
# Add entries here to extend coverage for other CI types you discover.
CLASS_FIELD_MAP: dict[str, list[str]] = {
    "cmdb_ci_linux_server": [
        "host_name", "fqdn", "os", "os_version", "os_service_pack",
        "cpu_count", "cpu_speed", "cpu_type", "ram", "disk_space",
        "running_processes",
    ],
    "cmdb_ci_win_server": [
        "host_name", "fqdn", "os", "os_version", "os_service_pack",
        "cpu_count", "cpu_speed", "ram", "disk_space",
    ],
    "cmdb_ci_solaris_server": [
        "host_name", "fqdn", "os", "os_version", "cpu_count", "ram", "disk_space",
    ],
    "cmdb_ci_app_server_tomcat": [
        "version", "install_directory", "config_file",
        "jvm_type", "jvm_version",
    ],
    "cmdb_ci_app_server_jboss": [
        "version", "install_directory",
    ],
    "cmdb_ci_web_server_apache": [
        "version", "install_directory", "config_file",
    ],
    "cmdb_ci_web_server_iis": [
        "version", "install_directory",
    ],
    "cmdb_ci_computer": [
        "host_name", "fqdn", "os", "cpu_count", "ram", "disk_space",
    ],
    "cmdb_ci_network_adapter": [
        "mac_address", "netmask", "ip_default_gateway",
    ],
    "cmdb_ci_ip_address": [
        "ip_address", "netmask", "nic",
    ],
    "cmdb_ci_db_ora": [
        "version", "port",
    ],
    "cmdb_ci_db_mssql": [
        "version", "port",
    ],
    "cmdb_ci_db_mysql": [
        "version", "port",
    ],
}

# Always fetched from cmdb_ci regardless of class
BASE_CI_FIELDS = [
    "sys_id", "name", "sys_class_name", "ip_address", "fqdn",
    "install_status", "discovery_source", "last_discovered",
    "short_description", "serial_number", "manufacturer", "model_id",
    "location", "asset_tag",
]

# Fallback extra fields for classes not in CLASS_FIELD_MAP
DEFAULT_EXTRA_FIELDS = ["version", "install_directory", "host_name", "fqdn", "os"]


# ── ServiceNow REST client ────────────────────────────────────────────────────

class SnClient:
    def __init__(self, url: str, user: str, password: str) -> None:
        self.base = url.rstrip("/") + "/api/now/table"
        self.session = requests.Session()
        self.session.auth = (user, password)
        self.session.headers.update({"Accept": "application/json"})

    def get(
        self,
        table: str,
        *,
        fields: list[str],
        query: str = "",
        limit: int = 1_000,
        display_value: str = "all",
        order_by_desc: str = "",
    ) -> list[dict]:
        q = query
        if order_by_desc:
            sep = "^" if q else ""
            q   = f"{q}{sep}ORDERBYDESC{order_by_desc}"

        params: dict[str, Any] = {
            "sysparm_fields":                 ",".join(fields),
            "sysparm_display_value":          display_value,
            "sysparm_exclude_reference_link": "true",
            "sysparm_limit":                  limit,
            "sysparm_offset":                 0,
        }
        if q:
            params["sysparm_query"] = q

        rows: list[dict] = []
        while True:
            resp = self.session.get(f"{self.base}/{table}", params=params, timeout=60)
            resp.raise_for_status()
            batch = resp.json().get("result", [])
            rows.extend(batch)
            if len(batch) < limit:
                break
            params["sysparm_offset"] += limit  # type: ignore[operator]

        LOG.info("  %-42s  query=%-40s  → %d rows", table, (q or "")[:40], len(rows))
        return rows

    def get_one(self, table: str, **kwargs) -> dict | None:
        kwargs["limit"] = 1
        rows = self.get(table, **kwargs)
        return rows[0] if rows else None


# ── Value helpers ─────────────────────────────────────────────────────────────

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


# ── Phase 1 — MID Server ─────────────────────────────────────────────────────

def fetch_mid_server(sn: SnClient) -> dict:
    LOG.info("Phase 1 — MID Server: %s (ecc_agent) …", MID_SERVER_NAME)
    row = sn.get_one(
        "ecc_agent",
        fields=[
            "sys_id", "name", "status", "validated", "version",
            "ip_address", "host_name", "started", "last_refreshed",
            "sys_created_on", "sys_updated_on", "mid_server_pool",
            "pid_running", "capability",
        ],
        query=f"name={MID_SERVER_NAME}",
    )
    if not row:
        LOG.warning("MID Server '%s' not found in ecc_agent.", MID_SERVER_NAME)
        return {"name": MID_SERVER_NAME, "found": False}

    return {
        "found":        True,
        "sysId":        _val(row["sys_id"]),
        "name":         _dv(row.get("name")),
        "status":       _dv(row.get("status")),
        "validated":    _bool(row.get("validated")),
        "version":      _dv(row.get("version")),
        "ipAddress":    _dv(row.get("ip_address")),
        "hostName":     _dv(row.get("host_name")),
        "started":      _dv(row.get("started")),
        "lastRefreshed": _dv(row.get("last_refreshed")),
        "createdOn":    _dv(row.get("sys_created_on")),
        "updatedOn":    _dv(row.get("sys_updated_on")),
        "pool":         _dv(row.get("mid_server_pool")),
        "pidRunning":   _bool(row.get("pid_running")),
    }


# ── Phase 2 — Schedule + IP ranges ───────────────────────────────────────────

def fetch_schedule(sn: SnClient) -> dict:
    LOG.info("Phase 2 — Schedule: %s (discovery_schedule) …", DISCOVERY_SCHEDULE_NAME)
    row = sn.get_one(
        "discovery_schedule",
        fields=[
            "sys_id", "name", "active", "discovery_type", "mid_server",
            "run_time", "discover", "description",
        ],
        query=f"name={DISCOVERY_SCHEDULE_NAME}",
    )
    if not row:
        LOG.warning("Schedule '%s' not found in discovery_schedule.", DISCOVERY_SCHEDULE_NAME)
        return {"name": DISCOVERY_SCHEDULE_NAME, "found": False}

    schedule_id = _val(row["sys_id"])

    LOG.info("  Fetching IP ranges (discovery_range_item) …")
    range_rows = sn.get(
        "discovery_range_item",
        fields=["sys_id", "name", "range", "type"],
        query=f"schedule={schedule_id}",
        limit=500,
    )
    ip_ranges = [
        {
            "name":  _dv(r.get("name")),
            "range": _dv(r.get("range")),
            "type":  _dv(r.get("type")),
        }
        for r in range_rows
    ]

    return {
        "found":         True,
        "sysId":         schedule_id,
        "name":          _dv(row.get("name")),
        "active":        _bool(row.get("active")),
        "discoveryType": _dv(row.get("discovery_type")),
        "midServer":     _dv(row.get("mid_server")),
        "runTime":       _dv(row.get("run_time")),
        "discover":      _dv(row.get("discover")),
        "description":   _dv(row.get("description")),
        "ipRanges":      ip_ranges,
    }


# States that mean the run is still in progress or was abandoned — skip these
_INCOMPLETE_STATES = {"running", "starting", "cancelled", "cancelling", "error", "stopped"}


# ── Phase 3 — Latest run + logs ──────────────────────────────────────────────

def fetch_latest_run(sn: SnClient, schedule_sys_id: str) -> dict:
    LOG.info("Phase 3 — Latest completed run (discovery_status.dscheduler=%s) …", schedule_sys_id)
    # Fetch last 10 so we can skip in-progress / cancelled runs
    rows = sn.get(
        "discovery_status",
        fields=[
            "sys_id", "number", "state", "progress",
            "completed", "started", "discover",
            "description", "source", "duration",
            "dscheduler", "sys_created_on", "sys_updated_on",
        ],
        query=f"dscheduler={schedule_sys_id}",
        order_by_desc="sys_created_on",
        limit=10,
    )
    if not rows:
        LOG.warning("No discovery runs found for schedule %s.", schedule_sys_id)
        return {"found": False}

    LOG.info("  Last %d runs for this schedule:", len(rows))
    for r in rows:
        LOG.info("    %s  state=%-20s  created=%s",
                 _dv(r.get("number")), _dv(r.get("state")), _dv(r.get("sys_created_on")))

    # Pick the most recent run that is not still in-progress or abandoned
    row = None
    for r in rows:
        if _val(r.get("state")).lower() not in _INCOMPLETE_STATES:
            row = r
            break

    if row is None:
        LOG.warning("  All recent runs are in-progress or cancelled — using the most recent anyway.")
        row = rows[0]

    run_sys_id = _val(row["sys_id"])
    number     = _dv(row.get("number"))
    LOG.info("  Selected run: %s  state=%s", number, _dv(row.get("state")))

    # Log messages from discovery_log (field: discovery_status → discovery_status.sys_id)
    LOG.info("  Fetching discovery_log messages …")
    log_rows = sn.get(
        "discovery_log",
        fields=["sys_id", "level", "message", "source", "sys_created_on"],
        query=f"discovery_status={run_sys_id}^ORDERBYsys_created_on",
        limit=500,
    )
    logs = [
        {
            "level":     _dv(r.get("level")),
            "message":   _dv(r.get("message")),
            "source":    _dv(r.get("source")),
            "timestamp": _dv(r.get("sys_created_on")),
        }
        for r in log_rows
    ]

    # Discovered CIs — use sys_created_on / sys_updated_on as the run window
    discovered_cis = fetch_discovered_cis(
        sn, run_sys_id,
        start_time_raw=_val(row.get("sys_created_on")),
        end_time_raw=_val(row.get("sys_updated_on")),
    )

    return {
        "found":       True,
        "sysId":       run_sys_id,
        "number":      number,
        "state":       _dv(row.get("state")),
        "progress":    _int(row.get("progress")) or 0,
        "completed":   _int(row.get("completed")) or 0,
        "started":     _int(row.get("started")) or 0,
        "discover":    _dv(row.get("discover")),
        "duration":    _dv(row.get("duration")),
        "description": _dv(row.get("description")),
        "startTime":   _dv(row.get("sys_created_on")),
        "endTime":     _dv(row.get("sys_updated_on")),
        "schedule":    _dv(row.get("dscheduler")),
        "logs":           logs,
        "discoveredCIs":  discovered_cis,
    }


# ── Phase 4 — Discovered CIs ─────────────────────────────────────────────────

def _looks_like_ip(s: str) -> bool:
    parts = s.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except (ValueError, TypeError):
        return False


def fetch_discovered_cis(
    sn: SnClient,
    run_sys_id: str,
    start_time_raw: str,
    end_time_raw: str,
) -> list[dict]:
    """
    Derive discovered CIs from the discovery_log related list on discovery_status.

    discovery_log.source holds the IP address of each probed device.
    We collect unique source IPs, then look up CIs in cmdb_ci by IP,
    confirmed by last_discovered falling within the run window.
    """
    LOG.info("Phase 4 — Extracting source IPs from discovery_log for run %s …", run_sys_id)
    log_rows = sn.get(
        "discovery_log",
        fields=["source"],
        query=f"discovery_status={run_sys_id}^sourceISNOTEMPTY",
        limit=2_000,
    )

    seen_ips: set[str] = set()
    for r in log_rows:
        src = _dv(r.get("source")).strip()
        if src and _looks_like_ip(src):
            seen_ips.add(src)

    LOG.info("  Unique source IPs in discovery_log: %d", len(seen_ips))

    if not seen_ips:
        LOG.warning(
            "  No source IPs found in discovery_log for run %s. "
            "Falling back to cmdb_ci time-range query …",
            run_sys_id,
        )
        return _fallback_ci_query(sn, start_time_raw, end_time_raw)

    result: list[dict] = []
    seen_ci_ids: set[str] = set()

    for ip in sorted(seen_ips):
        q = f"ip_address={ip}"
        if start_time_raw:
            q += f"^last_discovered>={start_time_raw}"

        rows = sn.get(
            "cmdb_ci",
            fields=["sys_id", "sys_created_on"],
            query=q,
            limit=20,
        )
        for row in rows:
            ci_sys_id = _val(row["sys_id"])
            if not ci_sys_id or ci_sys_id in seen_ci_ids:
                continue
            seen_ci_ids.add(ci_sys_id)

            # Created = CI was born during this run; otherwise Updated
            ci_created = _val(row.get("sys_created_on"))
            if start_time_raw and ci_created and ci_created >= start_time_raw:
                state = "Created"
            else:
                state = "Updated"

            ci_data = fetch_ci_details(sn, ci_sys_id)
            result.append({"state": state, **ci_data})

    LOG.info("  Resolved %d unique CIs from %d source IPs", len(result), len(seen_ips))
    return result


def _fallback_ci_query(sn: SnClient, start_time_raw: str, end_time_raw: str) -> list[dict]:
    """Last-resort: query cmdb_ci by last_discovered time window."""
    if not start_time_raw:
        LOG.warning("  No start_time available — cannot perform fallback CI query.")
        return []

    q = f"last_discovered>={start_time_raw}"
    if end_time_raw:
        q += f"^last_discovered<={end_time_raw}"

    LOG.info("  Fallback cmdb_ci query: %s", q)
    rows = sn.get("cmdb_ci", fields=["sys_id", "sys_created_on"], query=q, limit=500)

    result = []
    for r in rows:
        ci_sys_id = _val(r["sys_id"])
        if not ci_sys_id:
            continue
        ci_created = _val(r.get("sys_created_on"))
        state = "Created" if (start_time_raw and ci_created and ci_created >= start_time_raw) else "Updated"
        ci_data = fetch_ci_details(sn, ci_sys_id)
        result.append({"state": state, **ci_data})
    return result


# ── CI detail fetch ───────────────────────────────────────────────────────────

def fetch_ci_details(sn: SnClient, ci_sys_id: str) -> dict:
    base_row = sn.get_one(
        "cmdb_ci",
        fields=BASE_CI_FIELDS,
        query=f"sys_id={ci_sys_id}",
    )
    if not base_row:
        return {"sysId": ci_sys_id, "name": "", "ciTable": "cmdb_ci"}

    ci_table = _val(base_row.get("sys_class_name")) or "cmdb_ci"
    base: dict = {
        "sysId":            _val(base_row["sys_id"]),
        "name":             _dv(base_row.get("name")),
        "ciTable":          ci_table,
        "ipAddress":        _dv(base_row.get("ip_address")),
        "fqdn":             _dv(base_row.get("fqdn")),
        "installStatus":    _dv(base_row.get("install_status")),
        "discoverySource":  _dv(base_row.get("discovery_source")),
        "lastDiscovered":   _dv(base_row.get("last_discovered")),
        "shortDescription": _dv(base_row.get("short_description")),
        "serialNumber":     _dv(base_row.get("serial_number")),
        "manufacturer":     _dv(base_row.get("manufacturer")),
        "model":            _dv(base_row.get("model_id")),
        "location":         _dv(base_row.get("location")),
        "assetTag":         _dv(base_row.get("asset_tag")),
    }

    # Class-specific fields
    if ci_table not in ("cmdb_ci", ""):
        extra = CLASS_FIELD_MAP.get(ci_table, DEFAULT_EXTRA_FIELDS)
        extra = [f for f in extra if f not in ("sys_id", "name")]
        if extra:
            class_row = sn.get_one(
                ci_table,
                fields=["sys_id"] + extra,
                query=f"sys_id={ci_sys_id}",
            )
            if class_row:
                details: dict = {}
                for field in extra:
                    val = class_row.get(field)
                    if val is not None:
                        dv = _dv(val)
                        if dv:
                            details[field] = dv
                base["classDetails"] = details

    # Relations
    base["relations"] = fetch_ci_relations(sn, ci_sys_id)

    return base


def fetch_ci_relations(sn: SnClient, ci_sys_id: str) -> list[dict]:
    parent_rows = sn.get(
        "cmdb_rel_ci",
        fields=["sys_id", "parent", "child", "type"],
        query=f"parent={ci_sys_id}",
        limit=50,
    )
    child_rows = sn.get(
        "cmdb_rel_ci",
        fields=["sys_id", "parent", "child", "type"],
        query=f"child={ci_sys_id}",
        limit=50,
    )

    relations: list[dict] = []
    for r in parent_rows:
        relations.append({
            "direction": "outbound",
            "relType":   _dv(r.get("type")),
            "ciName":    _dv(r.get("child")),
            "ciSysId":   _val(r.get("child")),
        })
    for r in child_rows:
        relations.append({
            "direction": "inbound",
            "relType":   _dv(r.get("type")),
            "ciName":    _dv(r.get("parent")),
            "ciSysId":   _val(r.get("parent")),
        })

    return relations


# ── Main ──────────────────────────────────────────────────────────────────────

def extract(args: argparse.Namespace) -> dict:
    LOG.info("Connecting to %s …", args.url)
    sn = SnClient(args.url, args.user, args.password)

    mid_server = fetch_mid_server(sn)
    schedule   = fetch_schedule(sn)

    latest_run: dict = {"found": False}
    if schedule.get("sysId"):
        latest_run = fetch_latest_run(sn, schedule["sysId"])

    return {
        "meta": {
            "instance":      args.url.rstrip("/"),
            "extractedAt":   datetime.now(timezone.utc).isoformat(),
            "midServerName": MID_SERVER_NAME,
            "scheduleName":  DISCOVERY_SCHEDULE_NAME,
        },
        "midServer":  mid_server,
        "schedule":   schedule,
        "latestRun":  latest_run,
    }


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Extract ServiceNow Discovery run data (MID server, schedule, CIs) to JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--url",      required=True, help="ServiceNow instance URL")
    p.add_argument("--user",     required=True, help="Username")
    p.add_argument("--password", default=None,  help="Password (prompted if omitted)")
    p.add_argument(
        "--output",
        default=str(Path(__file__).parent / "data" / "discovery_runs.json"),
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

    run = data.get("latestRun", {})
    LOG.info(
        "Done. MID=%s  Schedule=%s  Run=%s  CIs=%d  →  %s",
        data["meta"]["midServerName"],
        data["meta"]["scheduleName"],
        run.get("number", "N/A"),
        len(run.get("discoveredCIs", [])),
        out,
    )


if __name__ == "__main__":
    main()
