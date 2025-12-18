
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// --- CONFIGURAZIONE DI SICUREZZA ---
// Configurazione corretta per il progetto GeCoLa
const firebaseConfig = {
  apiKey: "AIzaSyCb_bbD8wlYPmuTZkmgBXbvzRq8NBbkNrg",
  authDomain: "gecola-bbf37.firebaseapp.com",
  databaseURL: "https://gecola-bbf37-default-rtdb.europe-west1.firebasedatabase.app", // URL Database Europa
  projectId: "gecola-bbf37",
  storageBucket: "gecola-bbf37.firebasestorage.app",
  messagingSenderId: "49804026654",
  appId: "1:49804026654:web:5aa057abd84a0651b69f0f",
  measurementId: "G-RSSS8F5280"
};

// Initialize Firebase
let authExports;
let dbExports;

try {
    const app = initializeApp(firebaseConfig);
    authExports = getAuth(app);
    dbExports = getDatabase(app);
} catch (e) {
    console.warn("Firebase non configurato correttamente o errore di inizializzazione:", e);
    authExports = null; 
    dbExports = null;
}

export const auth = authExports;
export const db = dbExports;
