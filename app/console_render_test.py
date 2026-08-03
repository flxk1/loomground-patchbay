#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 flxk1
"""Self-contained gate for the live console and its widget units.

Boots Patchbay's own server (no RVND backend) and asserts the console page
serves with its five-frame layout and imports every widget unit, and that each
unit module serves and exports its factory. Complements
standalone_render_test.py (the classic widget host): together they cover both
consoles the library ships, with no reverse dependency on any consumer.
"""
from __future__ import annotations

import threading
from urllib.request import urlopen

import serve

# The five factories the console mounts, plus verdict (a helper module the
# widgets import). Each maps to a symbol its module must export.
_CONSOLE_UNITS = {
    "state.mjs": "createStore",
    "say.mjs": "createSay",
    "patchbay.mjs": "createPatchbay",
    "run.mjs": "createRun",
    "matrix.mjs": "createMatrix",
}
_HELPER_UNITS = {"verdict.mjs": "resolveEgressVerdict"}
_SHELL_MARKERS = ('data-centre="build"', 'data-centre="run"',
                  "Search/Chat", 'id="centre-body"', 'id="ws"')


def _get(port: int, path: str) -> tuple[int, str]:
    with urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as r:
        return r.status, r.read().decode("utf-8")


def main() -> int:
    server = serve.make_server(port=0)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        status, html = _get(port, "/")
        if status != 200:
            print(f"FAIL: / did not serve (status {status})")
            return 1
        for marker in _SHELL_MARKERS:
            if marker not in html:
                print(f"FAIL: console shell missing {marker!r}")
                return 1
        for unit in _CONSOLE_UNITS:
            if f"/units/{unit}" not in html:
                print(f"FAIL: console does not import /units/{unit}")
                return 1
        for unit, symbol in {**_CONSOLE_UNITS, **_HELPER_UNITS}.items():
            s, mod = _get(port, f"/units/{unit}")
            if s != 200:
                print(f"FAIL: /units/{unit} did not serve (status {s})")
                return 1
            if symbol not in mod:
                print(f"FAIL: /units/{unit} does not export {symbol}")
                return 1
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    print("PASS: live console serves its five-frame shell, imports all five "
          "widgets; each unit module serves and exports its factory")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
