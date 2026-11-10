import { $, $$, toNum, todayISO, fmt0, downloadFile, slug } from './utils.js';
import { STATE, loadState, defaultState, saveState, activeBike, newBike, syncOdometer, commit } from './state.js';
import { UI } from './ui.js';
import { render } from './render.js';
import * as views from './views.js';
import * as imp from './import.js';
import { fuelStats, autonomyLevel } from './calc.js';

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const b = activeBike();

  switch (act) {
    case "nav": UI.view = el.dataset.view; UI.sub = null; render(); break;
    case "sub": UI.sub = el.dataset.sub === "null" ? null : el.dataset.sub; UI.importPreview = null; render(); break;
    case "toggleTheme": STATE.theme = STATE.theme === "light" ? "dark" : "light"; commit(); break;
    case "closeModal": views.closeModal(); break;
    case "saveOdo": { 
      const v = toNum($("#odoInput").value); 
      if (!isFinite(v) || v < 0) return alert("Ingresa un kilometraje válido."); 
      
      b.odometer = v; 
      syncOdometer(b); 
      
      const st = fuelStats(b);
      const lvl = autonomyLevel(b, st);
      
      if (st.autonomy !== null && lvl === "red") {
        alert(`⚠️ ¡CUIDADO! TE ESTÁS QUEDANDO SIN GASOLINA.\n\nAutonomía estimada: ~${Math.round(st.autonomy)} km\nCombustible restante: ${st.remaining.toFixed(2)} gal\n\n¡Busca una gasolinera pronto!`);
      } else if (st.autonomy !== null && lvl === "yellow") {
        alert(`⛽ Te queda poca gasolina.\n\nAutonomía estimada: ~${Math.round(st.autonomy)} km\nCombustible restante: ${st.remaining.toFixed(2)} gal`);
      }
      
      commit(); 
      break; 
    }
    case "delFuel": { const id = el.dataset.id; if (!confirm("¿Eliminar esta carga?")) return; b.fuel = b.fuel.filter(f => f.id !== id); commit(); break; }
    case "openMaint": views.modalMaint(b, el.dataset.type); break;
    case "openMaintPicker": views.modalMaintPicker(b); break;
    case "delMaint": { const id = el.dataset.id; if (!confirm("¿Eliminar este mantenimiento?")) return; b.maintenance = b.maintenance.filter(m => m.id !== id); commit(); break; }
    case "editDoc": views.modalDoc(b, el.dataset.key); break;
    case "clearDoc": delete b.docs[el.dataset.key]; views.closeModal(); commit(); break;
    case "setBike": STATE.activeBikeId = el.dataset.id; UI.sub = null; commit(); break;
    case "newBike": views.modalBike(null); break;
    case "editBike": { const bk = STATE.bikes.find(x => x.id === el.dataset.id); if (bk) views.modalBike(bk); break; }
    case "delBike": {
      if (STATE.bikes.length <= 1) return alert("Debes tener al menos una moto.");
      if (!confirm("¿Eliminar esta moto y TODO su historial?")) return;
      STATE.bikes = STATE.bikes.filter(x => x.id !== el.dataset.id);
      STATE.activeBikeId = STATE.bikes[0].id; UI.sub = null; commit(); break;
    }
    case "saveBikeCfg": {
      b.name = ($("#cfgName").value || "Mi Moto").trim();
      b.tankCapacity = Math.max(toNum($("#cfgTank").value) || 0, 0);
      b.consumptionAlertPct = Math.min(Math.max(toNum($("#cfgAlert").value) || 15, 1), 90);
      b.currency = ($("#cfgCur").value || "$").trim() || "$";
      b.fixedEfficiency = Math.max(toNum($("#cfgEff").value) || 0, 0); // GUARDAMOS EL RENDIMIENTO FIJO
      commit(); alert("Datos guardados ✅"); break;
    }
    case "saveIntervals": {
      $$("[data-cfg]").forEach(inp => {
        const k = inp.dataset.cfg, f = inp.dataset.f;
        const v = inp.value.trim();
        b.config[k][f] = v === "" ? null : Math.max(0, toNum(v) || 0);
      });
      commit(); alert("Intervalos actualizados ✅"); break;
    }
    case "applyHist": UI.history.kind = $("#hKind").value; UI.history.from = $("#hFrom").value; UI.history.to = $("#hTo").value; render(); break;
    case "clearHist": UI.history = { kind: "all", from: "", to: "" }; render(); break;
    case "exportJSON": downloadFile(JSON.stringify(STATE, null, 2), `motocontrol-backup-${todayISO()}.json`, "application/json"); break;
    case "exportCSV": {
      const rows = [["tipo", "fecha", "km", "galones", "costo", "lleno", "notas", "servicio"]];
      b.fuel.forEach(f => rows.push(["gasolina", f.date, f.km, f.gallons, f.cost, f.fullTank ? "si" : "no", f.notes || "", ""]));
      b.maintenance.forEach(m => rows.push(["mantenimiento", m.date, m.km, "", m.cost, "", m.notes || "", m.type]));
      const csv = rows.map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
      downloadFile("\uFEFF" + csv, `moto-${slug(b.name)}-${todayISO()}.csv`, "text/csv;charset=utf-8"); break;
    }
    case "analyzeImport": imp.runAnalyzeImport(); break;
    case "cancelImport": UI.importPreview = null; render(); break;
    case "confirmImport": imp.runConfirmImport(); break;
    case "restoreJSON": imp.runRestoreJSON(); break;
    case "print": window.print(); break;
  }
});

document.addEventListener("change", e => {
  if (e.target.id === "bikeSel") { STATE.activeBikeId = e.target.value; UI.sub = null; UI.importPreview = null; commit(); }
  if (e.target.id === "importFile") {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const ta = $("#importText"); if (ta) ta.value = String(reader.result); };
    reader.readAsText(file, "UTF-8");
  }
  if (e.target.matches("[data-map]") && UI.importPreview) { UI.importPreview.mapping[+e.target.dataset.map] = e.target.value; }
});

document.addEventListener("submit", e => {
  const form = e.target;
  const b = activeBike();
  if (form.id === "fuelForm") {
    e.preventDefault();
    const fd = new FormData(form);
    const km = toNum(fd.get("km")), gallons = toNum(fd.get("gallons")), cost = toNum(fd.get("cost"));
    const date = fd.get("date") || todayISO();
    if (!isFinite(km) || km < 0) return alert("Kilometraje inválido.");
    if (!isFinite(gallons) || gallons <= 0) return alert("Galones deben ser mayores a 0.");
    if (!isFinite(cost) || cost < 0) return alert("Costo inválido.");
    b.fuel.push({ id: Date.now().toString(36), date, km, gallons, cost, fullTank: fd.get("fullTank") === "on", notes: "" });
    syncOdometer(b); commit(); return;
  }
  if (form.id === "maintForm") {
    e.preventDefault();
    const fd = new FormData(form);
    const km = toNum(fd.get("km"));
    if (!isFinite(km) || km < 0) return alert("Kilometraje inválido.");
    b.maintenance.push({ id: Date.now().toString(36), type: fd.get("type"), date: fd.get("date") || todayISO(), km, cost: toNum(fd.get("cost")) || 0, notes: (fd.get("notes") || "").toString().trim() });
    syncOdometer(b); views.closeModal(); commit(); return;
  }
  if (form.id === "docForm") {
    e.preventDefault();
    const fd = new FormData(form);
    const key = fd.get("key"), date = fd.get("date");
    if (!date) return alert("Fecha inválida.");
    b.docs[key] = { date, notes: (fd.get("notes") || "").toString().trim() };
    views.closeModal(); commit(); return;
  }
  if (form.id === "bikeForm") {
    e.preventDefault();
    const fd = new FormData(form);
    const id = fd.get("id"), name = (fd.get("name") || "").trim() || "Mi Moto";
    const tank = Math.max(toNum(fd.get("tank")) || 0, 0), odo = Math.max(toNum(fd.get("odo")) || 0, 0);
    if (id) {
      const bk = STATE.bikes.find(x => x.id === id);
      if (bk) { bk.name = name; bk.tankCapacity = tank; bk.odometer = odo; syncOdometer(bk); }
    } else {
      const nb = newBike(name); nb.tankCapacity = tank; nb.odometer = odo;
      STATE.bikes.push(nb); STATE.activeBikeId = nb.id;
    }
    views.closeModal(); commit(); return;
  }
});

window.addEventListener('statechange', () => render());

(function init() {
  const loaded = loadState();
  Object.assign(STATE, loaded);
  if (!STATE.bikes.length) Object.assign(STATE, defaultState());
  if (!STATE.bikes.some(b => b.id === STATE.activeBikeId)) STATE.activeBikeId = STATE.bikes[0].id;
  saveState(); 
  render();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
})();