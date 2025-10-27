// Importar las funciones necesarias de los SDK de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Tu configuración de Firebase (la que proporcionaste)
const firebaseConfig = {
  apiKey: "AIzaSyCHg8Tx40G7WBRsCR8L4X7FA1ugQsN8Td0",
  authDomain: "iot-environmental-project.firebaseapp.com",
  projectId: "iot-environmental-project",
  storageBucket: "iot-environmental-project.firebasestorage.app",
  messagingSenderId: "301240042213",
  appId: "1:301240042213:web:9ba1b7fb61b896c4d3ca0c"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Exportar la instancia de Firestore para usarla en otros archivos
export const db = getFirestore(app);