import { $, esc, parseNum, parseDate, todayISO, normKey, fmt0, uid } from './utils.js?v=9';
import { STATE, activeBike, syncOdometer, commit, migrate } from './state.js?v=9';
import { UI } from './ui.js?v=9';
import { render } from './render.js?v=9';

const HEADER_ALIASES = {
  type:      ["tipo", "categoria", "category", "registro", "clase"],
  date:      ["fecha", "date", "dia", "fecha carga", "fec"],
  km:        ["km", "kilometraje", "odometro", "kilometros", "km actual", "distancia", "odo"],
  gallons:   ["galones", "galon", "gal", "gallons", "litros", "cantidad", "volumen", "gas"],
  cost:      ["costo", "coste", "total", "valor", "precio", "importe", "monto", "cost", "pago"],
  fullTank:  ["lleno", "tanque lleno", "full", "completo", "full tank", "tanque"],
  notes:     ["notas", "observaciones", "descripcion", "comentario", "detalle"],
  maintType: ["servicio", "mantenimiento", "componente", "pieza", "item", "tipo manto"]
};

export function splitLine(line, delim) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ""; } else cur += c; }
  }
  out.push(cur); return out.map(s => s.trim());
}

export function parseTable(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
  if (!lines.length) return { rows: [] };
  const first = lines[0];
  const delim = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  return { rows: lines.map(l => splitLine(l, delim)), delim };
}

export function detectMapping(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const n = normKey(h);
    if (!n) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some(a => n === a || n.includes(a))) {
        if (!Object.values(map).includes(field)) map[i] = field;
        break;
      }
    }
  });
  return map;
}

export function boolFromCell(v) {
  const n = normKey(v);
  if (!n) return false;
  return ["si", "s", "yes", "y", "1", "true", "lleno", "full", "x", "completo"].includes(n);
}

export function runAnalyzeImport() {
  try {
    const ta = $("#importText");
    const text = (ta ? ta.value : "").trim();
    if (!text) return alert("Pega los datos o sube un archivo primero.");
    if (text.startsWith("{")) { 
      const taRestore = $("#restoreText");
      if (taRestore) taRestore.value = text;
      runRestoreJSON(); 
      return; 
    }
    
    const { rows } = parseTable(text);
    if (!rows.length) return alert("No se detectaron filas.");
    const firstRow = rows[0];
    const looksHeader = firstRow.some(c => {
      const n = normKey(c);
      return Object.values(HEADER_ALIASES).some(list => list.some(a => n.includes(a)));
    }) && !parseDate(firstRow[0]);
    
    const headers = looksHeader ? firstRow : firstRow.map((_, i) => ["tipo", "fecha", "km", "galones", "costo", "lleno", "servicio", "notas"][i] || `Col ${i + 1}`);
    const dataRows = looksHeader ? rows.slice(1) : rows;
    let mapping = looksHeader ? detectMapping(headers) : {};
    if (!Object.keys(mapping).length) mapping = { 0: "type", 1: "date", 2: "km", 3: "gallons", 4: "cost", 5: "fullTank", 6: "maintType", 7: "notes" };
    
    UI.importPreview = { headers, rows: dataRows, mapping };
    render();
  } catch (err) {
    alert("Error al analizar los datos: " + err.message);
    console.error(err);
  }
}

export function runConfirmImport() {
  try {
    const p = UI.importPreview;
    if (!p) return alert("No hay datos para importar.");
    const b = activeBike();
    const idx = {};
    Object.entries(p.mapping).forEach(([col, field]) => { if (field && idx[field] === undefined) idx[field] = +col; });
    
    if (idx.km === undefined) return alert("Debes mapear al menos la columna de Kilometraje.");

    let addedFuel = 0, addedMaint = 0, skipped = 0, invalid = 0;
    let maxKm = b.odometer;

    p.rows.forEach(r => {
      const km = parseNum(r[idx.km]);
      if (!isFinite(km) || km < 0) { invalid++; return; }
      
      const date = idx.date !== undefined ? (parseDate(r[idx.date]) || todayISO()) : todayISO();
      const cost = idx.cost !== undefined ? parseNum(r[idx.cost]) : NaN;
      const notes = idx.notes !== undefined ? String(r[idx.notes] || "").trim() : "";
      const typeStr = idx.type !== undefined ? String(r[idx.type]).toLowerCase() : "";
      
      const isFuel = typeStr.includes("gas") || typeStr.includes("combust") || typeStr === "" || (idx.gallons !== undefined && parseNum(r[idx.gallons]) > 0 && typeStr === "");
      const isMaint = !isFuel || typeStr.includes("mant") || typeStr.includes("aceite") || typeStr.includes("servicio");

      if (isFuel && !isMaint) {
        let gallonsRaw = idx.gallons !== undefined ? String(r[idx.gallons]).trim() : "";
        // CORRECCIÓN: Si el número tiene punto y es menor a 10, forzamos a decimal
        if (gallonsRaw.includes(".") && !gallonsRaw.includes(",")) {
          const num = parseFloat(gallonsRaw);
          if (num < 10) gallonsRaw = gallonsRaw.replace(/\./g, ",");
        }
        const gallons = gallonsRaw ? parseNum(gallonsRaw) : NaN;
        
        const fullTank = idx.fullTank !== undefined ? boolFromCell(r[idx.fullTank]) : false;
        const dup = b.fuel.some(f => f.date === date && Math.round(f.km) === Math.round(km));
        if (dup) { skipped++; return; }
        b.fuel.push({ id: uid(), date, km, gallons: isFinite(gallons) && gallons > 0 ? gallons : 0, cost: isFinite(cost) && cost >= 0 ? cost : 0, fullTank, notes });
        addedFuel++;
      } else {
        let mTypeRaw = idx.maintType !== undefined ? String(r[idx.maintType]).toLowerCase() : "general";
        let mType = "general";
        if (mTypeRaw.includes("aceite") || mTypeRaw.includes("oil")) mType = "oil";
        else if (mTypeRaw.includes("freno") || mTypeRaw.includes("balata")) mType = "brakePads";
        else if (mTypeRaw.includes("cadena") || mTypeRaw.includes("lubric")) mType = "chainLube";
        else if (mTypeRaw.includes("llanta") || mTypeRaw.includes("neumat")) mType = "tires";
        else if (mTypeRaw.includes("filtro")) mType = "airFilter";
        else if (mTypeRaw.includes("bujia") || mTypeRaw.includes("bujía")) mType = "sparkPlug";
        else if (mTypeRaw.includes("bateria") || mTypeRaw.includes("batería")) mType = "battery";
        else if (b.config[mTypeRaw]) mType = mTypeRaw;
        
        const dup = b.maintenance.some(m => m.date === date && Math.round(m.km) === Math.round(km) && m.type === mType);
        if (dup) { skipped++; return; }
        b.maintenance.push({ id: uid(), type: mType, date, km, cost: isFinite(cost) && cost >= 0 ? cost : 0, notes });
        addedMaint++;
      }
      if (km > maxKm) maxKm = km;
    });

    b.odometer = Math.max(b.odometer, maxKm);
    syncOdometer(b);
    UI.importPreview = null;
    commit();

    alert(`Importación completada ✅\n\n• Gasolina agregada: ${addedFuel}\n• Mantenimientos agregados: ${addedMaint}\n• Duplicados omitidos: ${skipped}\n• Filas inválidas: ${invalid}\n• Odómetro actualizado a: ${fmt0(b.odometer)} km`);
  } catch (err) {
    alert("Error al importar: " + err.message);
    console.error(err);
  }
}

export function runRestoreJSON() {
  try {
    const txt = ($("#restoreText")?.value || "").trim();
    if (!txt) return alert("Pega el contenido del respaldo JSON.");
    const obj = JSON.parse(txt);
    if (!obj || !Array.isArray(obj.bikes) || !obj.bikes.length) return alert("El JSON no contiene motos válidas.");
    if (!confirm("Esto reemplazará TODOS los datos actuales. ¿Continuar?")) return;
    
    const migrated = migrate(obj);
    STATE.bikes = migrated.bikes;
    STATE.activeBikeId = migrated.activeBikeId;
    STATE.theme = migrated.theme;
    STATE.version = migrated.version;
    UI.sub = null;
    commit();
    alert("Respaldo restaurado ✅");
  } catch (err) { alert("JSON inválido: " + err.message); }
}