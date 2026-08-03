// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 flxk1
//
// Controller — the governance knobs as a composable widget: read-back lamps
// (oversight level, grounding floor, active parties), tighten/loosen steps, an
// ALL-STOP that suspends every active party, and optional MIDI-learn bindings.
// A knob is a REQUEST, never authority: the UI asks the server; the server
// decides and clamps; lamps show the SERVER value. Tighten is instant; loosen
// confirms and is recorded. Bindings persist client-side only.
// createController(store, call, doc) → {mount, unmount, refresh}. All governance
// I/O over the injected /tool bridge (workspace_policy / workspace_lock).
// Reimplemented from the classic controller panel; no classic-shell dependency.

const LS = 'rvnd.controller.bindings.v1';
const OV_ORDER = ['autonomous', 'notify', 'review', 'approve', 'supervised', 'manual']; // loosest → strictest
const ACTIONS = {
  ov_tighten: { label: 'Oversight — tighten', dir: 'tighten' },
  ov_loosen: { label: 'Oversight — loosen', dir: 'loosen' },
  floor_up: { label: 'Grounding floor — raise', dir: 'tighten' },
  floor_down: { label: 'Grounding floor — lower', dir: 'loosen' },
  all_stop: { label: 'ALL-STOP (suspend every active party)', dir: 'tighten' },
};

export function createController(store, call, doc) {
  const esc = (s) => { const e = doc.createElement('div'); e.textContent = String(s == null ? '' : s); return e.innerHTML; };
  const escA = (s) => esc(s).replace(/"/g, '&quot;');
  let root = null;
  let unsub = null;
  let midiLearn = null;
  let midiHooked = null;

  function focus() { return store.getState().activeWorkspace || ''; }
  function say(msg) { const el = root && root.querySelector('#ctl-live'); if (el) el.textContent = msg; }
  function bindings() { try { return JSON.parse((doc.defaultView || window).localStorage.getItem(LS) || '[]'); } catch (_) { return []; } }
  function saveBindings(b) { try { (doc.defaultView || window).localStorage.setItem(LS, JSON.stringify(b)); } catch (_) {} }

  function mount(container) {
    root = container;
    paint();
    unsub = store.subscribe(() => loadState());
    initMidi();
  }
  function unmount() { if (unsub) unsub(); unsub = null; root = null; midiLearn = null; }
  function refresh() { loadState(); }

  function paint() {
    if (!root) return;
    root.innerHTML =
      '<span id="ctl-live" class="sr-only" aria-live="assertive"></span>'
      + '<div class="ctl-hint">A knob is a <b>request</b>, never authority. The UI asks the server; the <b>server</b> decides and clamps. Lamps show the server value. Tighten is instant; loosen confirms and is recorded.</div>'
      + '<button id="ctl-allstop" class="ctl-allstop">■ ALL-STOP — suspend every active party</button>'
      + '<div id="ctl-state" class="ctl-state"></div>'
      + '<div id="ctl-midi" class="ctl-midi"></div>'
      + '<div id="ctl-bindings"></div>';
    root.querySelector('#ctl-allstop').addEventListener('click', () => allStop('on-screen button'));
    loadState();
    renderBindings();
  }

  async function loadState() {
    const st = root && root.querySelector('#ctl-state');
    if (!st) return;
    if (!focus()) { st.innerHTML = '<span class="dim">open a workspace to drive its governance</span>'; renderBindings(); return; }
    const get = async (t, op) => { try { return await call(t, { op, params: { folder_context: focus() } }); } catch (e) { return { error: (e && e.message) || 'failed' }; } };
    const [pol, thr, pl] = await Promise.all([get('workspace_policy', 'snapshot'), get('workspace_lock', 'threshold_get'), get('workspace_policy', 'party_list')]);
    const ovl = (pol && pol.oversight_default_level) || '?';
    const floor = (thr && !thr.error && thr.ok !== false) ? Number(thr.threshold || 0) : null;
    const arr = Array.isArray(pl) ? pl : ((pl && (pl.parties || pl.rows)) || []);
    const active = arr.filter((p) => (p.status || 'active') === 'active');
    const lamp = (c) => '<span class="ctl-lamp" style="background:' + c + '"></span>';
    let h = '';
    h += '<div class="ctl-row">' + lamp(ovl === '?' ? '#5b6472' : '#92c4ac') + 'Oversight (server) <b>' + esc(ovl) + '</b></div>';
    h += '<div class="ctl-row">' + lamp(floor == null ? '#5b6472' : (floor > 0 ? '#e6b483' : '#5b6472')) + 'Grounding floor (server) <b>' + (floor == null ? 'unread' : (floor <= 0 ? 'no filter' : esc(floor.toFixed(2)))) + '</b></div>';
    h += '<div class="ctl-row">' + lamp(active.length ? '#92c4ac' : '#5b6472') + 'Active parties <b>' + esc(active.length) + ' / ' + esc(arr.length) + '</b></div>';
    h += '<div class="ctl-note">These lamps are the granted state read back from the server — a knob never sets them directly.</div>';
    st.innerHTML = h;
    renderBindings();
  }

  async function submit(key, src) {
    const a = ACTIONS[key];
    if (!a || !focus()) return;
    const via = src ? (' via ' + src) : '';
    if (a.dir === 'loosen') {
      const win = doc.defaultView || window;
      if (win.confirm && !win.confirm('Loosen “' + a.label + '”? This raises autonomy / lowers a guard — it round-trips to the server and is recorded.')) return;
    }
    try {
      if (key === 'all_stop') { await allStop(src || 'controller'); return; }
      if (key === 'ov_tighten' || key === 'ov_loosen') {
        const pol = await call('workspace_policy', { op: 'snapshot', params: { folder_context: focus() } });
        if (pol && (pol.error || pol.ok === false)) { await loadState(); say('could not read oversight level — request not sent'); return; }
        const cur = (pol && pol.oversight_default_level) || 'approve';
        let i = OV_ORDER.indexOf(cur); if (i < 0) i = OV_ORDER.indexOf('approve');
        const want = (key === 'ov_tighten') ? Math.min(OV_ORDER.length - 1, i + 1) : Math.max(0, i - 1);
        const lvl = OV_ORDER[want];
        if (lvl === cur) { say('oversight already at ' + cur); await loadState(); return; }
        const r = await call('workspace_policy', { op: 'set_oversight_level', params: { folder_context: focus(), level: lvl, actor: 'app-user' } });
        await loadState();
        say((r && (r.ok === false || r.error)) ? ('could not set oversight: ' + (r.error || 'failed')) : ('oversight → ' + lvl + ' (server granted)' + via));
      } else if (key === 'floor_up' || key === 'floor_down') {
        const cur = await call('workspace_lock', { op: 'threshold_get', params: { folder_context: focus() } });
        if (cur && (cur.error || cur.ok === false)) { await loadState(); say('could not read the grounding floor — request not sent'); return; }
        const c = Number((cur && cur.threshold) || 0);
        let want = (key === 'floor_up') ? c + 0.1 : c - 0.1;
        want = Math.max(0, Math.min(1, want));
        const r = await call('workspace_lock', { op: 'threshold_set', params: { folder_context: focus(), threshold: want, actor: 'app-user' } });
        await loadState();
        if (r && (r.ok === false || r.error)) say('could not set floor: ' + (r.error || 'failed'));
        else say('grounding floor → ' + Number(r.threshold).toFixed(2) + ' (server granted)' + via);
      }
    } catch (e) { await loadState(); say('controller request failed: ' + ((e && e.message) || 'error')); }
  }

  async function allStop(src) {
    if (!focus()) { say('open a workspace first'); return; }
    let pl;
    try { pl = await call('workspace_policy', { op: 'party_list', params: { folder_context: focus() } }); }
    catch (e) { say('ALL-STOP could not read parties: ' + ((e && e.message) || 'error')); return; }
    if (pl && (pl.error || pl.ok === false)) { say('ALL-STOP could not read parties: ' + (pl.error || 'failed') + ' — nothing suspended'); await loadState(); return; }
    const arr = Array.isArray(pl) ? pl : ((pl && (pl.parties || pl.rows)) || []);
    const active = arr.filter((p) => (p.status || 'active') === 'active');
    if (!active.length) { say('ALL-STOP: no active party to suspend'); await loadState(); return; }
    let n = 0;
    for (const p of active) {
      const pid = p.party_id || p.id;
      if (!pid) continue;
      try { await call('workspace_policy', { op: 'party_status', params: { folder_context: focus(), party_id: pid, status: 'suspended', actor: 'app-user', reason: 'ALL-STOP (' + (src || 'panic') + ')' } }); n++; } catch (_) {}
    }
    await loadState();
    say('ALL-STOP: suspended ' + n + ' of ' + active.length + ' active part' + (active.length === 1 ? 'y' : 'ies') + ' — each signed');
  }

  async function initMidi() {
    const box = root && root.querySelector('#ctl-midi');
    if (!box) return;
    const nav = (doc.defaultView || window).navigator;
    if (!nav || !nav.requestMIDIAccess) { box.innerHTML = '<div class="ctl-warn"><b>No Web MIDI access</b> — bindings disabled, but ALL-STOP and the on-screen Fire buttons still work.</div>'; return; }
    try {
      const acc = await nav.requestMIDIAccess({ sysex: false });
      box.innerHTML = '<div class="ctl-ok">MIDI ready — listening to any device. Hit <b>Learn</b> on a binding, then move a knob or pad.</div>';
      const hook = (inp) => { if (midiHooked && midiHooked.has(inp)) return; (midiHooked = midiHooked || new WeakSet()).add(inp); inp.onmidimessage = onMidi; };
      acc.inputs.forEach(hook);
      acc.onstatechange = (e) => { if (e.port && e.port.type === 'input' && e.port.state === 'connected') hook(e.port); };
    } catch (e) { box.innerHTML = '<div class="ctl-warn"><b>MIDI access denied</b> (' + esc((e && e.message) || 'denied') + ') — ALL-STOP + Fire still work.</div>'; }
  }

  function onMidi(ev) {
    const d = ev.data || [];
    const type = (d[0] & 255) & 0xf0;
    const d1 = d[1] | 0;
    const d2 = d[2] | 0;
    const isCC = (type === 0xb0);
    const isNote = (type === 0x90 && d2 > 0);
    if (!isCC && !isNote) return;
    const note = (isCC ? 'cc' : 'note') + ':' + d1;
    if (midiLearn) {
      const k = midiLearn; midiLearn = null;
      const b = bindings().filter((x) => x.note !== note);
      b.push({ note, action: k }); saveBindings(b); renderBindings();
      say('bound ' + note + ' → ' + (ACTIONS[k] ? ACTIONS[k].label : k));
      return;
    }
    const bind = bindings().find((x) => x.note === note);
    if (bind) submit(bind.action, 'MIDI ' + note);
  }

  function renderBindings() {
    const wrap = root && root.querySelector('#ctl-bindings');
    if (!wrap) return;
    const nav = (doc.defaultView || window).navigator;
    const noMidi = !(nav && nav.requestMIDIAccess);
    const binds = bindings();
    const by = {};
    binds.forEach((b) => { (by[b.action] = by[b.action] || []).push(b.note); });
    let h = '<b class="ctl-bh">Bindings</b><div class="ctl-note">Each is a discrete governance step or trigger — never a continuous dial.</div>';
    for (const k of Object.keys(ACTIONS)) {
      const a = ACTIONS[k];
      const notes = by[k] || [];
      const chip = a.dir === 'tighten' ? '<span class="ctl-chip tighten">tighten · instant</span>' : '<span class="ctl-chip loosen">loosen · recorded</span>';
      h += '<div class="ctl-brow"><div class="ctl-blbl"><span>' + esc(a.label) + '</span>' + chip + '</div>'
        + '<div class="ctl-bctl"><button class="ctl-learn" data-act="' + esc(k) + '"' + (noMidi ? ' disabled' : '') + '>Learn</button>'
        + '<button class="ctl-fire" data-act="' + esc(k) + '">Fire</button><span class="ctl-sp"></span>'
        + (notes.length ? notes.map((n) => '<span class="ctl-note-chip">' + esc(n) + ' <span class="ctl-rm" role="button" tabindex="0" data-note="' + escA(n) + '">✕</span></span>').join('') : '<span class="dim">unbound</span>')
        + '</div></div>';
    }
    wrap.innerHTML = h;
    wrap.querySelectorAll('.ctl-learn').forEach((b) => b.addEventListener('click', () => {
      if (noMidi) { say('no MIDI access'); return; }
      midiLearn = b.dataset.act;
      say('learning ' + (ACTIONS[midiLearn] ? ACTIONS[midiLearn].label : midiLearn) + ' — move a knob or hit a pad');
    }));
    wrap.querySelectorAll('.ctl-fire').forEach((b) => b.addEventListener('click', () => submit(b.dataset.act, 'on-screen')));
    wrap.querySelectorAll('.ctl-rm').forEach((s) => {
      const rm = () => { const note = s.dataset.note; saveBindings(bindings().filter((x) => x.note !== note)); renderBindings(); say('removed binding ' + note); };
      s.addEventListener('click', rm);
      s.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); rm(); } });
    });
  }

  return { mount, unmount, refresh };
}
