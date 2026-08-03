// Real DOM test for the Settings float. Injects a sample consumer
// window.SETTINGS_GROUPS, opens Settings, and asserts the groups + commands
// render, a Copy button confirms, and Esc closes. Settings is shell chrome
// inlined by compose_classic(); the command list is consumer-supplied.
// Usage: node settings_render.mjs <PORT> <FOLDER>
import { JSDOM } from "jsdom";
import { bridgeGlobals, fetchComposedPage } from "../harness/render_harness.mjs";
const PORT = process.argv[2], F = process.argv[3];
const html = await fetchComposedPage(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (m) => { console.log("FAIL: " + m); process.exit(1); };
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  beforeParse(window) {
    bridgeGlobals(window, PORT);
    window.fetch = (u, o) => fetch(u, o);
    // The consumer supplies its own command list; use a product-neutral sample.
    window.SETTINGS_GROUPS = [
      { title: "Set up",   items: [{ label: "Guided setup", cmd: "demo init" }] },
      { title: "Maintain", items: [{ label: "Back up",      cmd: "demo backup --encrypt" }] },
    ];
    // jsdom has no real clipboard; stub the success path so the copy assertion
    // is deterministic (the fallback execCommand path is a browser-only no-op).
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: () => Promise.resolve() }, configurable: true,
    });
    Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get(){ return 900; } });
    Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get(){ return 600; } });
  },
});
const { window } = dom;

async function main() {
  for (let i = 0; i < 80 && !window._ready; i++) await sleep(25);
  if (!window._ready) fail("patchbay did not boot");
  window.S.path = F; await window.reload(); await sleep(40);

  await window.openSettingsPanel();
  await sleep(80);
  const sp = window.document.getElementById("settingspanel");
  if (!sp) fail("settings panel did not open");
  if (sp.getAttribute("aria-modal") !== "true") fail("settings panel is not a modal dialog");

  const txt = sp.textContent;
  if (!/Set up/.test(txt) || !/Guided setup/.test(txt) || !/demo init/.test(txt))
    fail("consumer command groups did not render — got: " + txt.slice(0, 180));

  const copies = [...sp.querySelectorAll(".setcopy")];
  if (copies.length !== 2) fail("expected 2 copy buttons, got " + copies.length);
  copies[0].click();
  await sleep(40);
  if (!/Copied/.test(copies[0].textContent)) fail("copy did not confirm");

  // Esc closes and the toggle is clean.
  sp.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await sleep(30);
  if (window.document.getElementById("settingspanel")) fail("Esc did not close the settings panel");

  console.log("PASS: settings float — consumer command groups render, copy confirms, Esc closes");
  process.exit(0);
}
main().catch((e) => fail(String((e && e.stack) || e)));
