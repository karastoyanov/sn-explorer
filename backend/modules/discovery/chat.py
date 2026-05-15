import json
import logging
from pathlib import Path

LOG = logging.getLogger(__name__)

_DATA_DIR  = Path(__file__).parent.parent.parent / "scripts" / "data"
_LOCAL_DIR = Path(__file__).parent / "data"

_client        = None
_system_text:  str | None = None
_system_mtime: float = 0.0


def _get_client():
    global _client
    if _client is None:
        try:
            from openai import OpenAI
            _client = OpenAI()
        except ImportError:
            raise RuntimeError("openai package not installed. Run: pip install openai")
    return _client


def _build_system_text() -> str:
    """Build (or return cached) system prompt string."""
    global _system_text, _system_mtime

    patterns_path = _DATA_DIR / "patterns_all.json"
    if not patterns_path.exists():
        patterns_path = _LOCAL_DIR / "patterns.json"

    current_mtime = patterns_path.stat().st_mtime if patterns_path.exists() else 0.0
    if _system_text is not None and current_mtime == _system_mtime:
        return _system_text

    if patterns_path.exists():
        raw = json.loads(patterns_path.read_text(encoding="utf-8"))
        patterns = raw.get("patterns", raw) if isinstance(raw, dict) else raw
    else:
        patterns = []
        LOG.warning("No patterns file found — AI context will be empty")

    compact = [
        {
            "id":             p.get("id", ""),
            "name":           p.get("name", ""),
            "category":       p.get("category", ""),
            "type":           p.get("type", ""),
            "protocol":       p.get("protocol", ""),
            "port":           p.get("port", ""),
            "credentialType": p.get("credentialType", ""),
            "mainCi":         p.get("mainCi", ""),
            "description":    p.get("description", ""),
            "extends":        p.get("extends", []),
        }
        for p in patterns
    ]

    stages = json.loads((_LOCAL_DIR / "stages.json").read_text(encoding="utf-8"))
    ire    = json.loads((_LOCAL_DIR / "ire.json").read_text(encoding="utf-8"))

    _system_text = f"""You are an expert assistant for ServiceNow Discovery — the ITOM module that \
automatically discovers and populates the CMDB. You help developers, consultants, and product managers \
understand Discovery patterns, stages, probes, sensors, classifiers, and the IRE \
(Identification and Reconciliation Engine).

Answer questions based on the data below. Be precise and cite pattern names and IDs when relevant. \
Keep answers concise unless the user asks for more detail. Format lists and comparisons as markdown.

## Discovery Patterns ({len(patterns)} total)
{json.dumps(compact, indent=2)}

## Discovery Stages
{json.dumps(stages, indent=2)}

## IRE — Identification & Reconciliation Engine
{json.dumps(ire, indent=2)}"""

    _system_mtime = current_mtime
    LOG.info("Built AI system context: %d patterns", len(patterns))
    return _system_text


def stream_chat(messages: list[dict]):
    """Yield text chunks for a streaming AI response."""
    client      = _get_client()
    system_text = _build_system_text()

    full_messages = [{"role": "system", "content": system_text}, *messages]

    stream = client.chat.completions.create(
        model="gpt-4o-mini",
        max_tokens=1024,
        messages=full_messages,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
