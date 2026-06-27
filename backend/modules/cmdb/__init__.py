from .routes import blueprint
from core.module_registry import registry


def register():
    registry.register(
        "cmdb",
        blueprint,
        {
            "id": "cmdb",
            "name": "CMDB Explorer",
            "description": "CMDB class hierarchy, identification rules, relation types, and reconciliation",
            "icon": "database",
            "version": "1.0.0",
            "status": "stable",
            "nav": [
                {"id": "ire",           "label": "IRE & Reconciliation", "path": "/cmdb/ire"},
                {"id": "class-manager", "label": "CMDB Class Manager",   "path": "/cmdb/class-manager"},
            ],
        },
    )
