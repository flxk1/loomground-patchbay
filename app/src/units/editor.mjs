// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 flxk1
//
// Editor — the netlist surface (canvas ⇄ .lg ⇄ chain) as a composable widget.
// Type/edit a v0.5 .lg; Load current pulls the structure; Validate is
// fail-closed; nothing applies until Apply. createEditor(store, call, doc) →
// {mount, unmount, refresh}, all I/O over the injected /tool bridge
// (workspace_workflow governance_netlist / patch_validate / patch_apply).
// Reimplemented from the classic editor panel; no classic-shell dependency.

export function createEditor(store, call, doc) {
  const esc = (s) => { const e = doc.createElement('div'); e.textContent = String(s == null ? '' : s); return e.innerHTML; };
  let root = null;
  let unsub = null;
  let lastValid = null;   // observable validate outcome (test/automation hook)

  function focus() { return store.getState().activeWorkspace || ''; }

  function mount(container) {
    root = container;
    paint();
    unsub = store.subscribe(() => {});   // editor content is user-owned; don't clobber on reproject
  }
  function unmount() { if (unsub) unsub(); unsub = null; root = null; }
  function refresh() { paint(); }

  function paint() {
    if (!root) return;
    root.innerHTML =
      '<div class="ed-hint">Type a patch (actor / human / gate / cord). Validate is fail-closed; nothing applies until you Apply.</div>'
      + '<textarea id="ed-text" aria-label="Patch netlist" spellcheck="false"></textarea>'
      + '<div class="ed-btns">'
      + '<button id="ed-load" class="ed-btn">Load current</button>'
      + '<button id="ed-val" class="ed-btn ed-accent">Validate</button>'
      + '<button id="ed-apply" class="ed-btn ed-ok">Apply</button>'
      + '</div>'
      + '<div id="ed-out" role="status" aria-live="polite"></div>';
    root.querySelector('#ed-load').addEventListener('click', load);
    root.querySelector('#ed-val').addEventListener('click', validate);
    root.querySelector('#ed-apply').addEventListener('click', apply);
  }

  async function load() {
    const ta = root.querySelector('#ed-text');
    const out = root.querySelector('#ed-out');
    if (!ta || !focus()) { if (out) out.innerHTML = '<div class="ed-note dim">open a folder to load its patch</div>'; return; }
    try {
      const r = await call('workspace_workflow', { op: 'governance_netlist', params: { folder_context: focus() } });
      ta.value = (r && r.netlist) || '';
      if (out) out.innerHTML = '<div class="ed-note dim">Loaded structure only — reservations and other declarations live on the chain and aren’t shown here.</div>';
    } catch (e) { if (out) out.innerHTML = '<div class="ed-note bad">err: ' + esc(e && e.message) + '</div>'; }
  }

  async function validate() {
    const out = root.querySelector('#ed-out');
    const ta = root.querySelector('#ed-text');
    if (!out || !ta) return;
    let r;
    try { r = await call('workspace_workflow', { op: 'patch_validate', params: { folder_context: focus(), netlist: ta.value } }); }
    catch (e) { lastValid = false; out.innerHTML = '<div class="ed-note bad">err: ' + esc(e && e.message) + '</div>'; return; }
    lastValid = !!(r && r.ok);
    if (r && r.ok) {
      const pr = r.projection || {};
      out.innerHTML = '<div class="ed-note ok"><b>✓ well-formed</b> ' + ((pr.nodes || []).length) + ' nodes · ' + ((pr.cords || []).length) + ' cords</div>';
    } else {
      out.innerHTML = '<div class="ed-note bad"><b>✗ ' + ((r && r.stage === 'parse') ? 'parse error' : 'ill-formed') + '</b> ' + esc(((r && r.errors) || ['unknown']).join('; ')) + '</div>';
    }
  }

  async function apply() {
    const out = root.querySelector('#ed-out');
    const ta = root.querySelector('#ed-text');
    if (!out || !ta) return;
    if (!focus()) { out.innerHTML = '<div class="ed-note dim">open a folder to apply</div>'; return; }
    let r;
    try { r = await call('workspace_workflow', { op: 'patch_apply', params: { folder_context: focus(), actor: 'app-user', netlist: ta.value } }); }
    catch (e) { r = { ok: false, errors: [e && e.message] }; }
    if (!r || r.ok === false) {
      out.innerHTML = '<div class="ed-note bad"><b>Apply failed — nothing written</b> ' + esc(((r && r.errors) || ['unknown']).join('; ')) + '</div>';
      return;
    }
    out.innerHTML = '<div class="ed-note ok"><b>✓ applied</b> written to the chain.</div>';
    if (store.project) store.project().catch(() => {});
  }

  // exposed for tests/automation, mirrors classic's window._edvalid
  function validState() { return lastValid; }

  return { mount, unmount, refresh, validState };
}
