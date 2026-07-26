"""Test-only adapter that loads RVND's canonical bridge from a pinned snapshot."""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

rvnd_root = Path(os.environ["PATCHBAY_RVND_ROOT"]).resolve()
rvnd_serve = rvnd_root / "app" / "serve.py"
if not rvnd_serve.is_file():
    raise ModuleNotFoundError(f"pinned RVND bridge missing at {rvnd_serve}")

spec = importlib.util.spec_from_file_location("_patchbay_pinned_rvnd_bridge", rvnd_serve)
if spec is None or spec.loader is None:
    raise ImportError(f"cannot load pinned RVND bridge from {rvnd_serve}")
bridge = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = bridge
spec.loader.exec_module(bridge)

for name in dir(bridge):
    if not name.startswith("__"):
        globals()[name] = getattr(bridge, name)
