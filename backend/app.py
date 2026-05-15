import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass

from flask import Flask, jsonify
from flask_cors import CORS
from core.module_registry import registry
from modules.discovery import register as register_discovery
from modules.service_mapping import register as register_service_mapping


def create_app():
    app = Flask(__name__)
    CORS(app)

    register_discovery()
    register_service_mapping()

    for bp in registry.get_blueprints():
        app.register_blueprint(bp)

    @app.route("/api/modules")
    def get_modules():
        return jsonify(registry.get_all_metadata())

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    return app


if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)
