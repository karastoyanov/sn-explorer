from .routes import blueprint
from core.module_registry import registry


def register():
    registry.register(
        "release_notes",
        blueprint,
        {
            "id": "release_notes",
            "name": "Release Notes",
            "description": "Latest releases and changelog, synced hourly from GitHub",
            "icon": "tag",
            "version": "1.0.0",
            "status": "stable",
            "nav": [],
        },
    )
