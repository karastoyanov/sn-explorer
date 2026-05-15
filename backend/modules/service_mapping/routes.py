from flask import Blueprint, jsonify

blueprint = Blueprint("service_mapping", __name__, url_prefix="/api/service-mapping")


@blueprint.route("/info")
def get_info():
    return jsonify({"status": "coming_soon", "message": "Service Mapping module is under development."})
