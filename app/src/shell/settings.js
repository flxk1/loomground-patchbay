/* Settings — surfaces a consumer-supplied list of lifecycle / maintenance
   commands with copy-to-clipboard. Shell chrome (loaded unconditionally by
   compose_classic()), not plane-provided content.

   The command list is product-specific, so the host page provides it as
     window.SETTINGS_GROUPS = [{ title, items: [{ label, cmd }] }]
   with an optional window.SETTINGS_NOTE (trusted HTML string) shown at the
   foot. With no groups configured the panel says so.

   The console never RUNS these: a loopback bridge only calls governed MCP
   facades, so setup/teardown commands (which change files, keys and settings)
   are copied to a terminal — keeping the audited CLI the single execution
   path. */
function _settingsCopy(btn, text){
  const ok=()=>{ const o=btn.textContent; btn.textContent='Copied ✓'; setTimeout(()=>{ if(document.contains(btn)) btn.textContent=o; },1200); };
  const fb=()=>{ try{ const ta=document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok(); }catch(_){} };
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(ok,fb); return; } }catch(_){}
  fb();
}
async function openSettingsPanel(){
  let sp=document.getElementById('settingspanel'); if(sp){ sp.remove(); return; }  // toggle
  const opener=document.activeElement;
  const groups=Array.isArray(window.SETTINGS_GROUPS)?window.SETTINGS_GROUPS:[];
  sp=document.createElement('div'); sp.id='settingspanel'; sp.setAttribute('role','dialog'); sp.setAttribute('aria-modal','true'); sp.setAttribute('aria-label','Settings');
  sp.style.cssText='position:absolute;top:64px;left:50%;transform:translateX(-50%);width:520px;max-width:92%;max-height:80vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;z-index:11;box-shadow:0 10px 40px rgba(0,0,0,.55)';
  let body='';
  if(!groups.length){
    body='<div class="ro" style="color:var(--txt-dim);font-size:11px">No settings actions are configured for this deployment.</div>';
  } else {
    for(const g of groups){
      body+='<div style="font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--txt-dim);margin:12px 0 2px">'+esc(g&&g.title||'')+'</div>';
      for(const it of ((g&&g.items)||[])){
        body+='<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line)">'
          +'<div style="flex:1;min-width:0"><div style="font-size:12.5px">'+esc(it&&it.label||'')+'</div>'
          +'<code style="display:block;font-family:IBM Plex Mono,monospace;font-size:11.5px;color:var(--txt-dim);white-space:nowrap;overflow-x:auto">'+esc(it&&it.cmd||'')+'</code></div>'
          +'<button class="setcopy" data-cmd="'+esc(it&&it.cmd||'')+'" style="font-family:IBM Plex Mono,monospace;font-size:11px;color:var(--txt-dim);background:var(--panel-2);border:1px solid var(--line);border-radius:6px;padding:5px 9px;cursor:pointer">Copy</button>'
          +'</div>';
      }
    }
  }
  const note=(typeof window.SETTINGS_NOTE==='string'&&window.SETTINGS_NOTE)
    ? window.SETTINGS_NOTE
    : 'Run these in a terminal — the console can’t run them for you.';
  sp.innerHTML='<div style="display:flex;align-items:center;gap:8px"><b style="font-family:Space Grotesk,sans-serif;font-size:13px">Settings</b><span style="flex:1"></span><span id="spx" role="button" tabindex="0" aria-label="Close" style="cursor:pointer;color:var(--txt-dim)">✕</span></div>'
    +'<div>'+body+'</div>'
    +'<div class="ro" style="font-size:10px;color:var(--txt-dim);margin-top:10px">'+note+'</div>';
  stage.appendChild(sp);
  const restore=modalize(sp,opener);
  const close=()=>{ sp.remove(); restore(); };
  const x=sp.querySelector('#spx');
  x.addEventListener('click',close); x.addEventListener('keydown',ev=>{ if(ev.key==='Enter'||ev.key===' '){ ev.preventDefault(); close(); } });
  sp.addEventListener('keydown',ev=>{ if(ev.key==='Escape'){ ev.preventDefault(); close(); } });
  sp.querySelectorAll('.setcopy').forEach(b=>b.addEventListener('click',()=>_settingsCopy(b,b.getAttribute('data-cmd'))));
}
