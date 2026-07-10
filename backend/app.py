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
from modules.cmdb import register as register_cmdb
from modules.release_notes import register as register_release_notes
from modules.release_notes.routes import start_scheduler as start_release_notes_scheduler


def create_app():
    app = Flask(__name__)
    CORS(app)

    register_discovery()
    register_service_mapping()
    register_cmdb()
    register_release_notes()

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
    # debug=True below spawns a reloader child process (WERKZEUG_RUN_MAIN=true)
    # that re-runs this whole script — only that child should own the
    # background fetch loop, or releases get fetched twice per interval.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        start_release_notes_scheduler()
    app.run(debug=True, port=5000)
