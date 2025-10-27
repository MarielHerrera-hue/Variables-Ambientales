// js/main.js
// Lee la última lectura desde Firestore en: envReadings/{SENSOR_ID}/readings
// y actualiza las tarjetas de Temperatura, Humedad e Índice UV.

// 1) Firebase (v9.22.1, igual que tu firebase-init.js)
import { db } from "./firebase-init.js";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// 2) Sensor: puedes cambiarlo desde la URL con ?sensor=sensor_002
const urlParams = new URLSearchParams(window.location.search);
const SENSOR_ID = urlParams.get("sensor") || "sensor_001";

// 3) Elementos del DOM
const $ = (id) => document.getElementById(id);
const humEl = $("data-humidity");
const humStatusEl = $("status-humidity");
const tempEl = $("data-temperature");
const tempStatusEl = $("status-temperature");
const uvEl = $("data-uv");
const uvStatusEl = $("status-uv");

// 4) Clasificadores de estado
const getHumidityStatus = (val) => {
  if (val < 30) return { text: "Baja", class: "status-low" };
  if (val <= 60) return { text: "Normal", class: "status-normal" };
  return { text: "Alta", class: "status-high" };
};

const getTempStatus = (val) => {
  if (val < 18) return { text: "Baja", class: "status-low" };
  if (val <= 26) return { text: "Normal", class: "status-normal" };
  return { text: "Alta", class: "status-high" };
};

const getUvStatus = (val) => {
  if (val <= 2) return { text: "Baja", class: "status-low" };
  if (val <= 5) return { text: "Moderada", class: "status-normal" };
  if (val <= 7) return { text: "Alta", class: "status-high" };
  if (val <= 10) return { text: "Muy Alta", class: "status-very-high" };
  return { text: "Extrema", class: "status-extreme" };
};

// 5) Firestore: colección de lecturas del sensor
// Esquema usado por tu uploader: envReadings/{sensor_id}/readings/{timestamp_iso}
const readingsCol = collection(db, "envReadings", SENSOR_ID, "readings");

// Último documento por timestamp (la lectura más reciente)
const q = query(readingsCol, orderBy("timestamp", "desc"), limit(1));

// 6) Suscripción en tiempo real
onSnapshot(
  q,
  (snapshot) => {
    if (snapshot.empty) {
      console.log("No se encontraron documentos.");
      humEl.textContent = "Sin datos";
      tempEl.textContent = "Sin datos";
      uvEl.textContent = "Sin datos";
      return;
    }

    const latest = snapshot.docs[0].data();

    // Compatibilidad: usamos nombres nuevos y, si no existen, caemos a los antiguos
    const humidity = Number(
      latest.humidity_rel ?? latest.humidity ?? NaN
    );
    const temperature = Number(
      latest.temperature_c ?? latest.temperature ?? NaN
    );
    const uv = Number(latest.uv_index ?? latest.uv_radiation ?? NaN);

    // --- Humedad ---
    if (!Number.isNaN(humidity)) {
      const s = getHumidityStatus(humidity);
      humEl.textContent = `${humidity.toFixed(1)}%`;
      humStatusEl.textContent = s.text;
      humStatusEl.className = `card-status ${s.class}`;
    } else {
      humEl.textContent = "—";
      humStatusEl.textContent = "";
      humStatusEl.className = "card-status";
    }

    // --- Temperatura ---
    if (!Number.isNaN(temperature)) {
      const s = getTempStatus(temperature);
      tempEl.textContent = `${temperature.toFixed(1)}°C`;
      tempStatusEl.textContent = s.text;
      tempStatusEl.className = `card-status ${s.class}`;
    } else {
      tempEl.textContent = "—";
      tempStatusEl.textContent = "";
      tempStatusEl.className = "card-status";
    }

    // --- Índice UV ---
    if (!Number.isNaN(uv)) {
      const s = getUvStatus(uv);
      uvEl.textContent = `${uv.toFixed(1)} UVI`;
      uvStatusEl.textContent = s.text;
      uvStatusEl.className = `card-status ${s.class}`;
    } else {
      uvEl.textContent = "—";
      uvStatusEl.textContent = "";
      uvStatusEl.className = "card-status";
    }
  },
  (error) => {
    console.error("Error al obtener datos de Firestore: ", error);
    humEl.textContent = "Error";
    tempEl.textContent = "Error";
    uvEl.textContent = "Error";
  }
);
