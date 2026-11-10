import { fmt, fmt0, addMonths, addDays, daysUntil, worst, todayISO } from './utils.js?v=8';

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
    parts.push(d < 0 ? `Vencido hace ${Math.abs(d)} d` : `Vence en ${d} d`);
  }
  return parts.join(" · ") || "Sin intervalo configurado";
}

export function fuelStats(bike) {
  const fills = [...bike.fuel].sort((a, b) => (a.km - b.km) || (a.date < b.date ? -1 : 1));
  const fulls = fills.filter(f => f.fullTank);
  const segments = [];
  for (let i = 1; i < fulls.length; i++) {
    const a = fulls[i - 1], b = fulls[i];
    const between = fills.filter(f => f.km > a.km && f.km <= b.km);
    const gallons = between.reduce((sum, f) => sum + (f.gallons || 0), 0);
    const dist = b.km - a.km;
    if (gallons > 0 && dist > 0) segments.push({ km: dist, gallons, kmg: dist / gallons, date: b.date, kmAt: b.km });
  }
  const totalSegKm = segments.reduce((s, x) => s + x.km, 0);
  const totalSegGal = segments.reduce((s, x) => s + x.gallons, 0);
  
  let avg = totalSegGal > 0 ? totalSegKm / totalSegGal : null;
  if (bike.fixedEfficiency > 0) avg = bike.fixedEfficiency;

  const totalCost = fills.reduce((s, f) => s + (f.cost || 0), 0);
  const odoMin = fills.length ? Math.min(...fills.map(f => f.km)) : bike.odometer;
  const odoMax = fills.length ? Math.max(...fills.map(f => f.km)) : bike.odometer;
  const distTotal = Math.max(odoMax - odoMin, 0);
  const costPerKm = distTotal > 0 ? totalCost / distTotal : null;
  const ym = todayISO().slice(0, 7);
  const monthSpend = fills.filter(f => (f.date || "").startsWith(ym)).reduce((s, f) => s + (f.cost || 0), 0);
  
  let remaining = null, autonomy = null;
  let calcDetails = null;
  const lastFull = fulls.length ? fulls[fulls.length - 1] : null;
  
  if (lastFull && avg && bike.tankCapacity > 0) {
    const distSince = Math.max(bike.odometer - lastFull.km, 0);
    const used = distSince / avg;
    const addedAfter = fills.filter(f => f.km > lastFull.km).reduce((s, f) => s + (f.gallons || 0), 0);
    remaining = Math.max(0, Math.min(bike.tankCapacity, bike.tankCapacity - used + addedAfter));
    autonomy = remaining * avg;
    calcDetails = {
      lastFullKm: lastFull.km, lastFullDate: lastFull.date, odometer: bike.odometer,
      distSince, avg, used, addedAfter, capacity: bike.tankCapacity
    };
  }
  const lastSeg = segments.length ? segments[segments.length - 1] : null;
  const dropPct = (avg && lastSeg && bike.fixedEfficiency === 0) ? ((avg - lastSeg.kmg) / avg) * 100 : 0;
  return { fills, fulls, segments, avg, totalCost, costPerKm, monthSpend, remaining, autonomy, lastSeg, dropPct, distTotal, gallonsTotal: fills.reduce((s, f) => s + (f.gallons || 0), 0), calcDetails };
}

export function consumptionLevel(bike, st) {
  if (!st.avg || !st.lastSeg || bike.fixedEfficiency > 0) return "green";
  return st.dropPct > (bike.consumptionAlertPct || 15) ? "red" : "green";
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