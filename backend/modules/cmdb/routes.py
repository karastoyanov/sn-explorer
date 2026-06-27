import json
import logging
from pathlib import Path
from flask import Blueprint, jsonify, request

blueprint = Blueprint("cmdb", __name__, url_prefix="/api/cmdb")
LOG = logging.getLogger(__name__)

DATA_FILE = Path(__file__).parent.parent.parent / "scripts" / "data" / "cmdb_classes.json"

_data:  dict | None = None
_mtime: float       = 0.0


def _load() -> None:
    global _data, _mtime

    if not DATA_FILE.exists():
        if _data is None:
            LOG.warning(
                "cmdb_classes.json not found. "
                "Run: python scripts/extract_cmdb_classes.py --url ... --user ..."
            )
            _data = {}
        return

    current_mtime = DATA_FILE.stat().st_mtime
    if _data is not None and current_mtime == _mtime:
        return

    _data  = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    _mtime = current_mtime
    LOG.info(
        "Loaded CMDB data: %d classes, %d identifiers, %d rel types, %d recon defs",
        len(_data.get("classes", [])),
        len(_data.get("identifiers", [])),
        len(_data.get("relationTypes", [])),
        len(_data.get("reconciliationDefinitions", [])),
    )


@blueprint.route("/data")
def get_data():
    _load()
    if not _data:
        return jsonify({
            "meta": None,
            "classes": [],
            "identifiers": [],
            "relationTypes": [],
            "reconciliationDefinitions": [],
        })

    # Strip per-class fields array when not requested — keeps the response small
    include_fields = request.args.get("fields", "false").lower() == "true"

    classes = _data.get("classes", [])
    if not include_fields:
        classes = [
            {k: v for k, v in c.items() if k != "fields"}
            for c in classes
        ]

    return jsonify({
        "meta":                      _data.get("meta"),
        "classes":                   classes,
        "identifiers":               _data.get("identifiers", []),
        "relationTypes":             _data.get("relationTypes", []),
        "reconciliationDefinitions": _data.get("reconciliationDefinitions", []),
    })


@blueprint.route("/status")
def get_status():
    exists = DATA_FILE.exists()
    return jsonify({
        "fileExists": exists,
        "filePath":   str(DATA_FILE),
        "mtime":      DATA_FILE.stat().st_mtime if exists else None,
    })
