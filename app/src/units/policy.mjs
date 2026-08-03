// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 flxk1
//
// Policy — the P4 surface as a composable widget: paste an AI policy, Rvnd
// drafts a governance twin (declares what it can, hands the rest to the host),
// and applies NOTHING until you confirm. The confirm is the auto-instrumented
// write (workspace_workflow policy_ingest → patch_apply). A read-only query bar
// (governance_query) asks the patch the questions a spreadsheet can't. Same
// contract as the other units: createPolicy(store, call, doc) → {mount, unmount,
// refresh}. All I/O is the injected /tool bridge; the server decides, this only
// drafts and shows. Reimplemented from the classic policy panel with no
// dependency on the classic shell runtime (S/stage/modalize/draft helpers).

const QUERIES = [
  'unfired', 'reserved', 'ungrounded', 'over_reach', 'unheld', 'orphans',
];

export function createPolicy(store, call, doc) {
  const esc = (s) => { const e = doc.createElement('div'); e.textContent = String(s == null ? '' : s); return e.innerHTML; };
  let root = null;
  let unsub = null;
  let twin = null;   // last drafted twin (confirm applies it)

  function focus() { return store.getState().activeWorkspace || ''; }
  function say(msg) { const el = root && root.querySelector('#pol-live'); if (el) el.textContent = msg; }

  function mount(container) {
    root = container;
    paint();
    // a focus switch invalidates a half-drafted twin (it targets the old chain)
    unsub = store.subscribe(() => { twin = null; paint(); });
  }
  function unmount() { if (unsub) unsub(); unsub = null; root = null; twin = null; }
  function refresh() { paint(); }

  function paint() {
    if (!root) return;
    const fc = focus();
    root.innerHTML =
      '<div class="pol-wrap">'
      + '<span id="pol-live" class="sr-only" aria-live="polite"></span>'
      + '<div class="pol-sec">'
      + '<label class="pol-lbl">Ingest a policy → digital twin</label>'
      + '<div class="pol-hint">Paste your AI policy. Rvnd drafts a governance twin — it declares what it can, hands the rest to the host, and applies nothing until you confirm.</div>'
      + '<textarea id="pol-text" aria-label="Policy text" placeholder="e.g. Automated decisions must be reviewed by a compliance officer."></textarea>'
      + '<label class="pol-chk"><input type="checkbox" id="pol-llm"> draft with the local model when one is capable — degrades to the deterministic extractor and says so</label>'
      + '<div class="pol-btns"><button id="pol-build" class="pol-btn pol-accent">Build twin</button></div>'
      + '<div id="pol-out" role="status" aria-live="polite"></div>'
      + '</div>'
      + '<div class="pol-sec">'
      + '<label class="pol-lbl">Ask the patch — read-only</label>'
      + '<div class="pol-qrow"><select id="pol-q">' + QUERIES.map((q) => '<option value="' + esc(q) + '">' + esc(q) + '</option>').join('') + '</select>'
      + '<button id="pol-run" class="pol-btn">Run query</button></div>'
      + '<div id="pol-qout" role="status" aria-live="polite"></div>'
      + '</div>'
      + (fc ? '' : '<div class="pol-hint">open a workspace for live drafting and queries</div>')
      + '</div>';
    wire();
  }

  function wire() {
    const build = root.querySelector('#pol-build');
    if (build) build.addEventListener('click', ingest);
    const run = root.querySelector('#pol-run');
    if (run) run.addEventListener('click', runQuery);
  }

  async function ingest() {
    const ta = root.querySelector('#pol-text');
    const out = root.querySelector('#pol-out');
    const llm = root.querySelector('#pol-llm');
    const policy = ta ? ta.value : '';
    if (!policy.trim()) { out.innerHTML = '<div class="pol-note dim">paste a policy first</div>'; return; }
    out.innerHTML = '<div class="pol-note dim">drafting…</div>';
    const params = { folder_context: focus(), policy_text: policy };
    if (llm && llm.checked) params.use_llm = true;   // by choice; the gate degrades declared, never silent
    let r;
    try { r = await call('workspace_workflow', { op: 'policy_ingest', params }); }
    catch (e) { out.innerHTML = '<div class="pol-note bad">err: ' + esc(e && e.message) + '</div>'; return; }
    twin = r;
    out.innerHTML = renderTwin(r);
    const ab = out.querySelector('#pol-apply');
    if (ab) ab.addEventListener('click', apply);
  }

  function renderTwin(r) {
    if (!r || !r.ok) return '<div class="pol-note bad"><b>Could not build a twin</b> ' + esc(((r && r.errors) || ['unknown']).join('; ')) + '</div>';
    const c = r.classification || {};
    const li = (a) => (a && a.length) ? a.map((x) => '<li>' + esc(x) + '</li>').join('') : '<li class="dim">none</li>';
    let h = '<div class="pol-note ok"><b>✓ draft twin — not yet applied</b> ' + esc(r.note || '') + '</div>';
    if (r.capability && r.capability.capable === false) {
      h += '<div class="pol-note warn"><b>Drafted without the local model</b> ' + esc(r.capability.reason || 'no capable model registered') + ' — used the deterministic extractor.</div>';
    }
    h += '<label class="pol-lbl">Express — in the governance graph (' + ((c.express || []).length) + ')</label><ul class="pol-list">' + li(c.express) + '</ul>';
    h += '<label class="pol-lbl">Host hand-offs — the runtime must do these (' + ((r.host_handoffs || []).length) + ')</label><ul class="pol-list handoff">' + li(r.host_handoffs) + '</ul>';
    h += '<label class="pol-lbl">Policy values — to confirm (' + ((c.policy || []).length) + ')</label><ul class="pol-list dim">' + li(c.policy) + '</ul>';
    if ((c.unmapped || []).length) h += '<label class="pol-lbl">Unmapped — review (' + c.unmapped.length + ')</label><ul class="pol-list dim">' + li(c.unmapped) + '</ul>';
    h += '<details class="pol-det"><summary>.lg netlist</summary><pre>' + esc(r.netlist || '') + '</pre></details>';
    h += '<button id="pol-apply" class="pol-btn pol-ok"' + (focus() ? '' : ' disabled title="open a folder to apply"') + '>Confirm &amp; apply to the chain</button>';
    return h;
  }

  async function apply() {
    if (!twin || !twin.ok || !focus()) return;
    const out = root.querySelector('#pol-out');
    let res;
    try { res = await call('workspace_workflow', { op: 'patch_apply', params: { folder_context: focus(), actor: 'app-user', netlist: twin.netlist } }); }
    catch (e) { res = { ok: false, errors: [e && e.message] }; }
    if (!res || res.ok === false) {
      out.insertAdjacentHTML('afterbegin', '<div class="pol-note bad"><b>Apply failed — nothing written</b> ' + esc(((res && res.errors) || ['unknown']).join('; ')) + '</div>');
      return;
    }
    twin = null;
    say('policy applied to the chain');
    out.innerHTML = '<div class="pol-note ok"><b>✓ applied</b> written to the chain.</div>';
    // re-project so every surface (Read, the patchbay) sees the new tip this tick
    if (store.project) store.project().catch(() => {});
  }

  async function runQuery() {
    const sel = root.querySelector('#pol-q');
    const out = root.querySelector('#pol-qout');
    const name = sel ? sel.value : '';
    if (!name) return;
    out.innerHTML = '<div class="pol-note dim">querying…</div>';
    let r;
    try { r = focus() ? await call('workspace_workflow', { op: 'governance_query', params: { folder_context: focus(), query: name } }) : { rows: [], count: 0, _offline: true }; }
    catch (e) { out.innerHTML = '<div class="pol-note bad">err: ' + esc(e && e.message) + '</div>'; return; }
    if (r._offline) { out.innerHTML = '<div class="pol-note dim">open a folder for live queries</div>'; return; }
    let h = '<div class="pol-qhead"><b>' + esc(name) + '</b> · ' + (r.count || 0) + ' result' + (r.count === 1 ? '' : 's') + '</div>';
    if (!r.rows || !r.rows.length) h += '<div class="pol-note ok">✓ none</div>';
    else h += r.rows.map((row) => '<div class="pol-qrow-out">' + Object.entries(row).map(([k, v]) => '<span class="dim">' + esc(k) + ':</span> ' + esc(v)).join(' · ') + '</div>').join('');
    out.innerHTML = h;
  }

  return { mount, unmount, refresh };
}
