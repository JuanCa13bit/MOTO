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
    ${b.fixedEfficiency > 0 
      ? `<p class="sm center" style="margin-top:6px;color:var(--ok)">Rendimiento fijo aplicado: ${b.fixedEfficiency} km/gal</p>` 
      : `<p class="sm center" style="margin-top:6px;color:var(--warn); cursor:pointer" data-act="sub" data-sub="config">⚠️ Toca aquí para configurar tu rendimiento real</p>`}
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

export function viewFuel(b) {
  const st = fuelStats(b);
  const list = [...b.fuel].sort((a, c) => (c.km - a.km) || (c.date < a.date ? -1 : 1));
  const rows = list.length ? list.map(f => `
    <div class="rec">
      <div class="rec-ico">${f.fullTank ? "🈵" : "⛽"}</div>
      <div class="rec-main">
        <div class="rec-t">${fmt0(f.km)} km · ${fmt(f.gallons, 2)} gal</div>
        <div class="rec-s">${humanDate(f.date)} · ${f.fullTank ? "Tanque lleno" : "Parcial"}${f.notes ? " · " + esc(f.notes) : ""}</div>
      </div>
      <div class="rec-v">${esc(b.currency)}${fmt(f.cost, 2)}</div>
      <button class="rec-del" data-act="delFuel" data-id="${f.id}" aria-label="Eliminar">✕</button>
    </div>`).join("") : `<div class="empty">Sin cargas registradas todavía.</div>`;

  return `
  <section class="card">
    <div class="card-h"><h2>Nueva carga</h2></div>
    <form id="fuelForm">
      <label class="fld">Fecha<input type="date" name="date" value="${todayISO()}" required></label>
      <label class="fld">Kilometraje actual<input type="number" name="km" inputmode="numeric" step="1" min="0" value="${Math.round(b.odometer)}" required></label>
      <div class="row2">
        <label class="fld">Galones<input type="number" name="gallons" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required></label>
        <label class="fld">Costo total<input type="number" name="cost" inputmode="decimal" step="0.01" min="0" placeholder="0.00" required></label>
      </div>
      <label class="check"><input type="checkbox" name="fullTank" checked>¿Llenaste el tanque hasta el tope?</label>
      <button class="btn primary" type="submit">Guardar carga</button>
    </form>
  </section>
  <section class="card">
    <div class="card-h"><h2>Rendimiento (km/gal)</h2></div>
    ${renderChart(st.segments)}
    <div class="stats" style="margin-top:12px">
      <div class="stat"><div class="s-lbl">Promedio histórico</div><div class="s-val">${st.avg ? fmt(st.avg, 2) : "—"} <small>km/gal</small></div></div>
      <div class="stat"><div class="s-lbl">Último tanque</div><div class="s-val">${st.lastSeg ? fmt(st.lastSeg.kmg, 2) : "—"} <small>km/gal</small></div></div>
      <div class="stat"><div class="s-lbl">Costo por km</div><div class="s-val">${st.costPerKm ? esc(b.currency) + fmt(st.costPerKm, 3) : "—"}</div></div>
      <div class="stat"><div class="s-lbl">Gasto del mes</div><div class="s-val">${esc(b.currency)}${fmt(st.monthSpend, 2)}</div></div>
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Historial de cargas</h2><span class="pill">${list.length}</span></div>
    ${rows}
  </section>`;
}

export function viewMaint(b) {
  const statuses = Object.keys(b.config).map(k => computeStatus(b, k));
  statuses.sort((a, c) => LEVEL_RANK[c.level] - LEVEL_RANK[a.level]);
  const blocks = statuses.map(s => {
    const recs = b.maintenance.filter(m => m.type === s.key).sort((a, c) => (c.km - a.km) || (c.date < a.date ? -1 : 1)).slice(0, 2);
    return `
    <div class="item st-${s.level}">
      <div class="item-ico">${s.cfg.icon || "🔧"}</div>
      <div class="item-main">
        <div class="item-title">${esc(s.cfg.label)}</div>
        <div class="item-sub">${esc(statusText(s))}${s.last ? `<br>Último: ${fmt0(s.last.km)} km · ${humanDate(s.last.date)}` : "<br>Sin registros previos"}</div>
      </div>
      <button class="btn-mini primary" data-act="openMaint" data-type="${s.key}" title="Registrar">+</button>
    </div>
    ${recs.length && recs.some(r => r.cost || r.notes) ? recs.map(r => `
      <div class="rec" style="margin-left:14px">
        <div class="rec-ico">•</div>
        <div class="rec-main"><div class="rec-t">${fmt0(r.km)} km</div><div class="rec-s">${humanDate(r.date)}${r.notes ? " · " + esc(r.notes) : ""}</div></div>
        ${r.cost ? `<div class="rec-v">${esc(b.currency)}${fmt(r.cost, 2)}</div>` : ""}
        <button class="rec-del" data-act="delMaint" data-id="${r.id}" aria-label="Eliminar">✕</button>
      </div>`).join("") : ""}`;
  }).join("");
  return `
  <section class="card tight"><div class="card-h" style="padding:4px 4px 0"><h2>Estado de mantenimientos</h2></div></section>
  <section class="card tight">${blocks}</section>`;
}

export function viewDocs(b) {
  const items = DOC_TYPES.map(dt => {
    const d = b.docs[dt.key] || {};
    let level = "green", text = "Sin fecha registrada";
    if (d.date) {
      const days = Math.round((new Date(d.date) - new Date().setHours(0,0,0,0)) / 86400000);
      level = days < 0 ? "red" : days <= 30 ? "yellow" : "green";
      text = days < 0 ? `Vencido hace ${Math.abs(days)} días (${humanDate(d.date)})` : `Vence en ${days} días (${humanDate(d.date)})`;
    } else { level = "yellow"; }
    return `
    <div class="item st-${level}">
      <div class="item-ico">${dt.icon}</div>
      <div class="item-main"><div class="item-title">${dt.label}</div><div class="item-sub">${esc(text)}</div></div>
      <button class="btn-mini" data-act="editDoc" data-key="${dt.key}" title="Editar">✎</button>
    </div>`;
  }).join("");
  return `
  <section class="card">
    <div class="card-h"><h2>Documentos y legal</h2></div>
    <p class="mu sm">Recibirás alerta 🟡 a 30 días del vencimiento y 🔴 al vencer.</p>
    ${items}
  </section>`;
}

export function viewMore(b) {
  if (UI.sub === "bikes")     return viewBikes();
  if (UI.sub === "config")    return viewConfig(b);
  if (UI.sub === "history")   return viewHistory(b);
  if (UI.sub === "backup")    return viewBackup(b);
  if (UI.sub === "summary")   return viewSummary(b);
  return `
  <section class="card">
    <button class="menu-btn" data-act="sub" data-sub="summary"><span class="m-ico">📋</span>Ficha de venta / Resumen<span class="m-arrow">›</span></button>
    <button class="menu-btn" data-act="sub" data-sub="history"><span class="m-ico">🗂️</span>Historial completo<span class="m-arrow">›</span></button>
    <button class="menu-btn" data-act="sub" data-sub="config"><span class="m-ico">⚙️</span>Ajustes de esta moto<span class="m-arrow">›</span></button>
    <button class="menu-btn" data-act="sub" data-sub="bikes"><span class="m-ico">🏍️</span>Mis motocicletas<span class="m-arrow">›</span></button>
    <button class="menu-btn" data-act="sub" data-sub="backup"><span class="m-ico">💾</span>Respaldo / Importar<span class="m-arrow">›</span></button>
  </section>
  <section class="card">
    <div class="card-h"><h2>Datos</h2></div>
    <div class="stats">
      <div class="stat"><div class="s-lbl">Cargas</div><div class="s-val">${b.fuel.length}</div></div>
      <div class="stat"><div class="s-lbl">Mantenimientos</div><div class="s-val">${b.maintenance.length}</div></div>
    </div>
    <p class="mu sm" style="margin-top:12px">Todo se guarda localmente en este dispositivo. Sin cuentas, sin servidores.</p>
  </section>`;
}

export function viewBikes() {
  const cards = STATE.bikes.map(b => `
    <div class="item ${b.id === STATE.activeBikeId ? "st-green" : ""}">
      <div class="item-ico">🏍️</div>
      <div class="item-main">
        <div class="item-title">${esc(b.name)} ${b.id === STATE.activeBikeId ? `<span class="pill green">activa</span>` : ""}</div>
        <div class="item-sub">${fmt0(b.odometer)} km · Tanque ${fmt(b.tankCapacity, 1)} gal · ${b.fuel.length} cargas</div>
      </div>
      ${b.id !== STATE.activeBikeId ? `<button class="btn-mini" data-act="setBike" data-id="${b.id}" title="Activar">✓</button>` : ""}
      <button class="btn-mini" data-act="editBike" data-id="${b.id}" title="Editar">✎</button>
    </div>`).join("");
  return `
  <div class="no-print" style="margin-bottom:12px"><button class="btn ghost sm" data-act="sub" data-sub="null">← Volver</button></div>
  <section class="card">
    <div class="card-h"><h2>Mis motocicletas</h2></div>
    ${cards}
    <button class="btn primary" style="margin-top:10px" data-act="newBike">＋ Agregar motocicleta</button>
  </section>`;
}

export function viewConfig(b) {
  const rows = Object.keys(b.config).map(k => {
    const c = b.config[k];
    return `
    <div class="cfgrow">
      <div class="cfgname">${c.icon || "🔧"} ${esc(c.label)}</div>
      <div class="cfginputs">
        <label>CADA (km)<input type="number" min="0" step="1" data-cfg="${k}" data-f="km" value="${c.km ?? ""}" placeholder="—"></label>
        <label>CADA (meses)<input type="number" min="0" step="1" data-cfg="${k}" data-f="months" value="${c.months ?? ""}" placeholder="—"></label>
        <label>CADA (días)<input type="number" min="0" step="1" data-cfg="${k}" data-f="days" value="${c.days ?? ""}" placeholder="—"></label>
      </div>
    </div>`;
  }).join("");
  return `
  <div class="no-print" style="margin-bottom:12px"><button class="btn ghost sm" data-act="sub" data-sub="null">← Volver</button></div>
  <section class="card">
    <div class="card-h"><h2>Datos de la moto</h2></div>
    <label class="fld">Nombre<input type="text" id="cfgName" value="${esc(b.name)}"></label>
    <div class="row2">
      <label class="fld">Tanque (gal)<input type="number" id="cfgTank" step="0.1" min="0" value="${b.tankCapacity}"></label>
      <label class="fld">Alerta consumo (%)<input type="number" id="cfgAlert" step="1" min="1" max="90" value="${b.consumptionAlertPct}"></label>
    </div>
    <div class="row2">
      <label class="fld">Moneda<input type="text" id="cfgCur" maxlength="3" value="${esc(b.currency)}"></label>
      <label class="fld" title="Si pones un número aquí, la app ignorará el promedio histórico para calcular la autonomía.">Rendimiento Fijo (km/gal)<input type="number" id="cfgEff" step="1" min="0" placeholder="Ej: 120" value="${b.fixedEfficiency || ''}"></label>
    </div>
    <button class="btn primary" data-act="saveBikeCfg">Guardar datos</button>
  </section>
  <section class="card">
    <div class="card-h"><h2>Intervalos de mantenimiento</h2></div>
    <p class="mu sm">Ajusta los intervalos según la ficha técnica.</p>
    ${rows}
    <button class="btn primary" style="margin-top:14px" data-act="saveIntervals">Guardar intervalos</button>
  </section>
  <section class="card">
    <div class="card-h"><h2>Zona de riesgo</h2></div>
    <button class="btn danger" data-act="delBike" data-id="${b.id}">Eliminar esta motocicleta</button>
  </section>`;
}

export function viewHistory(b) {
  const f = UI.history;
  const inRange = iso => (!f.from || iso >= f.from) && (!f.to || iso <= f.to);
  let rows = [];
  if (f.kind === "all" || f.kind === "fuel") {
    rows = rows.concat(b.fuel.filter(x => inRange(x.date)).map(x => ({
      date: x.date, kind: "fuel", icon: "⛽", title: `${fmt0(x.km)} km · ${fmt(x.gallons, 2)} gal${x.fullTank ? " · lleno" : ""}`,
      cost: x.cost, notes: x.notes, id: x.id
    })));
  }
  if (f.kind === "all" || f.kind === "maint") {
    rows = rows.concat(b.maintenance.filter(x => inRange(x.date)).map(x => ({
      date: x.date, kind: "maint", icon: (b.config[x.type] || {}).icon || "🔧",
      title: `${(b.config[x.type] || {}).label || x.type} · ${fmt0(x.km)} km`, cost: x.cost, notes: x.notes, id: x.id
    })));
  }
  rows.sort((a, c) => (c.date < a.date ? -1 : 1));
  const total = rows.reduce((s, r) => s + (r.cost || 0), 0);
  return `
  <div class="no-print" style="margin-bottom:12px"><button class="btn ghost sm" data-act="sub" data-sub="null">← Volver</button></div>
  <section class="card no-print">
    <div class="card-h"><h2>Filtros</h2></div>
    <label class="fld">Tipo de gasto
      <select id="hKind">
        <option value="all" ${f.kind === "all" ? "selected" : ""}>Todo</option>
        <option value="fuel" ${f.kind === "fuel" ? "selected" : ""}>Combustible</option>
        <option value="maint" ${f.kind === "maint" ? "selected" : ""}>Mantenimiento</option>
      </select>
    </label>
    <div class="row2">
      <label class="fld">Desde<input type="date" id="hFrom" value="${f.from}"></label>
      <label class="fld">Hasta<input type="date" id="hTo" value="${f.to}"></label>
    </div>
    <div class="row2"><button class="btn" data-act="applyHist">Aplicar</button><button class="btn ghost" data-act="clearHist">Limpiar</button></div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Movimientos</h2><span class="pill">${esc(b.currency)}${fmt(total, 2)}</span></div>
    ${rows.length ? rows.map(r => `
      <div class="rec">
        <div class="rec-ico">${r.icon}</div>
        <div class="rec-main"><div class="rec-t">${esc(r.title)}</div><div class="rec-s">${humanDate(r.date)}${r.notes ? " · " + esc(r.notes) : ""}</div></div>
        <div class="rec-v">${r.cost ? esc(b.currency) + fmt(r.cost, 2) : ""}</div>
      </div>`).join("") : `<div class="empty">No hay movimientos con estos filtros.</div>`}
  </section>`;
}

export function viewBackup(b) {
  const p = UI.importPreview;
  let previewHTML = "";
  if (p) {
    const cols = p.headers.map((h, i) => `
      <th>
        <div style="font-size:10px;color:var(--mu);margin-bottom:4px">${esc(h || "Col " + (i + 1))}</div>
        <select data-map="${i}" style="min-height:38px;padding:4px 6px;font-size:12px;margin:0">
          <option value=""        ${!p.mapping[i] ? "selected" : ""}>— ignorar —</option>
          <option value="type"    ${p.mapping[i] === "type" ? "selected" : ""}>Tipo (Gasolina/Manto)</option>
          <option value="date"    ${p.mapping[i] === "date" ? "selected" : ""}>Fecha</option>
          <option value="km"      ${p.mapping[i] === "km" ? "selected" : ""}>Km</option>
          <option value="gallons" ${p.mapping[i] === "gallons" ? "selected" : ""}>Galones</option>
          <option value="cost"    ${p.mapping[i] === "cost" ? "selected" : ""}>Costo</option>
          <option value="fullTank"${p.mapping[i] === "fullTank" ? "selected" : ""}>Tanque lleno</option>
          <option value="maintType"${p.mapping[i] === "maintType" ? "selected" : ""}>Servicio (Aceite/Frenos...)</option>
          <option value="notes"   ${p.mapping[i] === "notes" ? "selected" : ""}>Notas</option>
        </select>
      </th>`).join("");
    const rows = p.rows.slice(0, 5).map(r => `<tr>${p.headers.map((_, i) => `<td>${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("");
    previewHTML = `
    <section class="card">
      <div class="card-h"><h2>Vista previa</h2><span class="pill">${p.rows.length} filas</span></div>
      <p class="mu sm">Verifica el auto-mapeo. Puedes corregirlo.</p>
      <div class="scroll-x"><table class="tbl"><thead><tr>${cols}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row2" style="margin-top:14px">
        <button class="btn ghost" data-act="cancelImport">Cancelar</button>
        <button class="btn primary" data-act="confirmImport">Importar</button>
      </div>
    </section>`;
  }
  return `
  <div class="no-print" style="margin-bottom:12px"><button class="btn ghost sm" data-act="sub" data-sub="null">← Volver</button></div>
  <section class="card">
    <div class="card-h"><h2>Exportar respaldo</h2></div>
    <p class="mu sm">Descarga una copia de seguridad completa o el historial de la moto activa.</p>
    <div class="row2"><button class="btn" data-act="exportJSON">JSON (todo)</button><button class="btn" data-act="exportCSV">CSV (moto)</button></div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Pasar mi historial</h2></div>
    <p class="mu sm">Pega desde <b>Excel / Google Sheets</b> o sube un CSV.</p>
    <label class="fld">Pegar datos<textarea id="importText" placeholder="tipo,fecha,km,galones,costo,lleno,servicio,notas&#10;gasolina,2024-03-01,5200,2.5,12.50,si,,"></textarea></label>
    <label class="fld">…o subir archivo<input type="file" id="importFile" accept=".csv,.txt,.json"></label>
    <button class="btn primary" data-act="analyzeImport">Analizar</button>
  </section>
  ${previewHTML}
  <section class="card">
    <div class="card-h"><h2>Importar respaldo JSON</h2></div>
    <p class="mu sm">Pega el contenido de un respaldo JSON completo.</p>
    <label class="fld">Respaldo JSON<textarea id="restoreText" placeholder='{"version":1,"bikes":[...]}'></textarea></label>
    <button class="btn danger" data-act="restoreJSON">Restaurar respaldo</button>
  </section>`;
}

export function viewSummary(b) {
  const st = fuelStats(b);
  const allMaint = [...b.maintenance].sort((a, c) => (a.date < c.date ? -1 : 1));
  const maintCost = allMaint.reduce((s, r) => s + (r.cost || 0), 0);
  const totalOwnership = st.totalCost + maintCost;
  const maintRows = allMaint.map(r => {
    const cfg = b.config[r.type] || {};
    return `<tr><td>${humanDate(r.date)}</td><td>${fmt0(r.km)} km</td><td>${cfg.icon || ""} ${esc(cfg.label || r.type)}</td><td style="text-align:right">${r.cost ? esc(b.currency) + fmt(r.cost, 2) : "—"}</td><td>${esc(r.notes || "")}</td></tr>`;
  }).join("");
  const fuelRows = [...b.fuel].sort((a, c) => (a.date < c.date ? -1 : 1)).map(f => `<tr><td>${humanDate(f.date)}</td><td>${fmt0(f.km)} km</td><td>${fmt(f.gallons, 2)} gal ${f.fullTank ? "🈵" : ""}</td><td style="text-align:right">${esc(b.currency)}${fmt(f.cost, 2)}</td></tr>`).join("");
  return `
  <div class="no-print" style="margin-bottom:12px;display:flex;gap:8px">
    <button class="btn ghost sm" data-act="sub" data-sub="null">← Volver</button>
    <button class="btn primary sm" data-act="print">🖨️ Imprimir / PDF</button>
  </div>
  <section class="card">
    <h2>🏍️ ${esc(b.name)}</h2>
    <p class="mu sm">Hoja de vida generada el ${humanDate(todayISO())}</p><hr class="sep">
    <div class="stats">
      <div class="stat"><div class="s-lbl">Odómetro</div><div class="s-val">${fmt0(b.odometer)} <small>km</small></div></div>
      <div class="stat"><div class="s-lbl">Rendimiento prom.</div><div class="s-val">${st.avg ? fmt(st.avg, 2) : "—"} <small>km/gal</small></div></div>
      <div class="stat"><div class="s-lbl">Costo combustible</div><div class="s-val">${esc(b.currency)}${fmt(st.totalCost, 2)}</div></div>
      <div class="stat"><div class="s-lbl">Costo mantenimiento</div><div class="s-val">${esc(b.currency)}${fmt(maintCost, 2)}</div></div>
      <div class="stat"><div class="s-lbl">Costo total de propiedad</div><div class="s-val">${esc(b.currency)}${fmt(totalOwnership, 2)}</div></div>
      <div class="stat"><div class="s-lbl">Costo por km</div><div class="s-val">${st.costPerKm ? esc(b.currency) + fmt(st.costPerKm, 3) : "—"}</div></div>
    </div>
  </section>
  <section class="card">
    <div class="card-h"><h2>Historial de mantenimientos</h2><span class="pill">${allMaint.length}</span></div>
    ${allMaint.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Fecha</th><th>Km</th><th>Servicio</th><th style="text-align:right">Costo</th><th>Notas</th></tr></thead><tbody>${maintRows}</tbody></table></div>` : `<div class="empty">Sin mantenimientos registrados.</div>`}
  </section>
  <section class="card">
    <div class="card-h"><h2>Historial de combustible</h2><span class="pill">${b.fuel.length}</span></div>
    ${b.fuel.length ? `<div class="scroll-x"><table class="tbl"><thead><tr><th>Fecha</th><th>Km</th><th>Carga</th><th style="text-align:right">Costo</th></tr></thead><tbody>${fuelRows}</tbody></table></div>` : `<div class="empty">Sin cargas registradas.</div>`}
  </section>`;
}

export function openModal(html) { const m = $("#modal"); m.innerHTML = `<div class="modal-card">${html}</div>`; m.classList.add("open"); }
export function closeModal() { const m = $("#modal"); m.classList.remove("open"); m.innerHTML = ""; }

export function modalMaint(bike, type) {
  const cfg = bike.config[type] || { label: type, icon: "🔧" };
  openModal(`
    <h3>${cfg.icon || "🔧"} ${esc(cfg.label)}</h3>
    <p class="mu sm" style="margin-bottom:14px">Registra el servicio realizado.</p>
    <form id="maintForm">
      <input type="hidden" name="type" value="${esc(type)}">
      <label class="fld">Fecha<input type="date" name="date" value="${todayISO()}" required></label>
      <label class="fld">Kilometraje<input type="number" name="km" inputmode="numeric" min="0" step="1" value="${Math.round(bike.odometer)}" required></label>
      <label class="fld">Costo<input type="number" name="cost" inputmode="decimal" step="0.01" min="0" placeholder="0.00"></label>
      <label class="fld">Notas / Observaciones<input type="text" name="notes" placeholder="Ej: aceite 10W-40 sintético"></label>
      <div class="row2"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div>
    </form>
  `);
}

export function modalMaintPicker(bike) {
  const keys = Object.keys(bike.config);
  openModal(`
    <h3>¿Qué mantenimiento registras?</h3>
    <div style="margin-top:12px">
      ${keys.map(k => { const c = bike.config[k]; return `<button class="menu-btn" data-act="openMaint" data-type="${k}"><span class="m-ico">${c.icon || "🔧"}</span>${esc(c.label)}<span class="m-arrow">›</span></button>`; }).join("")}
    </div>
    <button class="btn ghost" data-act="closeModal" style="margin-top:6px">Cancelar</button>
  `);
}

export function modalDoc(bike, key) {
  const dt = DOC_TYPES.find(d => d.key === key) || { label: key, icon: "📄" };
  const cur = bike.docs[key] || {};
  openModal(`
    <h3>${dt.icon} ${esc(dt.label)}</h3>
    <form id="docForm">
      <input type="hidden" name="key" value="${esc(key)}">
      <label class="fld">Fecha de vencimiento<input type="date" name="date" value="${cur.date || ""}" required></label>
      <label class="fld">Notas<input type="text" name="notes" value="${esc(cur.notes || "")}" placeholder="Opcional"></label>
      <div class="row2"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div>
    </form>
    ${cur.date ? `<button class="btn danger" style="margin-top:10px" data-act="clearDoc" data-key="${esc(key)}">Borrar fecha</button>` : ""}
  `);
}

export function modalBike(bike) {
  const isNew = !bike;
  openModal(`
    <h3>${isNew ? "Nueva motocicleta" : "Editar motocicleta"}</h3>
    <form id="bikeForm">
      <input type="hidden" name="id" value="${bike ? bike.id : ""}">
      <label class="fld">Nombre<input type="text" name="name" value="${bike ? esc(bike.name) : ""}" placeholder="Ej: Moto Trabajo" required></label>
      <label class="fld">Capacidad del tanque (galones)<input type="number" name="tank" step="0.1" min="0" value="${bike ? bike.tankCapacity : 3}" required></label>
      <label class="fld">Odómetro actual (km)<input type="number" name="odo" step="1" min="0" value="${bike ? Math.round(bike.odometer) : 0}" required></label>
      <div class="row2"><button type="button" class="btn ghost" data-act="closeModal">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div>
    </form>
  `);
}