// js/openmeteo_live.js  (Open-Meteo + Chart.js, sin API key)

// -------- Provincias de Costa Rica (coordenadas aproximadas) --------
export const PROVINCES = [
  { id: "sj",  name: "San José",   lat: 9.9281,  lon: -84.0907 },
  { id: "al",  name: "Alajuela",   lat: 10.0162, lon: -84.2116 },
  { id: "ca",  name: "Cartago",    lat: 9.8644,  lon: -83.9194 },
  { id: "he",  name: "Heredia",    lat: 10.0024, lon: -84.1165 },
  { id: "gu",  name: "Guanacaste", lat: 10.6326, lon: -85.4377 },
  { id: "pu",  name: "Puntarenas", lat: 9.9764,  lon: -84.8384 },
  { id: "li",  name: "Limón",      lat: 9.9907,  lon: -83.0360 },
];

// -------- Aliases seguros de nombres de variable --------
// (Por si el HTML llega a enviar otros nombres por costumbre)
const VAR_MAP = {
  temperature_2m: 'temperature_c',
  relative_humidity_2m: 'humidity_rel',
  uv: 'uv_index'
};

// -------- Utilidades --------
const fmtDateLocal = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
};

// Datos horarios de Open-Meteo para rango [from,to] (YYYY-MM-DD)
export async function fetchOpenMeteoRange({ lat, lon, from, to, tz = "auto" }) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "temperature_2m,relative_humidity_2m,uv_index",
    timezone: tz,
    start_date: from,
    end_date: to
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Open-Meteo request failed");
  const j = await res.json();
  const h = j.hourly || {};
  const t = h.time || [];
  const temp = h.temperature_2m || [];
  const hum  = h.relative_humidity_2m || [];
  const uv   = h.uv_index || [];

  const rows = [];
  for (let i = 0; i < t.length; i++) {
    rows.push({
      timestamp: new Date(t[i]), // viene ya con zona horaria (tz=auto)
      temperature_c: Number(temp[i]),
      humidity_rel: Number(hum[i]),
      uv_index: Number(uv[i] ?? 0)
    });
  }
  return rows;
}

export function dailyAverage(rows, varName) {
  const acc = new Map();
  for (const r of rows) {
    const key = fmtDateLocal(r.timestamp);
    const v = Number(r[varName]);
    if (!Number.isFinite(v)) continue;
    const o = acc.get(key) || { sum:0, n:0 };
    o.sum += v; o.n += 1;
    acc.set(key,o);
  }
  return [...acc.entries()]
    .map(([date,{sum,n}]) => ({ date, value:+(sum/n).toFixed(2) }))
    .sort((a,b)=>a.date.localeCompare(b.date));
}

export function extremes(rows, varName) {
  let max=null, min=null;
  for (const r of rows) {
    const v = Number(r[varName]);
    if (!Number.isFinite(v)) continue;
    if (!max || v>max.value) max = { value:v, ts:r.timestamp };
    if (!min || v<min.value) min = { value:v, ts:r.timestamp };
  }
  return { max, min };
}

let lineChart = null;
let barChart  = null;

function renderLine(canvasId, rows, varName, label) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  const labels = rows.map(r => r.timestamp.toLocaleTimeString("es-CR",{hour:'2-digit',minute:'2-digit',hour12:false}));
  const data   = rows.map(r => r[varName]);
  lineChart = new Chart(el.getContext("2d"), {
    type: "line",
    data: { labels, datasets: [{ label, data }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
}

function renderBars(canvasId, series, label) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (barChart) { barChart.destroy(); barChart = null; }
  barChart = new Chart(el.getContext("2d"), {
    type: "bar",
    data: { labels: series.map(d=>d.date), datasets: [{ label, data: series.map(d=>d.value) }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
}

// Inicializa controles y carga Open-Meteo (geolocalización o provincia)
export async function initLiveControls({ varName, label }) {
  // Normaliza posibles aliases
  varName = VAR_MAP[varName] || varName;

  // UI esperada en el HTML
  const from = document.getElementById("from");
  const to   = document.getElementById("to");
  const btnGeo   = document.getElementById("btnGeo");
  const selProv  = document.getElementById("provinceSelect");
  const btnLoad  = document.getElementById("btnLoadLive");
  const maxBox   = document.getElementById("maxBox");
  const minBox   = document.getElementById("minBox");
  const avgBox   = document.getElementById("avgBox");

  // Rellenar provincias
  if (selProv) {
    selProv.innerHTML = `<option value="">— Elegir provincia —</option>`;
    PROVINCES.forEach(p => {
      const opt = document.createElement("option");
      opt.value = `${p.lat},${p.lon}`;
      opt.textContent = p.name;
      selProv.appendChild(opt);
    });
  }

  // Rango por defecto: últimos 7 días
  const today = new Date();
  const d7 = new Date(); d7.setDate(today.getDate()-6);
  if (from) from.value = fmtDateLocal(d7);
  if (to)   to.value   = fmtDateLocal(today);

  const toLocal = d => d.toLocaleString("es-CR",{hour12:false});

  async function draw(rows) {
    if (!rows.length) { alert("Open-Meteo: sin datos en ese rango."); return; }
    renderLine("chartVar", rows, varName, label);
    const daily = dailyAverage(rows, varName);
    renderBars("chartDaily", daily, `${label} (promedio diario)`);
    const { max, min } = extremes(rows, varName);
    const avg = daily.reduce((a,b)=>a+b.value,0)/daily.length;
    if (maxBox) maxBox.textContent = `${max.value.toFixed(2)} @ ${toLocal(max.ts)}`;
    if (minBox) minBox.textContent = `${min.value.toFixed(2)} @ ${toLocal(min.ts)}`;
    if (avgBox) avgBox.textContent = `${avg.toFixed(2)}`;
  }

  async function loadFor(lat, lon) {
    const rows = await fetchOpenMeteoRange({ lat, lon, from: from.value, to: to.value });
    await draw(rows);
  }

  // Botón "Usar mi ubicación"
  if (btnGeo) {
    btnGeo.addEventListener("click", () => {
      if (!navigator.geolocation) {
        alert("Geolocalización no soportada por el navegador.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => {
          const { latitude, longitude } = pos.coords;
          if (selProv) selProv.value = ""; // limpia selección
          loadFor(latitude, longitude);
        },
        err => {
          console.warn("Geo error:", err);
          alert("No se pudo obtener la ubicación. Elige una provincia.");
        },
        { enableHighAccuracy:true, timeout:10000, maximumAge:300000 }
      );
    });
  }

  // Cargar por provincia (click)
  if (btnLoad && selProv) {
    btnLoad.addEventListener("click", () => {
      const v = selProv.value;
      if (!v) { alert("Elige una provincia o usa tu ubicación."); return; }
      const [lat, lon] = v.split(",").map(Number);
      loadFor(lat, lon);
    });
  }

  // Cargar automáticamente al cambiar provincia
  if (selProv) {
    selProv.addEventListener("change", () => {
      if (!selProv.value) return;
      const [lat, lon] = selProv.value.split(",").map(Number);
      loadFor(lat, lon);
    });
  }

  // Auto: intenta ubicación actual; si falla, San José
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => loadFor(pos.coords.latitude, pos.coords.longitude),
      () => {
        const sj = PROVINCES[0];
        loadFor(sj.lat, sj.lon);
      }
    );
  } else {
    const sj = PROVINCES[0];
    loadFor(sj.lat, sj.lon);
  }
}
