import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from flask import Blueprint, jsonify

blueprint = Blueprint("release_notes", __name__, url_prefix="/api/release-notes")
LOG = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com/repos/karastoyanov/sn-explorer/releases"
FETCH_INTERVAL_SECONDS = 60 * 60

CACHE_FILE = Path(__file__).parent / "data" / "releases_cache.json"

_releases:     list[dict] | None = None
_last_fetched: str | None        = None
_last_error:   str | None        = None
_lock = threading.Lock()


def _read_cache() -> None:
    """Seed in-memory state from the on-disk cache so a page load right after
    startup doesn't show empty results before the first live fetch completes."""
    global _releases, _last_fetched

    if _releases is not None or not CACHE_FILE.exists():
        return
    try:
        cached = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        _releases     = cached.get("releases", [])
        _last_fetched = cached.get("fetchedAt")
    except (json.JSONDecodeError, OSError):
        pass


def fetch_releases() -> None:
    """Fetch releases from GitHub and refresh the in-memory + on-disk cache."""
    global _releases, _last_fetched, _last_error

    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        resp = requests.get(GITHUB_API_URL, headers=headers, timeout=10)
        resp.raise_for_status()
        raw = resp.json()

        releases = [
            {
                "tagName":     r.get("tag_name"),
                "name":        r.get("name") or r.get("tag_name"),
                "body":        r.get("body") or "",
                "publishedAt": r.get("published_at"),
                "htmlUrl":     r.get("html_url"),
                "prerelease":  r.get("prerelease", False),
            }
            for r in raw
            if not r.get("draft")
        ]

        fetched_at = datetime.now(timezone.utc).isoformat()

        with _lock:
            _releases     = releases
            _last_fetched = fetched_at
            _last_error   = None

        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(
            json.dumps({"releases": releases, "fetchedAt": fetched_at}, indent=2),
            encoding="utf-8",
        )
        LOG.info("Fetched %d releases from GitHub", len(releases))

    except Exception as e:
        with _lock:
            _last_error = str(e)
        LOG.warning("Failed to fetch GitHub releases: %s", e)


def _scheduler_loop() -> None:
    while True:
        fetch_releases()
        time.sleep(FETCH_INTERVAL_SECONDS)


def start_scheduler() -> None:
    """Fetch releases immediately in the background, then refresh hourly for the life of the process."""
    _read_cache()
    threading.Thread(target=_scheduler_loop, daemon=True).start()


@blueprint.route("")
def get_release_notes():
    _read_cache()
    with _lock:
        return jsonify({
            "releases":    _releases or [],
            "lastFetched": _last_fetched,
            "error":       _last_error if not _releases else None,
        })
