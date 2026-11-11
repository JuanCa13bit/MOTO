import { $, $$, esc } from './utils.js?v=13';
import { STATE, activeBike } from './state.js?v=13';
import { UI } from './ui.js?v=13';
import * as views from './views.js?v=13';

export function render() {
  if (!STATE.bikes || STATE.bikes.length === 0) return;
  const b = activeBike();
  const sel = $("#bikeSel");
  if (!sel) return;
  sel.innerHTML = STATE.bikes.map(x => `<option value="${x.id}" ${x.id === b.id ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  document.body.classList.toggle("light", STATE.theme === "light");
  const themeBtn = $('[data-act="toggleTheme"]');
  if (themeBtn) themeBtn.textContent = STATE.theme === "light" ? "☀️" : "🌙";
  $$("#tabbar button").forEach(btn => btn.classList.toggle("on", btn.dataset.view === UI.view));
  
  let html = "";
  if (UI.view === "dash")       html = views.viewDash(b);
  else if (UI.view === "fuel")  html = views.viewFuel(b);
  else if (UI.view === "maint") html = views.viewMaint(b);
  else if (UI.view === "docs")  html = views.viewDocs(b);
  else                          html = views.viewMore(b);
  
  $("#app").innerHTML = html;
  window.scrollTo({ top: 0 });
}