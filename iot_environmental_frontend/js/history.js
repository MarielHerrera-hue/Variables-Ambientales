// js/history.js  (Firebase v9.22.1)
import { db } from "./firebase-init.js";
import {
  collection, query, orderBy, limit, where, getDocs
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const SENSOR_ID = urlParams.get("sensor") || "sensor_001";

// -------- helpers --------
const asDate = (ts) => (ts && typeof ts.toDate === "function" ? ts.toDate() : new Date(ts));
const fmtDateLocal = (d) => {
  // yyyy-mm-dd en zona local (NO ISO) para <input type="date">
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const toLocal = (d) => d.toLocaleString("es-CR", { hour12: false });

// -------- límites (mín/max) del dataset en Firestore --------
async function getBounds() {
  const col = collection(db, "envReadings", SENSOR_ID, "readings");
  const firstQ = query(col, orderBy("timestamp", "asc"), limit(1));
  const lastQ  = query(col, orderBy("timestamp", "desc"), limit(1));
  const [s1, s2] = await Promise.all([getDocs(firstQ), getDocs(lastQ)]);
  if (s1.empty || s2.empty) return { first: null, last: null };
  const first = asDate(s1.docs[0].data().timestamp);
  const last  = asDate(s2.docs[0].data().timestamp);
  return { first, last };
}

// -------- leer rango (hora local CR -06:00 para delimitar días) --------
export async function fetchRange(fromDate, toDate) {
  const start = new Date(`${fromDate}T00:00:00-06:00`);
  const end   = new Date(`${toDate}T23:59:59-06:00`);
  const col   = collection(db, "envReadings", SENSOR_ID, "readings");
  const qy    = query(
    col,
    where("timestamp", ">=", start),
    where("timestamp", "<=", end),
    orderBy("timestamp")
  );
  const snap  = await getDocs(qy);
  return snap.docs.map(d => {
    const x = d.data();
    return { id: d.id, ...x, timestamp: asDate(x.timestamp) }; // -> Date nativa
  });
}

export function dailyAverage(rows, varName) {
  const acc = new Map();
  for (const r of rows) {
    const key = fmtDateLocal(r.timestamp);
    const v = Number(r[varName]);
    if (!Number.isFinite(v)) continue;
    const o = acc.get(key) || { sum: 0, n: 0 };
    o.sum += v; o.n += 1;
    acc.set(key, o);
  }
  return [...acc.entries()]
    .map(([date, { sum, n }]) => ({ date, value: +(sum / n).toFixed(2) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function extremes(rows, varName) {
  let max = null, min = null;
  for (const r of rows) {
    const v = Number(r[varName]);
    if (!Number.isFinite(v)) continue;
    if (!max || v > max.value) max = { value: v, ts: r.timestamp };
    if (!min || v < min.value) min = { value: v, ts: r.timestamp };
  }
  return { max, min };
}

export function renderLine(canvasId, rows, varName, label) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  const labels = rows.map(r =>
    r.timestamp.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
  const data   = rows.map(r => r[varName]);
  new Chart(el.getContext("2d"), {
    type: "line",
    data: { labels, datasets: [{ label, data }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

export function renderBars(canvasId, series, label) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  new Chart(el.getContext("2d"), {
    type: "bar",
    data: { labels: series.map(d => d.date), datasets: [{ label, data: series.map(d => d.value) }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

// -------- punto de entrada para cada página de variable --------
export async function setupVarPage(varName, label) {
  const inputFrom = document.getElementById("from");
  const inputTo   = document.getElementById("to");
  const btn       = document.getElementById("btnLoad");
  const maxBox    = document.getElementById("maxBox");
  const minBox    = document.getElementById("minBox");
  const avgBox    = document.getElementById("avgBox");

  // 1) Ajusta los inputs al rango disponible (últimos 7 días respecto al último dato)
  const { first, last } = await getBounds();
  if (!first || !last) {
    alert("No hay datos en Firestore aún.");
    return;
  }
  const startDefault = new Date(last);
  startDefault.setDate(startDefault.getDate() - 6);
  const fromDefault = startDefault < first ? first : startDefault;

  inputFrom.value = fmtDateLocal(fromDefault);
  inputTo.value   = fmtDateLocal(last);

  // 2) Función de carga
  async function load() {
    const rows  = await fetchRange(inputFrom.value, inputTo.value);
    if (!rows.length) { alert("Sin datos en el rango."); return; }

    renderLine("chartVar", rows, varName, label);

    const daily = dailyAverage(rows, varName);
    renderBars("chartDaily", daily, `${label} (promedio diario)`);

    const { max, min } = extremes(rows, varName);
    const avg = daily.reduce((a,b)=>a+b.value,0)/daily.length;

    maxBox.textContent = `${max.value.toFixed(2)} @ ${toLocal(max.ts)}`;
    minBox.textContent = `${min.value.toFixed(2)} @ ${toLocal(min.ts)}`;
    avgBox.textContent = `${avg.toFixed(2)}`;
  }

  // 3) Eventos + primera carga
  btn.addEventListener("click", load);
  await load();
}
