#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 flxk1
"""Standalone static server for the Patchbay presentation plane.

RVND may consume :class:`host.HostRoutes` and add its own runtime bridge.
This entry point deliberately serves only Patchbay-owned HTML, JavaScript,
fonts, and units. It imports no plane runtime or governance implementation.
"""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from host import HostRoutes


class PatchbayHandler(HostRoutes, BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if not self.handle_host_get():
            self._send(404, {"error": "not found"})


def make_server(host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), PatchbayHandler)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the standalone Patchbay widget")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = make_server(args.host, args.port)
    address, port = server.server_address[:2]
    print(f"Patchbay widget: http://{address}:{port}/widget", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
