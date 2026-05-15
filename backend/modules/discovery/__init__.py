from .routes import blueprint
from core.module_registry import registry


def register():
    registry.register(
        "discovery",
        blueprint,
        {
            "id": "discovery",
            "name": "Discovery",
            "description": "ServiceNow Discovery patterns, stages, CI classes, and CMDB relationships",
            "icon": "radar",
            "version": "1.0.0",
            "status": "stable",
            "nav": [
                {"id": "overview", "label": "Overview", "path": "/discovery"},
                {"id": "stages", "label": "Discovery Stages", "path": "/discovery/stages"},
                {"id": "patterns", "label": "Patterns", "path": "/discovery/patterns"},
            ],
        },
    )
