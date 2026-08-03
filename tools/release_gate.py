#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 flxk1
"""Fail-closed release gate for the Patchbay presentation plane."""
from __future__ import annotations

import json
import subprocess
import sys
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_VERSION = "0.3.0"
FORBIDDEN_PARTS = {".pytest_cache", "__pycache__", "node_modules"}
FORBIDDEN_NAMES = {".DS_Store", ".env", ".env.local"}
STANDALONE_GATE = ROOT / "app" / "standalone_render_test.py"
CONSOLE_GATE = ROOT / "app" / "console_render_test.py"
PRODUCTION_FILES = (
    ROOT / "app" / "host.py",
    ROOT / "app" / "serve.py",
)
FORBIDDEN_PRODUCTION_TEXT = (
    "import workspaces",
    "from workspaces",
    "PATCHBAY_RVND_ROOT",
    "RVND_BRIDGE_TOKEN",
    "github.com/flxk1/rvnd",
)


def fail(message: str) -> None:
    raise SystemExit(f"RELEASE GATE FAIL: {message}")


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True
    )
    return [
        ROOT / item.decode()
        for item in result.stdout.split(b"\0")
        if item and (ROOT / item.decode()).is_file()
    ]


def main() -> int:
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if package.get("name") != "loomground-patchbay":
        fail("package.json name must be loomground-patchbay")
    if package.get("version") != EXPECTED_VERSION:
        fail(f"package.json version must be {EXPECTED_VERSION}")
    if package.get("license") != "AGPL-3.0-only":
        fail("package.json license must be AGPL-3.0-only")

    supply_chain = subprocess.run(
        [sys.executable, "tools/supply_chain_gate.py", "--self-test"], cwd=ROOT)
    if supply_chain.returncode:
        fail("supply-chain license gate teeth failed")
    supply_chain = subprocess.run(
        [sys.executable, "tools/supply_chain_gate.py"], cwd=ROOT)
    if supply_chain.returncode:
        fail("supply-chain license/SBOM gate failed")

    files = tracked_files()
    bad = [
        path.relative_to(ROOT)
        for path in files
        if path.name in FORBIDDEN_NAMES or FORBIDDEN_PARTS.intersection(path.parts)
    ]
    if bad:
        fail("tracked release debris: " + ", ".join(map(str, bad)))
    if ROOT / "rvnd-test-revision.txt" in files:
        fail("Patchbay must not pin or clone RVND")

    for path in files:
        if path.suffix == ".json":
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")

    for path in sorted(ROOT.glob("**/*.py")):
        if FORBIDDEN_PARTS.intersection(path.parts):
            continue
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, UnicodeDecodeError, SyntaxError) as exc:
            fail(f"Python syntax error in {path.relative_to(ROOT)}: {exc}")

    for path in PRODUCTION_FILES:
        if not path.is_file():
            fail(f"missing standalone production file {path.relative_to(ROOT)}")
        text = path.read_text(encoding="utf-8")
        for forbidden in FORBIDDEN_PRODUCTION_TEXT:
            if forbidden in text:
                fail(
                    f"{path.relative_to(ROOT)} contains reverse dependency "
                    f"{forbidden!r}"
                )

    if not STANDALONE_GATE.is_file():
        fail("standalone Patchbay render gate is missing")
    print(f"==> {STANDALONE_GATE.relative_to(ROOT)}", flush=True)
    result = subprocess.run(
        [sys.executable, str(STANDALONE_GATE)],
        cwd=ROOT,
        env={"PATH": str(Path(sys.executable).parent), "PYTHONDONTWRITEBYTECODE": "1"},
    )
    if result.returncode:
        fail(f"{STANDALONE_GATE.relative_to(ROOT)} failed")

    if not CONSOLE_GATE.is_file():
        fail("live-console render gate is missing")
    print(f"==> {CONSOLE_GATE.relative_to(ROOT)}", flush=True)
    result = subprocess.run(
        [sys.executable, str(CONSOLE_GATE)],
        cwd=ROOT,
        env={"PATH": str(Path(sys.executable).parent), "PYTHONDONTWRITEBYTECODE": "1"},
    )
    if result.returncode:
        fail(f"{CONSOLE_GATE.relative_to(ROOT)} failed")

    print(
        "RELEASE GATE PASS: self-contained Patchbay widget + live console, "
        f"{len(files)} tracked files, JSON and Python coherent, no RVND dependency"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
