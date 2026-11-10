export const LEVEL_RANK = { green:0, yellow:1, red:2 };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
export const pad2 = n => String(n).padStart(2, "0");
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
export const toNum = v => { const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : NaN; };
export const fmt = (n, d = 2) => (n === null || n === undefined || !isFinite(n)) ? "—" : Number(n).toLocaleString("es-ES", { minimumFractionDigits:d, maximumFractionDigits:d });
export const fmt0 = n => fmt(n, 0);
export const addMonths = (dateLike, m) => { const x = new Date(dateLike); const day = x.getDate(); x.setMonth(x.getMonth() + m); if (x.getDate() < day) x.setDate(0); return x; };
export const addDays = (dateLike, n) => { const x = new Date(dateLike); x.setDate(x.getDate() + n); return x; };
export const daysUntil = dateLike => { const a = new Date(); a.setHours(0,0,0,0); const b = new Date(dateLike); b.setHours(0,0,0,0); return Math.round((b - a) / 86400000); };
export const humanDate = iso => { if (!iso) return "—"; const d = new Date(iso + "T00:00:00"); if (isNaN(d)) return iso; return d.toLocaleDateString("es-ES", { day:"2-digit", month:"short", year:"numeric" }); };
export const worst = (a, b) => (LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b);

export function parseNum(v) {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) {
    if (lc > ld) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lc > -1) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1].length !== 3) s = s.replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (ld > -1) {
    if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

export function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m) {
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt)) return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
  return null;
}

export const normKey = s => String(s ?? "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}
export function slug(s) {
  return String(s || "moto").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}