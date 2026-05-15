class ModuleRegistry:
    def __init__(self):
        self._modules = {}

    def register(self, module_id, blueprint, metadata):
        self._modules[module_id] = {"blueprint": blueprint, "metadata": metadata}

    def get_all_metadata(self):
        return [v["metadata"] for v in self._modules.values()]

    def get_blueprints(self):
        return [v["blueprint"] for v in self._modules.values()]


registry = ModuleRegistry()
