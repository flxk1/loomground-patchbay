// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 flxk1
//
// Say — the driver and the grower — over the shared store (units/state.mjs).
// One input, two roles, every effect a governed op through the /tool bridge.
//
//  DRIVER — a command path. The input names an op (bare, or `tool op k=v …`);
//    it resolves against the server's `help` registry, which stamps each op with
//    `mutates`. A read runs and renders structured; a write raises a confirm-card
//    (the op, its params, that it will be recorded) and fires the gated op only
//    on confirm. After a write the store re-reads, so Read re-projects in the
//    same tick. A disposition of `reserved` renders no execute control.
//    Anything that is not a command routes to governance_chat.
//
//  GROWER — the generative loop. A pasted policy (or `ingest …`) goes through
//    governance_chat (intent policy → policy_ingest) and renders the requisite-
//    variety ledger: express (the governor absorbs these, as Loomground
//    declarations) vs host/policy/unmapped (handed back to the human), plus the
//    drafted control patch — what may run and who answers, never a workflow. The
//    patch already round-trips loomground_lang; nothing applies until a human
//    confirms, and the confirm is the governed write (patch_apply on the
//    netlist — the same op the classic console uses, not a new apply path).

const OP_TOOLS = [
  "workspace_workflow", "workspace_policy", "workspace_audit", "workspace_folder",
  "workspace_workspace", "workspace_contract", "workspace_conformity", "workspace_legal",
  "workspace_matrix", "workspace_memory", "workspace_lens", "workspace_lock",
  "workspace_model", "workspace_grounder", "workspace_mirror", "workspace_erase",
  "workspace_capture", "workspace_ingest", "workspace_session", "workspace_dispatch",
];

// Dispositions the server may attach to a governed act. `reserved` is the one
// the human alone may complete — it renders no execute control.
const RESERVED = new Set(["reserved", "reserved_by_law"]);

export function createSay(store, call, doc) {
  const d = doc;
  const esc = (s) => { const e = d.createElement("div"); e.textContent = String(s == null ? "" : s); return e.innerHTML; };
  const base = (p) => String(p || "").split("/").pop() || p;

  let helpCache = null;                 // op-name → { tool, entry } (first tool wins)
  let policyText = "";                  // the session's accumulated rules (the ask corpus)

  function out() { return d.getElementById("say-out"); }
  function focus() { return store.getState().activeWorkspace || ""; }

  function show(html) {
    const o = out(); if (!o) return;
    o.innerHTML = html;
    o.style.display = "block";      // the stylesheet default is none; reveal it
  }
  function clear() { const o = out(); if (o) { o.innerHTML = ""; o.style.display = "none"; } }

  // Build the op index once from the `help` registry of every op-tool, so a bare
  // op name resolves to its tool and carries the server-stamped `mutates`.
  async function index() {
    if (helpCache) return helpCache;
    helpCache = {};
    const helps = await Promise.all(OP_TOOLS.map((t) =>
      call(t, { op: "help", params: {} }).then((h) => [t, h]).catch(() => [t, null])));
    for (const [tool, h] of helps) {
      const ops = h && Array.isArray(h.ops) ? h.ops : [];
      for (const e of ops) {
        if (e && typeof e === "object" && e.op && !(e.op in helpCache)) helpCache[e.op] = { tool, entry: e };
      }
    }
    return helpCache;
  }

  // Resolve one help entry. `tool op …` names its tool; a bare op is looked up.
  async function resolve(tool, op) {
    if (tool) {
      const h = await call(tool, { op: "help", params: {} }).catch(() => null);
      const ops = h && Array.isArray(h.ops) ? h.ops : [];
      const entry = ops.find((e) => e && e.op === op) || null;
      return entry ? { tool, entry } : null;
    }
    const idx = await index();
    return idx[op] || null;
  }

  // key=value tokens → params; folder_context defaults to the focused workspace
  // when the op declares it and the caller left it out (commands are scoped to
  // the active workspace, the console's context chip).
  function parseParams(tokens, entry) {
    const params = {};
    for (const t of tokens) {
      const i = t.indexOf("=");
      if (i > 0) params[t.slice(0, i)] = coerce(t.slice(i + 1));
    }
    const wants = new Set([...(entry.required || []), ...(entry.optional || [])]);
    if (wants.has("folder_context") && !("folder_context" in params) && focus()) params.folder_context = focus();
    return params;
  }
  function coerce(v) {
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+$/.test(v)) return Number(v);
    return v;
  }

  // --- structured result rendering (never raw JSON) --------------------------

  function rowsOf(r) {
    for (const k of ["parties", "events", "rows", "ops", "buses", "items", "records", "connectors"]) {
      if (Array.isArray(r[k])) return { key: k, rows: r[k] };
    }
    return null;
  }
  function renderResult(op, r) {
    if (r == null) return '<div class="say-err">no response</div>';
    if (r.error) return '<div class="say-err">' + esc(r.error) + "</div>";
    if (r.ok === false) return '<div class="say-err">' + esc(((r.errors || ["failed"])).join("; ")) + "</div>";
    // a reserved disposition completes with a person — no execute control here
    const disp = r.disposition || r.verdict;
    if (disp && RESERVED.has(String(disp))) {
      return '<div class="say-card"><b>' + esc(op) + "</b> · reserved by law — a person must sign off. "
        + "No execute control here.</div>";
    }
    const listed = rowsOf(r);
    if (listed) {
      const cols = columns(listed.rows);
      const head = "<tr>" + cols.map((c) => "<th>" + esc(c) + "</th>").join("") + "</tr>";
      const body = listed.rows.slice(0, 40).map((row) =>
        "<tr>" + cols.map((c) => "<td>" + esc(cell(row, c)) + "</td>").join("") + "</tr>").join("");
      return '<div class="say-card"><div class="say-h">' + esc(op) + " · " + listed.rows.length + " "
        + esc(listed.key) + '</div><div class="say-scroll"><table class="say-tbl">' + head + body + "</table></div></div>";
    }
    // a scalar/verdict result → labelled key/value rows
    const kv = Object.keys(r).filter((k) => typeof r[k] !== "object").slice(0, 12);
    const rows = kv.map((k) => '<div class="say-kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(r[k]) + "</span></div>").join("");
    return '<div class="say-card"><div class="say-h">' + esc(op) + "</div>" + (rows || '<div class="say-kv">done</div>') + "</div>";
  }
  function columns(rows) {
    const seen = [];
    for (const row of rows.slice(0, 8)) {
      if (row && typeof row === "object") for (const k of Object.keys(row)) if (!seen.includes(k) && typeof row[k] !== "object") seen.push(k);
    }
    return seen.slice(0, 6);
  }
  function cell(row, c) {
    if (row == null || typeof row !== "object") return String(row);
    const v = row[c];
    return v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : v);
  }

  // --- the confirm-card (writes) ---------------------------------------------

  function renderConfirm(tool, op, params, entry) {
    const plist = Object.keys(params).map((k) =>
      '<div class="say-kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(params[k]) + "</span></div>").join("")
      || '<div class="say-kv">(no params)</div>';
    let h = '<div class="say-card say-confirm"><div class="say-h">Confirm — ' + esc(op) + "</div>"
      + '<div class="say-sub">a governed write via <code>' + esc(tool) + "</code>. "
      + "The server decides, and it will be recorded.</div>" + plist;
    if (isReservedEntry(entry)) {
      h += '<div class="say-sub say-reserved">Reserved by law — a person must sign off. No execute control here.</div>'
        + '<div class="say-actions"><button class="say-btn" data-say="cancel">Close</button></div>';
    } else {
      h += '<div class="say-actions">'
        + '<button class="say-btn say-go" data-say="run">Confirm &amp; run</button>'
        + '<button class="say-btn" data-say="cancel">Cancel</button></div>';
    }
    h += "</div>";
    show(h);
    const o = out();
    const cancel = o.querySelector('[data-say="cancel"]'); if (cancel) cancel.addEventListener("click", clear);
    const run = o.querySelector('[data-say="run"]');
    if (run) run.addEventListener("click", async () => {
      run.disabled = true; run.textContent = "running…";
      const r = await call(tool, { op, params }).catch((e) => ({ error: String(e && e.message || e) }));
      show(renderResult(op, r));
      // the write landed — re-read so Read (and env) re-project in the same tick
      if (!(r && (r.error || r.ok === false))) await store.hydrate();
    });
  }
  // An op the server declares reserved-by-law renders no execute control. Read
  // from the help entry, never guessed from the op name.
  function isReservedEntry(entry) {
    if (!entry) return false;
    if (entry.reserved === true || RESERVED.has(String(entry.disposition || ""))) return true;
    return /\breserved by law\b/i.test(entry.note || "");
  }

  // --- the grower: the variety ledger + the drafted control patch ------------

  async function grow(text, forceIntent) {
    show('<div class="say-card"><div class="say-h">drafting…</div></div>');
    const params = { folder_context: focus(), text, policy_text: policyText };
    if (forceIntent) params.intent = forceIntent;
    const r = await call("workspace_workflow", { op: "governance_chat", params }).catch((e) => ({ error: String(e && e.message || e) }));
    if (!r || r.error) { show('<div class="say-err">' + esc((r && r.error) || "chat failed") + "</div>"); return; }
    if (r.kind === "twin") {
      if (r.intent === "policy") policyText = (policyText ? policyText + "\n" : "") + text;
      await renderLedger(r.result);
      return;
    }
    // ask / intake render structured, not raw JSON
    if (r.kind === "map") { show('<div class="say-card"><div class="say-h">answer</div><div class="say-sub">' + esc(summariseMap(r.result)) + "</div></div>"); return; }
    if (r.kind === "card") { const c = r.result || {}; show('<div class="say-card"><div class="say-h">use case captured</div><div class="say-sub">' + esc(c.description || "") + " · " + Math.round((c.completeness || 0) * 100) + "% complete</div></div>"); return; }
    show(renderResult(r.echo || r.intent || "chat", r.result || {}));
  }
  function summariseMap(m) {
    if (!m || typeof m !== "object") return "—";
    if (typeof m.summary === "string") return m.summary;
    if (typeof m.answer === "string") return m.answer;
    return "answered from the map";
  }

  async function renderLedger(twin) {
    store.setState({ chatContext: Object.assign({}, store.getState().chatContext, { ledger: twin }) });
    if (!twin || twin.ok === false) {
      show('<div class="say-err">could not draft a twin: ' + esc(((twin && twin.errors) || ["unknown"]).join("; ")) + "</div>");
      return;
    }
    if (twin.quarantined) {
      show('<div class="say-card"><div class="say-h">routed to the interpreter</div><div class="say-sub">'
        + esc(twin.note || "a court decision interprets norms; it does not enact them — no patch drafted") + "</div></div>");
      return;
    }
    const c = twin.classification || {};
    const li = (a) => (a && a.length) ? a.map((x) => "<li>" + esc(x) + "</li>").join("") : '<li class="none">none</li>';
    const patch = twin.patch || {};
    const nN = (patch.nodes || []).length, nC = (patch.cords || []).length;
    const nR = (patch.reservations || []).length, nP = (patch.prohibitions || []).length;

    // belt-and-braces: re-validate the drafted patch through loomground_lang so
    // the confirm is offered only against a patch the server calls valid
    let valid = twin.ok === true && !!twin.netlist;
    if (focus()) {
      const v = await call("workspace_workflow", { op: "patch_validate", params: { folder_context: focus(), netlist: twin.netlist } }).catch(() => null);
      if (v && typeof v.ok === "boolean") valid = v.ok;
    }

    const fc = focus();
    let h = '<div class="say-card say-ledger">';
    h += '<div class="say-h">Draft control patch — what may run, who answers. Not a workflow.</div>';
    h += '<div class="say-sub">' + esc(twin.note || "declares governance; does not certify. Applies nothing until you confirm.") + "</div>";
    // the requisite-variety ledger
    h += '<div class="say-led-grp"><label>Express — the governor absorbs these, as Loomground declarations ('
      + ((c.express || []).length) + ")</label><ul class=\"say-ul express\">" + li(c.express) + "</ul></div>";
    h += '<div class="say-led-grp"><div class="say-handback">Handed back to you:</div>';
    h += '<label>Host — the runtime must do these (' + ((c.host || []).length) + ')</label><ul class="say-ul">' + li(c.host) + "</ul>";
    h += '<label>Policy — values to confirm (' + ((c.policy || []).length) + ')</label><ul class="say-ul">' + li(c.policy) + "</ul>";
    if ((c.unmapped || []).length) h += '<label>Unmapped — review (' + c.unmapped.length + ')</label><ul class="say-ul">' + li(c.unmapped) + "</ul>";
    h += "</div>";
    // the drafted patch, stated as control not execution
    h += '<div class="say-sub say-patch">Patch: ' + nN + " node" + (nN === 1 ? "" : "s") + ", " + nC + " authority cord" + (nC === 1 ? "" : "s")
      + ", " + nR + " reservation" + (nR === 1 ? "" : "s") + (nP ? ", " + nP + " prohibition" + (nP === 1 ? "" : "s") : "")
      + " · " + (valid ? "Loomground-valid ✓" : "not valid — cannot apply") + "</div>";
    h += '<details class="say-lg"><summary>.lg netlist</summary><pre>' + esc(twin.netlist || "") + "</pre></details>";
    // applied stays false until the human confirms; the confirm is the write
    const canApply = valid && !!fc;
    h += '<div class="say-actions"><button class="say-btn say-go" data-say="apply"' + (canApply ? "" : ' disabled title="' + (fc ? "patch not valid" : "open a workspace to apply") + '"')
      + ">Confirm &amp; apply to the chain</button>"
      + '<button class="say-btn" data-say="cancel">Close</button></div>';
    h += "</div>";
    show(h);
    const o = out();
    const cancel = o.querySelector('[data-say="cancel"]'); if (cancel) cancel.addEventListener("click", clear);
    const apply = o.querySelector('[data-say="apply"]');
    if (apply && canApply) apply.addEventListener("click", () => applyTwin(twin));
  }

  // Reuse the classic console's apply path exactly: patch_apply on the netlist.
  async function applyTwin(twin) {
    const fc = focus(); if (!twin || twin.ok === false || !fc) return;
    const o = out(); const apply = o && o.querySelector('[data-say="apply"]');
    if (apply) { apply.disabled = true; apply.textContent = "applying…"; }
    const res = await call("workspace_workflow", { op: "patch_apply", params: { folder_context: fc, actor: "app-user", netlist: twin.netlist } })
      .catch((e) => ({ ok: false, errors: [String(e && e.message || e)] }));
    if (!res || res.ok === false) {
      show('<div class="say-err">apply failed — nothing written: ' + esc(((res && res.errors) || ["unknown"]).join("; ")) + "</div>");
      return;
    }
    show('<div class="say-card"><div class="say-h">applied to the chain</div><div class="say-sub">the control patch is now governing this workspace.</div></div>');
    store.setState({ chatContext: Object.assign({}, store.getState().chatContext, { ledger: null }) });
    await store.hydrate();           // the write landed — every surface re-projects
  }

  // --- the op palette (`?`) --------------------------------------------------

  async function palette(filter) {
    const idx = await index();
    const names = Object.keys(idx).filter((n) => !filter || n.indexOf(filter) >= 0).sort();
    const rows = names.slice(0, 60).map((n) => {
      const e = idx[n];
      return '<tr><td>' + esc(n) + '</td><td>' + esc(base(e.tool).replace("workspace_", "")) + "</td><td>"
        + (e.entry.mutates ? "writes" : "reads") + "</td></tr>";
    }).join("");
    show('<div class="say-card"><div class="say-h">ops (' + names.length + ") — type an op name to run it</div>"
      + '<div class="say-scroll"><table class="say-tbl"><tr><th>op</th><th>tool</th><th></th></tr>' + rows + "</table></div></div>");
  }

  // --- the one entry point ---------------------------------------------------

  async function submit(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return;
    const hist = store.getState().chatContext.history || [];
    store.setState({ chatContext: Object.assign({}, store.getState().chatContext, { history: hist.concat([text]) }) });

    if (text === "?" || text.startsWith("? ")) { await palette(text.slice(1).trim()); return; }

    // explicit ingest command forces the grower's policy intent
    const ing = /^ingest\s+([\s\S]+)/i.exec(text);
    if (ing) { await grow(ing[1].trim(), "policy"); return; }

    // command grammar: `tool op …` or a bare op resolved through the registry
    const tokens = text.split(/\s+/);
    let tool = null, op = null, rest = [];
    if (OP_TOOLS.includes(tokens[0]) && tokens[1]) { tool = tokens[0]; op = tokens[1]; rest = tokens.slice(2); }
    else { op = tokens[0]; rest = tokens.slice(1); }

    const hit = await resolve(tool, op).catch(() => null);
    if (!hit) {
      // not a command — natural language → the intent router (governance_chat)
      await grow(text, null);
      return;
    }
    const params = parseParams(rest, hit.entry);
    if (hit.entry.mutates) { renderConfirm(hit.tool, op, params, hit.entry); return; }
    // a read runs and renders structured
    show('<div class="say-card"><div class="say-h">' + esc(op) + " · running…</div></div>");
    const r = await call(hit.tool, { op, params }).catch((e) => ({ error: String(e && e.message || e) }));
    show(renderResult(op, r));
  }

  return { submit, clear, grow, palette, resolve, _index: index };
}
