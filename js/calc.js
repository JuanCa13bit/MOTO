import { fmt, fmt0, addMonths, addDays, daysUntil, worst, todayISO } from './utils.js?v=11';

export function computeStatus(bike, key) {
  const cfg = bike.config[key] || {};
  const records = bike.maintenance.filter(m => m.type === key).sort((a, b) => (a.km - b.km) || (a.date < b.date ? -1 : 1));
  const last = records.length ? records[records.length - 1] : null;
  const res = { key, cfg, last, checks: [] };
  if (cfg.km) {
    const base = last ? last.km : 0;
    const due = base + cfg.km;
    const rem = due - bike.odometer;
    const warn = Math.max(cfg.km * 0.10, 50);
    const level = rem < 0 ? "red" : rem <= warn ? "yellow" : "green";
    res.kmCheck = { due, rem, level };
    res.checks.push(res.kmCheck);
  }
  if (cfg.months) {
    const start = last ? last.date : (bike.createdAt || Date.now());
    const due = addMonths(start, cfg.months);
    const days = daysUntil(due);
    const warn = Math.max(Math.round(cfg.months * 30 * 0.10), 7);
    const level = days < 0 ? "red" : days <= warn ? "yellow" : "green";
    res.dateCheck = { due, days, level, unit: "meses" };
    res.checks.push(res.dateCheck);
  }
  if (cfg.days) {
    const start = last ? last.date : (bike.createdAt || Date.now());
    const due = addDays(start, cfg.days);
    const days = daysUntil(due);
    const warn = Math.max(Math.round(cfg.days * 0.15), 1);
    const level = days < 0 ? "red" : days <= warn ? "yellow" : "green";
    res.dateCheck = { due, days, level, unit: "días" };
    res.checks.push(res.dateCheck);
  }
  res.level = res.checks.length ? res.checks.map(c => c.level).reduce(worst, "green") : "green";
  return res;
}

export function statusText(s) {
  const parts = [];
  if (s.kmCheck) {
    const r = s.kmCheck.rem;
    parts.push(r < 0 ? `Vencido por ${fmt0(Math.abs(r))} km` : `Faltan ${fmt0(r)} km`);
  }
  if (s.dateCheck) {
    const d = s.dateCheck.days;
    parts.push(d < 0 ? `Vencido hace ${Math.abs(d)} días` : `Vence en ${d} días`);
  }
  return parts.join(" · ") || "Sin intervalo configurado";
}

export function fuelStats(bike) {
  const fills = [...bike.fuel].sort((a, b) => (a.km - b.km) || (a.date < b.date ? -1 : 1));
  if (fills.length === 0) return { avg: null, remaining: 0, autonomy: null, lastFill: null, kmSinceLast: 0, calcDetails: null };

  // 1. CALCULAR RENDIMIENTO (Promedio de las últimas 5 recargas o rendimiento fijo)
  let avg = bike.fixedEfficiency > 0 ? bike.fixedEfficiency : null;
  
  if (!avg) {
    // Tomamos las últimas 5 recargas (ordenadas de más antigua a más nueva)
    const recent = fills.slice(-5);
    let totalKm = 0;
    let totalGal = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const dist = recent[i].km - recent[i - 1].km;
      // Si la distancia es positiva y los galones son lógicos (menores al tanque)
      if (dist > 0 && recent[i].gallons > 0 && recent[i].gallons <= (bike.tankCapacity + 1)) {
        totalKm += dist;
        totalGal += recent[i].gallons;
      }
    }
    if (totalGal > 0) avg = totalKm / totalGal;
    else avg = 120; // Por defecto si no hay datos suficientes
  }

  // 2. ÚLTIMA RECARGA Y DISTANCIA ACTUAL
  const lastFill = fills[fills.length - 1];
  const kmSinceLast = Math.max(bike.odometer - lastFill.km, 0);

  // 3. GASOLINA RESTANTE Y AUTONOMÍA
  // Asumimos que lo que echaste en la última recarga es lo que tienes, menos lo que has gastado.
  let remaining = 0;
  let autonomy = 0;

  if (lastFill.fullTank) {
    // Si fue tanque lleno, partimos de la capacidad total
    remaining = bike.tankCapacity - (kmSinceLast / avg);
  } else {
    // Si fue parcial, partimos de lo que echaste (asumiendo que estaba casi vacío, como dices)
    remaining = lastFill.gallons - (kmSinceLast / avg);
  }

  // Si echaste gasolina DESPUÉS de la última recarga (no debería pasar, pero por si acaso)
  const addedAfter = fills.filter(f => f.km > lastFill.km).reduce((s, f) => s + (f.gallons || 0), 0);
  remaining += addedAfter;

  remaining = Math.max(0, Math.min(bike.tankCapacity, remaining));
  autonomy = remaining * avg;

  // Datos extras para la interfaz
  const totalCost = fills.reduce((s, f) => s + (f.cost || 0), 0);
  const ym = todayISO().slice(0, 7);
  const monthSpend = fills.filter(f => (f.date || "").startsWith(ym)).reduce((s, f) => s + (f.cost || 0), 0);

  const calcDetails = {
    lastFillKm: lastFill.km,
    lastFillDate: lastFill.date,
    lastFillGal: lastFill.gallons,
    isFullTank: lastFill.fullTank,
    odometer: bike.odometer,
    kmSinceLast,
    avg,
    usedSinceLast: kmSinceLast / avg,
    remaining,
    capacity: bike.tankCapacity
  };

  return { fills, avg, remaining, autonomy, lastFill, kmSinceLast, calcDetails, totalCost, monthSpend };
}

export function consumptionLevel(bike, st) {
  return "green"; // Desactivado temporalmente para evitar falsas alarmas
}

export function autonomyLevel(bike, st) {
  if (st.remaining === null || !bike.tankCapacity) return "green";
  const ratio = st.remaining / bike.tankCapacity;
  if (ratio <= 0.10) return "red";
  if (ratio <= 0.25) return "yellow";
  return "green";
}

export function getFuelLevelInfo(st, capacity) {
  if (st.remaining === null || !capacity) return { text: "—", icon: "⛽", pct: 0 };
  const pct = st.remaining / capacity;
  let text = "", icon = "";
  if (pct <= 0.05) { text = "¡Vacío!"; icon = "🛑"; }
  else if (pct <= 0.20) { text = "Reserva"; icon = "⚠️"; }
  else if (pct <= 0.35) { text = "1/4 Tanque"; icon = "🔴"; }
  else if (pct <= 0.60) { text = "Mitad"; icon = "🟡"; }
  else if (pct <= 0.85) { text = "3/4 Tanque"; icon = "🟢"; }
  else { text = "Lleno"; icon = "🈵"; }
  return { text, icon, pct };
}

export function getMaintRemaining(bike) {
  const statuses = Object.keys(bike.config).map(k => computeStatus(bike, k));
  return statuses.sort((a, b) => {
    const rank = { red: 0, yellow: 1, green: 2 };
    return rank[a.level] - rank[b.level];
  });
}