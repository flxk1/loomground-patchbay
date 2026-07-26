#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 flxk1
"""Boundary gate for Patchbay's standalone widget host."""
from __future__ import annotations

import threading
from urllib.request import urlopen

import serve


def main() -> int:
    server = serve.make_server(port=0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urlopen(
            f"http://127.0.0.1:{server.server_address[1]}/widget", timeout=5
        ) as response:
            html = response.read().decode("utf-8")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    if response.status != 200:
        return 1
    if "<title>Patchbay widget</title>" not in html:
        return 1
    if 'id="patchbay-widget-frame"' not in html:
        return 1
    if 'id="patchbay-widget-layout"' not in html:
        return 1
    if "#checkSec,#keybox{display:none!important}" not in html:
        return 1
    if "neutralizeWidget" not in html or '"module:source"' not in html:
        return 1
    print("PASS: standalone Patchbay widget — canonical renderer, no product chrome")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
