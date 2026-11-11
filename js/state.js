import { uid, todayISO, parseDate } from './utils.js?v=13';

export const STORAGE_KEY = "motocontrol.v1";
export const DEFAULT_CONFIG = {
  oil:          { label:"Aceite de motor",        icon:"🛢️", km:3000,  months:6  },
  brakeFluid:   { label:"Líquido de frenos",      icon:"🧴", km:null,  months:24 },
  brakePads:    { label:"Pastillas / Balatas",    icon:"🛑", km:10000, months:null },
  general:      { label:"Revisión general",       icon:"🔧", km:5000,  months:12 },
  chainLube:    { label:"Lubricar cadena",        icon:"⛓️", km:500,   months:null },
  chainTension: { label:"Tensión de cadena",      icon:"🔩", km:1500,  months:null },
  tires:        { label:"Neumáticos (cambio)",    icon:"🛞", km:15000, months:null },
  tirePressure: { label:"Presión de neumáticos",  icon:"💨", km:null,  months:null, days:7 },
  airFilter:    { label:"Filtro de aire",         icon:"🌬️", km:12000, months:12 },
  sparkPlug:    { label:"Bujía",                  icon:"⚡", km:8000,  months:24 },
  battery:      { label:"Batería",                icon:"🔋", km:null,  months:24 },
  fuelFilter:   { label:"Filtro de gasolina",     icon:"🛢️", km:24000, months:24 }
};

export const DOC_TYPES = [
  { key:"soat",    label:"SOAT / Seguro obligatorio", icon:"📄" },
  { key:"rtv",     label:"Inspección técnica vehicular", icon:"🔍" },
  { key:"license", label:"Licencia de conducir", icon:"🪪" }
];

export const STATE = {};

export function newBike(name) {
  return {
    id: uid(), name: name || "Mi Moto", createdAt: new Date().toISOString(),
    odometer: 0, tankCapacity: 3, consumptionAlertPct: 15, currency: "$",
    fixedEfficiency: 0,
    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    fuel: [], maintenance: [], docs: {}
  };
}

export function defaultState() {
  const b = newBike("Mi Moto");
  return { version: 1, activeBikeId: b.id, bikes: [b], theme: "dark" };
}

export function migrate(raw) {
  if (!raw || !Array.isArray(raw.bikes) || !raw.bikes.length) return defaultState();
  raw.bikes.forEach(b => {
    b.id = b.id || uid();
    b.name = b.name || "Mi Moto";
    b.createdAt = b.createdAt || new Date().toISOString();
    b.odometer = Number(b.odometer) || 0;
    b.tankCapacity = Number(b.tankCapacity) || 3;
    b.consumptionAlertPct = isFinite(b.consumptionAlertPct) ? Number(b.consumptionAlertPct) : 15;
    b.currency = b.currency || "$";
    b.fixedEfficiency = Number(b.fixedEfficiency) || 0;
    const cfg = {};
    for (const k of Object.keys(DEFAULT_CONFIG)) {
      cfg[k] = Object.assign({}, DEFAULT_CONFIG[k], (b.config && b.config[k]) || {});
    }
    if (b.config) for (const k of Object.keys(b.config)) if (!cfg[k]) cfg[k] = b.config[k];
    b.config = cfg;
    b.fuel = Array.isArray(b.fuel) ? b.fuel.map(f => ({
      id: f.id || uid(), date: parseDate(f.date) || todayISO(), km: Number(f.km) || 0,
      gallons: Number(f.gallons) || 0, cost: Number(f.cost) || 0, fullTank: !!f.fullTank, notes: f.notes || ""
    })) : [];
    b.maintenance = Array.isArray(b.maintenance) ? b.maintenance.map(m => ({
      id: m.id || uid(), type: m.type || "general", date: parseDate(m.date) || todayISO(),
      km: Number(m.km) || 0, cost: Number(m.cost) || 0, notes: m.notes || ""
    })) : [];
    b.docs = (b.docs && typeof b.docs === "object") ? b.docs : {};
  });
  raw.activeBikeId = raw.bikes.some(b => b.id === raw.activeBikeId) ? raw.activeBikeId : raw.bikes[0].id;
  raw.theme = raw.theme === "light" ? "light" : "dark";
  return raw;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (err) { console.error("Error leyendo LocalStorage:", err); }
  return defaultState();
}

export function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); }
  catch (err) { console.error("Error guardando:", err); alert("No se pudo guardar."); }
}

export function activeBike() {
  return STATE.bikes.find(b => b.id === STATE.activeBikeId) || STATE.bikes[0];
}

export function syncOdometer(bike) {
  const maxFuel = bike.fuel.reduce((m, f) => Math.max(m, f.km || 0), 0);
  const maxMaint = bike.maintenance.reduce((m, r) => Math.max(m, r.km || 0), 0);
  bike.odometer = Math.max(bike.odometer || 0, maxFuel, maxMaint);
}

export function commit() {
  saveState();
  window.dispatchEvent(new CustomEvent('statechange'));
}