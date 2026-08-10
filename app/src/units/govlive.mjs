// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 flxk1
//
// Govlive — a reusable, read-only Live-Governance board over the shared store
// (units/state.mjs). It renders the `governance_live` board dict verbatim:
// summary tiles, live sessions (admission honesty enforced client-side), run-
// lease serialization (one in flight per folder·workflow, no queue), the static
// boundary doctrine label, and the one signed chain (newest first, each node
// activatable). It DECIDES nothing: the server produces every verdict, lease and
// admission; this only colors and reads what it decided, and draws no field the
// board omits (kind / decay / per-agent breaker have no honest source).
//
// This is a MONITOR, not a control surface: no write verbs, no launcher, no
// tabbed governance console. Acting on a step goes through the governed
// surfaces, never this board. Step drill-down (the I4 inspector) is RVND
// governance orchestration — it is injected as `opts.onInspectStep(nodeData,
// slotEl)` so this unit stays free of any host-specific op vocabulary and any
// reverse dependency on a consumer.

import { VINFO } from './verdict.mjs';

// Semantic verdict colors come from the shared verdict vocabulary; system,
// boundary and chain use the accent so a verdict can never be mistaken for
// chrome. A missing/unknown verdict renders most-restrictively via VINFO.
const SYS = '#3ec8d8';
const MONO = 'font-family:IBM Plex Mono,monospace;font-size:10px';
const vcol = (v) => (v === 'unfired' ? 'var(--txt-dim)' : (VINFO(v).col || 'var(--txt-dim)'));

export function createGovlive(store, call, doc, opts = {}) {
  const esc = (s) => { const e = doc.createElement('div'); e.textContent = String(s == null ? '' : s); return e.innerHTML; };
  const escA = (s) => esc(s).replace(/"/g, '&quot;');
  const onInspectStep = typeof opts.onInspectStep === 'function' ? opts.onInspectStep : null;

  let root = null;
  let unsub = null;

  function focus() { return store.getState().activeWorkspace || ''; }

  const pill = (v) => '<span class="gl-verdict" data-verdict="' + escA(v) + '" style="border:1px solid ' + vcol(v) + ';color:' + vcol(v) + ';border-radius:6px;padding:1px 7px;font-size:10px;text-transform:uppercase;letter-spacing:.4px">' + esc(v) + '</span>';

  function paintBoard(b) {
    const sum = b.summary || {};
    const esca = sum.escalations != null ? sum.escalations : null;
    let h = '';

    // ── summary tiles ──
    const tile = (label, val, warn) => '<div class="gl-tile"' + (warn ? ' data-warn="true"' : '') +
      ' style="flex:1;min-width:96px;background:var(--panel-2);border:1px solid ' + (warn ? vcol('reserved') : 'var(--line)') + ';border-radius:8px;padding:7px 9px">' +
      '<div style="font-size:9.5px;color:var(--txt-dim);text-transform:uppercase;letter-spacing:.5px">' + label + '</div>' +
      '<div style="font-size:13px;margin-top:2px">' + val + '</div></div>';
    h += '<div class="gl-summary" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px">';
    h += tile('sessions open', esc(sum.sessions_open != null ? sum.sessions_open : '—'));
    h += tile('admitted', esc(sum.admitted != null ? sum.admitted : '—'));
    h += tile('run leases held', esc(sum.run_leases_held != null ? sum.run_leases_held : '—'));
    h += tile('escalations', esca != null ? (esca > 0 ? '<span style="color:' + vcol('reserved') + '">' + esc(esca) + '</span>' : esc(esca)) : '—', esca != null && esca > 0);
    h += '</div>';

    // ── sessions (admission honesty enforced here too) ──
    h += '<div class="gl-sessions">';
    (b.sessions || []).forEach((s) => {
      // An un-admitted (expired/revoked) session must never be drawn acting:
      // whatever upstream said, it renders refused and loses the GO family.
      const admitted = s.admitted !== false;
      const v = admitted ? (s.verdict || 'unfired') : 'refused';
      h += '<div class="gl-session" data-sid="' + escA(s.sid || '') + '" data-admitted="' + (admitted ? 'true' : 'false') + '" data-verdict="' + escA(v) + '"' +
        ' style="border:1px solid var(--line);border-left:3px solid ' + (v !== 'unfired' ? vcol(v) : 'var(--line)') + ';border-radius:8px;padding:8px 10px;margin-bottom:7px;background:var(--panel-2)">';
      h += '<div style="display:flex;align-items:center;gap:7px"><b style="' + MONO + ';font-size:11px">' + esc(s.sid || '?') + '</b>' +
        '<span style="font-size:9.5px;color:var(--txt-dim)">' + (admitted ? 'admitted' : 'not admitted') + '</span>' +
        '<span style="flex:1"></span>' + pill(v) + '</div>';
      if (admitted && s.capability && s.capability.folder_context) {
        h += '<div class="gl-cap" data-folder="' + escA(s.capability.folder_context) + '" style="margin-top:5px;font-size:10px;color:#92c4ac">✓ capability' +
          '<span style="color:var(--txt-dim)"> · ' + esc(s.capability.folder_context) +
          (s.capability.expires ? ' · expires ' + esc(String(s.capability.expires).slice(0, 19)) : '') + '</span></div>';
      } else if (!admitted) {
        h += '<div style="margin-top:5px;font-size:10px;color:' + vcol('refused') + '">expired or revoked — no live capability, nothing to act with</div>';
      }
      if (s.grade) h += '<div style="margin-top:4px;font-size:10px;color:var(--txt-dim)">grade ' + esc(s.grade) + '</div>';
      if (s.escalation != null) {
        h += '<div class="gl-escalation" data-escalation="' + (s.escalation ? 'true' : 'false') + '" style="margin-top:4px;font-size:10px;color:' + (s.escalation ? vcol('reserved') : 'var(--txt-dim)') + '">' +
          (s.escalation ? '▲ escalation — a human is in this loop' : 'no escalation') + '</div>';
      }
      h += '</div>';
    });
    h += '</div>';

    // ── run leases — serialization BY REFUSAL: one in flight per folder·workflow ──
    h += '<div style="font-size:9.5px;color:var(--txt-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">run leases — one in flight per folder · workflow (a second is refused)</div>';
    h += '<div class="gl-leases" style="border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:9px">';
    (b.leases || []).forEach((l) => {
      const fw = (l.folder || '') + '·' + (l.workflow || '');
      h += '<div class="gl-lease" data-folder-workflow="' + escA(fw) + '" data-holder="' + escA(l.holder || '') + '"' +
        ' style="display:flex;gap:8px;align-items:center;padding:4px 9px;border-top:1px solid var(--line);font-size:10px">' +
        '<span style="color:#92c4ac">holding</span>' +
        '<span style="' + MONO + '">' + esc(l.workflow || '') + '</span>' +
        '<span style="flex:1;color:var(--txt-dim)">' + esc(l.folder || '') + '</span>' +
        (l.holder ? '<span style="' + MONO + ';color:var(--txt-dim)">' + esc(l.holder) + '</span>' : '') +
        (l.ttl_s != null ? '<span style="color:var(--txt-dim)">ttl ' + esc(l.ttl_s) + 's</span>' : '') + '</div>';
    });
    if (!(b.leases || []).length) h += '<div style="padding:6px 9px;font-size:10px;color:var(--txt-dim)">no runs in flight</div>';
    h += '</div>';

    // ── boundary — static doctrine label, unit-rendered, NOT op data ──
    h += '<div class="gl-boundary" style="border:1px solid ' + SYS + '33;border-radius:8px;padding:6px 10px;margin:2px 0 9px;font-size:10.5px;color:' + SYS + '">boundary — releases GO only</div>';

    // ── the one signed chain (newest first; hash is a digest of already-public
    // audit data and appears as the next entry's prev_hash — exposed so a gate
    // can verify the linkage in the DOM). Each node drills into the inspector
    // via the injected callback — activation is a read, never a write. ──────
    h += '<div style="font-size:9.5px;color:var(--txt-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">one signed chain — newest first' + (onInspectStep ? ' · activate a step to inspect it' : '') + '</div>';
    h += '<div class="gl-chain" style="border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:9px">';
    (b.chain || []).forEach((n) => {
      const act = onInspectStep ? ' role="button" tabindex="0"' : '';
      h += '<div class="gl-node"' + act + ' data-seq="' + escA(n.seq) + '" data-actor="' + escA(n.actor || '') + '" data-event="' + escA(n.event || '') + '" data-extra="' + escA(n.extra || '') + '"' +
        (n.hash ? ' data-hash="' + escA(n.hash) + '"' : '') + (n.prev_hash ? ' data-prev="' + escA(n.prev_hash) + '"' : '') +
        (onInspectStep ? ' aria-label="inspect step ' + escA(n.seq) + ' — ' + escA((n.actor || '') + ' ' + (n.event || '')) + '"' : '') +
        ' style="display:flex;gap:8px;align-items:center;padding:4px 9px;border-top:1px solid var(--line);font-size:10px' + (onInspectStep ? ';cursor:pointer' : '') + '">' +
        '<span style="' + MONO + ';color:' + SYS + '">#' + esc(n.seq) + '</span>' +
        '<span style="' + MONO + '">' + esc(n.actor || '') + '</span>' +
        '<span style="color:var(--txt)">' + esc(n.event || '') + '</span>' +
        '<span style="flex:1;color:var(--txt-dim)">' + esc(n.extra || '') + '</span>' +
        (n.hash ? '<span style="' + MONO + ';color:var(--txt-dim)">' + esc(String(n.hash).slice(0, 8)) + ' ← ' + esc(String(n.prev_hash || '').slice(0, 8)) + '</span>' : '') + '</div>';
    });
    if (!(b.chain || []).length) h += '<div style="padding:6px 9px;font-size:10px;color:var(--txt-dim)">no entries</div>';
    h += '</div>';

    h += '<div class="gl-inspector-slot"></div>';
    h += '<div class="ro" style="font-size:10px;color:var(--txt-dim);margin-top:8px">Read-only. Admission, lanes and leases are the server’s protections — this board can only show them. Fields with no honest source (kind, decay, per-agent breaker) are not drawn.</div>';
    root.innerHTML = h;

    // Chain drill-down is delegated to the host (RVND injects the I4 inspector).
    const chainEl = root.querySelector('.gl-chain');
    if (chainEl && onInspectStep) {
      const slot = root.querySelector('.gl-inspector-slot');
      const drill = (nd) => onInspectStep(nd, slot);
      chainEl.addEventListener('click', (ev) => { const nd = ev.target.closest('.gl-node'); if (nd) drill(nd.dataset); });
      chainEl.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const nd = ev.target.closest('.gl-node'); if (!nd) return;
        ev.preventDefault(); drill(nd.dataset);
      });
    }
  }

  async function load() {
    if (!root) return;
    const fc = focus();
    if (!fc) {
      root.innerHTML = '<div class="ro" style="color:var(--txt-dim);font-size:11px">open a folder to see its live governance board</div>';
      return;
    }
    let b;
    try {
      b = await call('workspace_workflow', { op: 'governance_live', params: { folder_context: fc } });
    } catch (e) {
      root.innerHTML = '<div class="finding warn"><span class="ttl">Board unavailable</span>' + esc((e && e.message) || 'governance_live failed') + '</div>';
      return;
    }
    if (!b || b.ok === false) {
      root.innerHTML = '<div class="finding warn"><span class="ttl">Board unavailable</span>' + esc((b && b.error) || 'governance_live returned no board') + '</div>';
      return;
    }
    paintBoard(b);
  }

  function mount(container) {
    root = container;
    root.innerHTML = '<div class="ro" style="color:var(--txt-dim);font-size:11px">loading…</div>';
    unsub = store.subscribe(() => load());
    load();
  }
  function unmount() { if (unsub) unsub(); unsub = null; root = null; }
  function refresh() { load(); }

  return { mount, unmount, refresh };
}
