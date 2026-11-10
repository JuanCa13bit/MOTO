import { $, esc, fmt, fmt0, humanDate, todayISO, LEVEL_RANK } from './utils.js';
import { STATE, activeBike, DOC_TYPES, syncOdometer } from './state.js';
import { computeStatus, statusText, fuelStats, consumptionLevel, autonomyLevel, getFuelLevelInfo, getMaintRemaining } from './calc.js';
import { UI } from './ui.js';

export function renderChart(segments) {
  if (segments.length < 2) return `<p class="mu sm">Necesitas al menos <b>2 llenados de tanque completo</b> para dibujar la curva.</p>`;
  const W = 340, H = 150, PL = 36, PR = 10, PT = 14, PB = 24;
  const vals = segments.map(s => s.kmg);
  let mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx - mn < 1) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * 0.12; mn -= pad; mx += pad;
  const X = i => PL + (i / (segments.length - 1)) * (W - PL - PR);
  const Y = v => (H - PB) - ((v - mn) / (mx - mn)) * (H - PT - PB);
  const pts = segments.map((s, i) => `${X(i).toFixed(1)},${Y(s.kmg).toFixed(1)}`);
  const line = "M" + pts.join(" L");
  const area = `M${X(0).toFixed(1)},${H - PB} L${pts.join(" L")} L${X(segments.length - 1).toFixed(1)},${H - PB} Z`;
  let grid = "";
  for (let i = 0; i <= 2; i++) {
    const v = mn + (mx - mn) * (i / 2);
    const y = Y(v);
    grid += `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" stroke="currentColor" stroke-opacity=".12"/>
             <text x="${PL - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="currentColor" opacity=".55">${v.toFixed(1)}</text>`;
  }
  const dots = segments.map((s, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(s.kmg).toFixed(1)}" r="3" fill="var(--pr)"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}
    <path d="${area}" fill="var(--pr)" opacity=".14"/>
    <path d="${line}" fill="none" stroke="var(--pr)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}

export function viewDash(b) {
  const st = fuelStats(b);
  const fuelInfo = getFuelLevelInfo(st, b.tankCapacity);
  const autoLevel = autonomyLevel(b, st);
  const pendingMaint = getMaintRemaining(b).filter(s => s.level !== "green").slice(0, 3);

  const maintCards = pendingMaint.map(s => {
    let detalle = "";
    if (s.kmCheck && s.kmCheck.rem > 0) detalle = `En ${fmt0(s.kmCheck.rem)} km`;
    else if (s.kmCheck && s.kmCheck.rem <= 0) detalle = `¡Vencido por ${fmt0(Math.abs(s.kmCheck.rem))} km!`;
    else if (s.dateCheck) detalle = s.dateCheck.days >= 0 ? `En ${s.dateCheck.days} días` : `Vencido hace ${Math.abs(s.dateCheck.days)} d`;
    return `
    <div class="item st-${s.level}" style="margin-bottom:6px">
      <div class="item-ico">${s.cfg.icon || "🔧"}</div>
      <div class="item-main">
        <div class="item-title">${esc(s.cfg.label)}</div>
        <div class="item-sub" style="font-weight:600;color:var(--${s.level === 'red' ? 'bad' : s.level === 'yellow' ? 'warn' : 'ok'})">${detalle}</div>
      </div>
    </div>`;
  }).join("") || `<div class="empty">🟢 Sin vencimientos próximos</div>`;

  return `
  <section class="card">
    <div class="card-h"><h2>Kilometraje actual</h2><span class="pill">${esc(b.name)}</span></div>
    <div class="inline">
      <input id="odoInput" type="number" inputmode="numeric" step="1" min="0" value="${Math.round(b.odometer)}">
      <button class="btn primary" data-act="saveOdo">Guardar</button>
    </div>
  </section>

  <section class="card st-${autoLevel}" style="border-width:2px; border-color:var(--c,var(--bd))">
    <div class="card-h" style="margin-bottom:2px">
      <h2 style="color:var(--c,var(--tx))">${fuelInfo.icon} Combustible</h2>
      <span class="pill" style="background:var(--c,var(--bd));color:#fff;border:0">${fuelInfo.text}</span>
    </div>
    <div class="big">${st.autonomy !== null ? `~${fmt0(st.autonomy)}` : '—'} <small>km restantes</small></div>
    <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:12px; color:var(--mu); font-weight:600">
      <span>${fmt(st.remaining, 2)} gal estimados</span>
      <span>Capacidad: ${fmt(b.tankCapacity, 1)} gal</span>
    </div>
    <div style="width:100%; height:12px; background:var(--card2); border-radius:10px; margin-top:10px; overflow:hidden; border:1px solid var(--bd)">
      <div style="width:${Math.min(100, Math.max(0, fuelInfo.pct * 100))}%; height:100%; background:var(--c, var(--pr)); transition:width 0.3s ease"></div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px">
      ${b.fixedEfficiency > 0 
        ? `<p class="sm" style="margin:0;color:var(--ok)">Rendimiento fijo: ${b.fixedEfficiency} km/gal</p>` 
        : `<p class="sm" style="margin:0;color:var(--warn); cursor:pointer" data-act="sub" data-sub="config">⚠️ Configura tu rendimiento</p>`}
      <button class="btn ghost sm" data-act="showCalc" style="min-height:34px; padding:0 12px; width:auto; margin:0; border:1px solid var(--bd)">🧮 Ver cálculo</button>
    </div>
  </section>

  <section class="card">
    <div class="card-h">
      <h2>Próximos Vencimientos</h2>
      <button class="btn-mini" data-act="nav" data-view="maint" title="Ver todo">→</button>
    </div>
    ${maintCards}
  </section>

  <section class="row2" style="margin-bottom:12px">
    <button class="btn primary" data-act="nav" data-view="fuel">⛽ Cargar gasolina</button>
    <button class="btn" data-act="openMaintPicker">🔧 Mantenimiento</button>
  </section>`;
}

export function modalCalc(bike, st) {
  if (!st.calcDetails) {
    return openModal(`
      <h3>¿Cómo se calcula?</h3>
      <p class="mu sm">Necesitas al menos un tanque lleno en el historial para que la app pueda empezar a calcular.</p>
      <button class="btn ghost" data-act="closeModal" style="margin-top:12px">Cerrar</button>
    `);
  }
  const c = st.calcDetails;
  openModal(`
    <h3>🧮 El cálculo de la gasolina</h3>
    <p class="mu sm">Así es como la app estima cuánta gasolina te queda:</p>
    <div class="card tight" style="background:var(--card2)">
      <p class="sm"><b>1. Último tanque lleno:</b><br>${fmt0(c.lastFullKm)} km (${humanDate(c.lastFullDate)})</p>
      <p class="sm"><b>2. Odómetro actual:</b><br>${fmt0(c.odometer)} km</p>
      <p class="sm"><b>3. Distancia recorrida:</b><br>${fmt0(c.distSince)} km</p>
      <p class="sm"><b>4. Rendimiento (promedio):</b><br>${fmt(c.avg, 1)} km/gal</p>
      <p class="sm"><b>5. Gasolina consumida:</b><br>${fmt0(c.distSince)} / ${fmt(c.avg, 1)} = <b>${fmt(c.used, 2)} gal</b></p>
      <p class="sm"><b>6. Recargas parciales:</b><br>Has echado <b>${fmt(c.addedAfter, 2)} gal</b> en recargas que no fueron tanque lleno.</p>
      <hr class="sep">
      <p class="sm"><b>7. Cálculo final:</b><br>
      Capacidad (${fmt(c.capacity, 1)}) <br>
      - Consumido (${fmt(c.used, 2)}) <br>
      + Recargado (${fmt(c.addedAfter, 2)}) <br>
      = <b>${fmt(c.capacity - c.used + c.addedAfter, 2)} gal</b></p>
      <p class="sm mu" style="margin-top:8px">(Si el resultado es negativo, la app muestra 0, porque significa que según los datos, ya te habrías quedado sin gasolina).</p>
    </div>
    <button class="btn primary" data-act="closeModal" style="margin-top:12px">Entendido</button>
  `);
}

export function viewFuel(b) { /* ... (Mismo código de antes) ... */ }
export function viewMaint(b) { /* ... */ }
export function viewDocs(b) { /* ... */ }
export function viewMore(b) { /* ... */ }
export function viewBikes() { /* ... */ }
export function viewConfig(b) { /* ... */ }
export function viewHistory(b) { /* ... */ }
export function viewBackup(b) { /* ... */ }
export function viewSummary(b) { /* ... */ }
export function openModal(html) { const m = $("#modal"); m.innerHTML = `<div class="modal-card">${html}</div>`; m.classList.add("open"); }
export function closeModal() { const m = $("#modal"); m.classList.remove("open"); m.innerHTML = ""; }
export function modalMaint(bike, type) { /* ... */ }
export function modalMaintPicker(bike) { /* ... */ }
export function modalDoc(bike, key) { /* ... */ }
export function modalBike(bike) { /* ... */ }