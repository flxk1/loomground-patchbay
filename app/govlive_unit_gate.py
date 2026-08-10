#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 flxk1
"""Contract + purity gate for the reusable govlive unit (units/govlive.mjs).

Patchbay's CI is pure-Python (no node/jsdom), so this gate guarantees the unit's
SHAPE and PURITY here: it exports ``createGovlive``, imports only the shared
verdict vocabulary (no console/host coupling), and carries no reverse dependency
on a consumer (RVND). The unit's BEHAVIOUR — admission honesty, signed-chain
linkage, read-only, injected inspector — is gated by the real-DOM render gate
``app/shell/govlive_render.mjs``, which the consumer (RVND, whose CI has jsdom)
vendors and runs. Each side gates exactly what it can prove; neither fakes it.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNIT = ROOT / "app" / "src" / "units" / "govlive.mjs"
RENDER_GATE = ROOT / "app" / "shell" / "govlive_render.mjs"

# The same reverse-dependency ban release_gate applies to production files: the
# extracted, reusable unit must never import or name a consumer.
_FORBIDDEN = (
    "import workspaces",
    "from workspaces",
    "PATCHBAY_RVND_ROOT",
    "RVND_BRIDGE_TOKEN",
    "github.com/flxk1/rvnd",
)


def main() -> int:
    if not UNIT.is_file():
        print("FAIL: units/govlive.mjs is missing")
        return 1
    text = UNIT.read_text(encoding="utf-8")
    if "export function createGovlive" not in text:
        print("FAIL: units/govlive.mjs must export createGovlive")
        return 1
    # Local imports may only be the shared verdict vocabulary — no coupling to
    # the console shell, the host, or any consumer module.
    local_imports = [
        line for line in text.splitlines()
        if line.strip().startswith("import ") and "./" in line
    ]
    stray = [line for line in local_imports if "./verdict.mjs" not in line]
    if stray:
        print("FAIL: units/govlive.mjs may only import ./verdict.mjs, found: "
              + "; ".join(s.strip() for s in stray))
        return 1
    for forbidden in _FORBIDDEN:
        if forbidden in text:
            print(f"FAIL: units/govlive.mjs carries a reverse dependency {forbidden!r}")
            return 1
    if not RENDER_GATE.is_file():
        print("FAIL: behavioural render gate app/shell/govlive_render.mjs is missing")
        return 1
    print("PASS: govlive unit exports createGovlive, imports only verdict, "
          "no consumer reverse dependency")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
