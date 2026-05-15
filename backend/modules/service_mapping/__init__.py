from .routes import blueprint
from core.module_registry import registry


def register():
    registry.register(
        "service_mapping",
        blueprint,
        {
            "id": "service_mapping",
            "name": "Service Mapping",
            "description": "ServiceNow Service Mapping patterns, traffic-based discovery, and business service relationships",
            "icon": "map",
            "version": "0.1.0",
            "status": "coming_soon",
            "nav": [],
        },
    )
