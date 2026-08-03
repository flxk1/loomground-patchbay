// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 flxk1
//
// Register — a read-only table of tasks (per folder): categorical status
// (verdict; reserved with attributed basis), never a score. An "All folders"
// roll-up lists the workspaces you've registered (not a disk scan). Composable
// widget: createRegister(store, call, doc) → {mount, unmount, refresh}, all I/O
// over the injected /tool bridge (workspace_workflow governance_register).
// Reimplemented from the classic register panel; no classic-shell dependency.

import { VINFO } from './verdict.mjs';

const BASIS = {
  law: 'required by law', professional: 'professional duty', policy: 'your policy',
};

export function createRegister(store, call, doc) {
  const esc = (s) => { const e = doc.createElement('div'); e.textContent = String(s == null ? '' : s); return e.innerHTML; };
  const bn = (p) => (p || '').replace(/\/+$/, '').split('/').pop() || p;
  let root = null;
  let unsub = null;

  function focus() { return store.getState().activeWorkspace || ''; }

  function basisTag(u) {
    if (!u.reserved) return 'no';
    const ts = [...new Set((u.reserved_bases || []).map((k) => BASIS[k]).filter(Boolean))];
    return '<b class="reg-basis">' + esc(ts.length ? ts.join(', ') : 'reserved') + '</b>';
  }

  function mount(container) { root = container; load(); unsub = store.subscribe(() => load()); }
  function unmount() { if (unsub) unsub(); unsub = null; root = null; }
  function refresh() { load(); }

  async function load() {
    if (!root) return;
    if (!focus()) { root.innerHTML = '<div class="reg-empty">open a folder to see its register</div>'; return; }
    root.innerHTML = '<div class="reg-empty">loading…</div>';
    let r;
    try { r = await call('workspace_workflow', { op: 'governance_register', params: { folder_context: focus() } }); }
    catch (e) { root.innerHTML = '<div class="reg-empty">err: ' + esc(e && e.message) + '</div>'; return; }
    const rows = (r && r.rows) || [];
    const agents = rows.filter((x) => x.type === 'agent');
    const ucs = rows.filter((x) => x.type === 'use_case');
    let h = '<table class="reg-tbl"><thead><tr><th>task</th><th>risk</th><th>verdict</th><th>reserved</th></tr></thead><tbody>';
    h += ucs.map((u) => {
      const vi = VINFO(u.verdict);
      return '<tr><td>' + esc(u.label) + '</td><td>' + esc(u.risk || '') + '</td>'
        + '<td style="color:' + (vi.col || '#888') + '">' + esc(vi.label || u.verdict) + '</td>'
        + '<td>' + basisTag(u) + '</td></tr>';
    }).join('');
    h += '</tbody></table>';
    h += '<div class="reg-sum">' + agents.length + ' agent' + (agents.length === 1 ? '' : 's') + ' · ' + ucs.length + ' task' + (ucs.length === 1 ? '' : 's') + '</div>';
    h += '<button id="reg-all" class="reg-btn">All folders…</button>';
    root.innerHTML = h;
    const ab = root.querySelector('#reg-all');
    if (ab) ab.addEventListener('click', loadAll);
  }

  async function loadAll() {
    if (!root) return;
    let r;
    try { r = await call('workspace_workflow', { op: 'governance_register', params: { folder_context: focus(), scope: 'all' } }); }
    catch (e) { return; }
    let h = '<label class="reg-lbl">Registered folders (' + (r.count || 0) + ')</label>';
    h += '<div class="reg-note">workspaces you’ve registered — not a scan of your disk' + (r.skipped ? ' · ' + r.skipped + ' skipped' : '') + '</div>';
    h += (r.folders || []).map((f) => '<div class="reg-frow"><b>' + esc(bn(f.folder)) + '</b> · '
      + (f.summary.agents || 0) + ' agents · ' + (f.summary.use_cases || 0) + ' tasks · '
      + (f.summary.reserved_use_cases || 0) + ' reserved</div>').join('')
      || '<div class="reg-empty">no registered folders</div>';
    h += '<button id="reg-back" class="reg-btn">← this folder</button>';
    root.innerHTML = h;
    const b = root.querySelector('#reg-back');
    if (b) b.addEventListener('click', load);
  }

  return { mount, unmount, refresh };
}
