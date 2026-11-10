import { $, $$, esc } from './utils.js?v=8';
import { STATE, activeBike } from './state.js?v=8';
import { UI } from './ui.js?v=8';
import * as views from './views.js?v=8';

export function render() {
  const b = activeBike();
  const sel = $("#bikeSel");
  sel.innerHTML = STATE.bikes.map(x => `<option value="${x.id}" ${x.id === b.id ? "selected" : ""}>${esc(x.name)}</option>`).join("");
  document.body.classList.toggle("light", STATE.theme === "light");
  $('[data-act="toggleTheme"]').textContent = STATE.theme === "light" ? "☀️" : "🌙";
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