#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright 2026 flxk1
"""Real render test for the Loom canvas (the unified Pd-DAW home surface).

Boots serve.py, seeds a live patch through the same facades the app uses, then
runs loom_render.mjs which loads the actual index.html in jsdom against the
running shim and asserts every section renders from live data.

  python3 app/loom_render_test.py
"""
from __future__ import annotations
import os, sys, time, tempfile, threading, subprocess
from pathlib import Path

HERE = Path(__file__).parent
tmp = tempfile.mkdtemp(prefix="loomrender_")
os.environ["WORKSPACE_KEY_DIR"] = os.path.join(tmp, "keys")
os.environ["WORKSPACE_L0_LOG_ROOT"] = os.path.join(tmp, "logs")
os.environ.setdefault("WORKSPACES_ALLOW_UNREGISTERED", "1")

sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE.parent.parent / "server" / "src"))
import rvnd_test_bridge as serve      # noqa: E402
import workspaces.mcp_server as S          # noqa: E402

F = os.path.join(tmp, "org")
os.makedirs(F, exist_ok=True)


def setup():
    S.workspace_policy("party_register", {"folder_context": F, "party_id": "bot7", "kind": "agent", "grade": "L2"})
    S.workspace_policy("party_register", {"folder_context": F, "party_id": "alice", "kind": "human"})
    S.workspace_workflow("use_case_register", {"folder_context": F, "use_case_id": "uc-draft", "name": "Draft",
                                          "fingerprint": {"issue_type": "liability_cap"}, "risk": "low",
                                          "allowed_agents": ["bot7"], "actor": "operator",
                                          "prior_approvals": 25, "override_window_seconds": 120})
    S.workspace_workflow("use_case_register", {"folder_context": F, "use_case_id": "uc-decide", "name": "Decide",
                                          "fingerprint": {"issue_type": "automated_decision"}, "risk": "high",
                                          "allowed_agents": ["bot7"], "actor": "operator",
                                          "override_window_seconds": 120})
    # post-G2: a use case reserves only from an AUTHORED reserve (the legal enum is gone)
    S.workspace_workflow("patch_apply", {"folder_context": F, "actor": "operator", "netlist":
        "actor bot7\ngate uc-decide risk high grant bot7\ncord bot7 -> uc-decide\n"
        "cord uc-decide -> master\nreserve uc-decide by data-protection\n"})
    S.workspace_workflow("operate", {"folder_context": F, "use_case_id": "uc-draft", "agent_id": "bot7",
                                "issues": [{"issue_id": "i1", "issue_type": "liability_cap", "completeness": "high"}],
                                "now_epoch": 1000})
    S.workspace_workflow("operate", {"folder_context": F, "use_case_id": "uc-decide", "agent_id": "bot7",
                                "issues": [{"issue_id": "i2", "issue_type": "automated_decision", "completeness": "high"}],
                                "now_epoch": 1000})


def main() -> int:
    setup()
    os.environ["RVND_BRIDGE_TOKEN"] = os.urandom(24).hex()  # server + node share this session token
    srv = serve.make_server(port=0)          # ephemeral — no cross-test collisions
    PORT = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    time.sleep(0.3)
    try:
        r = subprocess.run(["node", str(HERE / "loom_render.mjs"), str(PORT), F],
                           capture_output=True, text=True, timeout=40)
    finally:
        srv.shutdown()
    print((r.stdout + r.stderr).strip())
    return 0 if r.returncode == 0 and "PASS" in r.stdout else 1


if __name__ == "__main__":
    raise SystemExit(main())
