// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 flxk1
//
// Standalone real-DOM gate for the reusable govlive unit (units/govlive.mjs).
// No server and no RVND: it mounts createGovlive with a fake store/call/doc and
// a seeded board dict (the governance_live §1 contract shape), then asserts the
// board renders HONESTLY — admission honesty (an un-admitted session renders
// `refused` and loses the GO family, whatever it claimed), the summary tiles
// (escalations>0 flags its tile), run-lease rows, the signed-chain linkage in
// the DOM (each node's data-prev == the older node's data-hash), read-only (no
// <button>), and that the injected step-inspector callback fires on a chain-node
// activation. It also confirms the unit reads the board only over the `call`
// protocol (op name), never by importing a consumer.
// Usage: node govlive_render.mjs
import { JSDOM } from "jsdom";
import { createGovlive } from "../src/units/govlive.mjs";

const fail = (m) => { console.log("FAIL: " + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM("<!doctype html><body><div id=host></div></body>");
const doc = dom.window.document;

// A seeded board dict — the governance_live / §1 board contract.
const BOARD = {
  ok: true,
  summary: { sessions_open: 2, admitted: 1, run_leases_held: 1, escalations: 1 },
  sessions: [
    { sid: "sha256:s-live", admitted: true, verdict: "auto", grade: "L2", escalation: false,
      capability: { folder_context: "/ws", expires: "2026-08-10T12:00:00Z" } },
    { sid: "sha256:s-dead", admitted: false, verdict: "auto", grade: "L1", escalation: true },
  ],
  leases: [{ folder: "/ws", workflow: "reserved-task", holder: "agent-A", ttl_s: 30 }],
  chain: [
    { seq: 2, actor: "agent-2", event: "ingest", extra: "GovernedStep", hash: "hh2", prev_hash: "hh1" },
    { seq: 1, actor: "agent-1", event: "ingest", extra: "GovernedStep", hash: "hh1", prev_hash: "hh0" },
    { seq: 0, actor: "agent-0", event: "ingest", extra: "GovernedStep", hash: "hh0", prev_hash: "GENESIS" },
  ],
  boundary: {},
};

const calls = [];
const call = async (tool, args) => { calls.push([tool, args]); return BOARD; };
const store = { getState: () => ({ activeWorkspace: "/ws" }), subscribe: () => (() => {}) };

async function main() {
  let inspected = null;
  const unit = createGovlive(store, call, doc, { onInspectStep: (nd) => { inspected = nd; } });
  const host = doc.getElementById("host");
  unit.mount(host);
  for (let i = 0; i < 60 && !host.querySelector(".gl-summary"); i++) await sleep(10);

  // reads the board via the governance_live op (protocol string, not an import)
  if (!calls.some(([t, a]) => t === "workspace_workflow" && a.op === "governance_live"))
    fail("unit did not read the board via governance_live");

  // summary tiles
  if (host.querySelectorAll(".gl-tile").length !== 4) fail("expected 4 summary tiles");
  if (![...host.querySelectorAll(".gl-tile")].some((t) => t.getAttribute("data-warn") === "true"))
    fail("escalations>0 must flag its tile with data-warn");

  // admission honesty: the un-admitted session renders refused, not its claim
  const dead = host.querySelector('.gl-session[data-sid="sha256:s-dead"]');
  if (!dead) fail("dead session not rendered");
  if (dead.getAttribute("data-admitted") !== "false") fail("dead session must be data-admitted=false");
  if (dead.getAttribute("data-verdict") !== "refused") fail("un-admitted session must render refused, not its stated verdict");
  const live = host.querySelector('.gl-session[data-sid="sha256:s-live"]');
  if (live.getAttribute("data-verdict") !== "auto") fail("admitted session keeps its verdict");

  // run-lease row
  if (host.querySelectorAll(".gl-lease").length !== 1) fail("expected 1 lease row");

  // signed-chain linkage in the DOM: each node's data-prev is the older node's data-hash
  const nodes = [...host.querySelectorAll(".gl-node")];
  if (nodes.length !== 3) fail("expected 3 chain nodes");
  const bySeq = Object.fromEntries(nodes.map((n) => [n.dataset.seq, n]));
  if (bySeq["2"].dataset.prev !== bySeq["1"].dataset.hash) fail("chain linkage broken: node2.prev != node1.hash");
  if (bySeq["1"].dataset.prev !== bySeq["0"].dataset.hash) fail("chain linkage broken: node1.prev != node0.hash");

  // read-only: a monitor, never a control surface — no write controls
  if (host.querySelector("button")) fail("govlive board must have no write controls (<button>)");

  // the injected inspector is wired: activating a node calls onInspectStep
  bySeq["2"].click();
  if (!inspected || inspected.seq !== "2") fail("chain-node activation did not invoke the injected onInspectStep");

  console.log("PASS: govlive unit — board honesty, chain linkage, read-only, inspector injection");
  process.exit(0);
}
main();
