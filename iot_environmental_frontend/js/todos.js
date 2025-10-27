// js/todos.js
import { db } from './firebase-init.js';
import {
  collection, query, orderBy, where, limit, getDocs
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// IMPORTAMOS utilidades para datos en vivo (Open-Meteo)
import { fetchOpenMeteoRange, PROVINCES } from './openmeteo_live.js';

let tempChart, humChart, uvChart;

const LIVE_SENSOR_ID = "__geo_live__"; // opción especial: geolocalización en vivo

const $ = (id) => document.getElementById(id);
const fmtYMD = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
};

function disposeChart(c) { if (c) c.destroy(); }

function buildLineChart(canvasId, labels, data, label) {
  const el = $(canvasId);
  if (!el) return null;
  return new Chart(el.getContext("2d"), {
    type: "line",
    data: { labels, datasets: [{ label, data }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function avg(arr) {
  const v = arr.filter(Number.isFinite);
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : NaN;
}

function toLocalTimeLabel(d) {
  return d.toLocaleString("es-CR", { hour12:false, hour:"2-digit", minute:"2-digit" });
}

/* ---------- NUEVO: llenar selector con sensores + opción en vivo ---------- */
async function fillSensors() {
  const sel = $("sensorSel");
  sel.innerHTML = "";

  // 1) Opción "Ubicación precisa (en vivo)"
  const optLive = document.createElement("option");
  optLive.value = LIVE_SENSOR_ID;
  optLive.textContent = "Ubicación precisa (en vivo)";
  sel.appendChild(optLive);

  // 2) Sensores persistidos en Firestore
  const sensorsSnap = await getDocs(collection(db, "envReadings"));
  const sensors = sensorsSnap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));

  // Orden por nombre si existe
  sensors.sort((a,b)=> (a.name||a.id).localeCompare(b.name||b.id));

  sensors.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name ? `${s.name} (${s.id})` : s.id;
    sel.appendChild(opt);
  });

  // Fallback si no hay ninguno
  if (!sensors.length) {
    const opt = document.createElement("option");
    opt.value = "sensor_001";
    opt.textContent = "sensor_001";
    sel.appendChild(opt);
  }

  return [LIVE_SENSOR_ID, ...sensors.map(s => s.id)];
}

/** obtiene min/max timestamp del sensor para proponer rango válido (últimos 7 días disponibles) */
async function getMinMax(sensorId) {
  const colRef = collection(db, "envReadings", sensorId, "readings");
  const qMin = query(colRef, orderBy("timestamp", "asc"),  limit(1));
  const qMax = query(colRef, orderBy("timestamp", "desc"), limit(1));

  const [sMin, sMax] = await Promise.all([getDocs(qMin), getDocs(qMax)]);
  const minDoc = sMin.docs[0], maxDoc = sMax.docs[0];
  if (!minDoc || !maxDoc) return null;

  const min = (minDoc.data().timestamp?.toDate?.() ?? new Date(minDoc.data().timestamp));
  const max = (maxDoc.data().timestamp?.toDate?.() ?? new Date(maxDoc.data().timestamp));
  return { min, max };
}

/** lee rango por fechas (inclusive) desde Firestore */
async function fetchRange(sensorId, fromYMD, toYMD) {
  const from = new Date(`${fromYMD}T00:00:00`);
  const to   = new Date(`${toYMD}T23:59:59`);

  const colRef = collection(db, "envReadings", sensorId, "readings");
  const qy = query(
    colRef,
    where("timestamp", ">=", from),
    where("timestamp", "<=", to),
    orderBy("timestamp", "asc")
  );
  const snap = await getDocs(qy);

  const rows = [];
  snap.forEach(doc => {
    const x = doc.data();
    rows.push({
      ts: x.timestamp?.toDate ? x.timestamp.toDate() : new Date(x.timestamp),
      temperature_c: Number(x.temperature_c),
      humidity_rel: Number(x.humidity_rel),
      uv_index: Number(x.uv_index)
    });
  });
  return rows;
}

/* ---------- Carga normal (desde Firestore) ---------- */
async function loadAll() {
  const sensorId = $("sensorSel").value || "sensor_001";
  const fromYMD = $("from").value;
  const toYMD   = $("to").value;

  const rows = await fetchRange(sensorId, fromYMD, toYMD);
  if (!rows.length) {
    alert("Sin datos en el rango seleccionado. Ajusta las fechas.");
    return;
  }

  const labels = rows.map(r => toLocalTimeLabel(r.ts));
  const temps = rows.map(r => r.temperature_c);
  const hums  = rows.map(r => r.humidity_rel);
  const uvs   = rows.map(r => r.uv_index);

  disposeChart(tempChart); disposeChart(humChart); disposeChart(uvChart);

  tempChart = buildLineChart("chartTemp", labels, temps, "Temperatura (°C)");
  humChart  = buildLineChart("chartHum",  labels, hums,  "Humedad relativa (%)");
  uvChart   = buildLineChart("chartUV",   labels, uvs,   "Índice UV");

  $("tAvg").textContent = Number.isFinite(avg(temps)) ? avg(temps).toFixed(2) : "--";
  $("hAvg").textContent = Number.isFinite(avg(hums))  ? avg(hums).toFixed(2)  : "--";
  $("uAvg").textContent = Number.isFinite(avg(uvs))   ? avg(uvs).toFixed(2)   : "--";
}

/* ---------- NUEVO: Carga en vivo (Open-Meteo + geolocalización) ---------- */
function setDefaultDatesLast7() {
  const today = new Date();
  const d7 = new Date(); d7.setDate(today.getDate() - 6);
  $("from").value = fmtYMD(d7);
  $("to").value   = fmtYMD(today);
}

async function loadAllLive() {
  const fromYMD = $("from").value;
  const toYMD   = $("to").value;

  const fetchFor = (lat, lon) => fetchOpenMeteoRange({ lat, lon, from: fromYMD, to: toYMD });

  const rows = await new Promise((resolve) => {
    if (!navigator.geolocation) {
      const sj = PROVINCES[0]; // fallback San José
      fetchFor(sj.lat, sj.lon).then(resolve);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => fetchFor(pos.coords.latitude, pos.coords.longitude).then(resolve),
      err => { console.warn("Geo error:", err); const sj = PROVINCES[0]; fetchFor(sj.lat, sj.lon).then(resolve); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });

  if (!rows.length) {
    alert("Open-Meteo: sin datos para ese rango.");
    return;
  }

  const labels = rows.map(r => r.timestamp.toLocaleTimeString("es-CR", { hour:'2-digit', minute:'2-digit', hour12:false }));
  const temps  = rows.map(r => r.temperature_c);
  const hums   = rows.map(r => r.humidity_rel);
  const uvs    = rows.map(r => r.uv_index);

  disposeChart(tempChart); disposeChart(humChart); disposeChart(uvChart);

  tempChart = buildLineChart("chartTemp", labels, temps, "Temperatura (°C)");
  humChart  = buildLineChart("chartHum",  labels, hums,  "Humedad relativa (%)");
  uvChart   = buildLineChart("chartUV",   labels, uvs,   "Índice UV");

  $("tAvg").textContent = Number.isFinite(avg(temps)) ? avg(temps).toFixed(2) : "--";
  $("hAvg").textContent = Number.isFinite(avg(hums))  ? avg(hums).toFixed(2)  : "--";
  $("uAvg").textContent = Number.isFinite(avg(uvs))   ? avg(uvs).toFixed(2)   : "--";
}

/* ---------- Helpers de rango ---------- */
async function setDefaultRangeForSensor(sensorId) {
  if (sensorId === LIVE_SENSOR_ID) {
    setDefaultDatesLast7();
    return;
  }
  const mm = await getMinMax(sensorId);
  if (mm) {
    const { max } = mm;
    const d7 = new Date(max); d7.setDate(max.getDate() - 6);
    $("from").value = fmtYMD(d7);
    $("to").value   = fmtYMD(max);
  } else {
    setDefaultDatesLast7();
  }
}

/* ---------- INIT ---------- */
async function init() {
  const ids = await fillSensors();

  // Por defecto, elegimos la opción en vivo
  $("sensorSel").value = LIVE_SENSOR_ID;

  await setDefaultRangeForSensor(LIVE_SENSOR_ID);

  $("btnLoad").addEventListener("click", async () => {
    if ($("sensorSel").value === LIVE_SENSOR_ID) await loadAllLive();
    else await loadAll();
  });

  $("sensorSel").addEventListener("change", async () => {
    const id = $("sensorSel").value;
    await setDefaultRangeForSensor(id);
    if (id === LIVE_SENSOR_ID) await loadAllLive();
    else await loadAll();
  });

  // carga inicial (en vivo)
  await loadAllLive();
}

window.addEventListener("DOMContentLoaded", init);
