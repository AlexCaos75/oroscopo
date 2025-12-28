import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwvbPE9ERhPsguZGqBK1ZCA1LBWUDDDTw",
  authDomain: "ruota-lunare-2026.firebaseapp.com",
  projectId: "ruota-lunare-2026",
  storageBucket: "ruota-lunare-2026.firebasestorage.app",
  messagingSenderId: "30667953656",
  appId: "1:30667953656:web:3bd55af9bbf2ce8b8fb20d",
  databaseURL: "https://ruota-lunare-2026-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const BACHECA_LATEST = "ruota-lunare/bacheca/latest";

const metaEl = document.getElementById("bMeta");
const textEl = document.getElementById("bText");
const linkEl = document.getElementById("bLink");

function fmtDate(ms) {
  try {
    return new Date(ms).toLocaleString("it-IT");
  } catch {
    return String(ms);
  }
}

onValue(ref(db, BACHECA_LATEST), (snap) => {
  const v = snap.val();
  if (!v) {
    metaEl.textContent = "Nessun post ancora.";
    textEl.textContent = "";
    linkEl.href = "index.html";
    return;
  }

  metaEl.textContent = `Autore: ${v.author || "Luna Vallyy"} | Oracolo: ${v.oracle || ""} | Giorno: ${v.day || ""} | Pianetini: ${v.sign || ""} | Aggiornato: ${fmtDate(v.at)}`;
  textEl.textContent = v.text || "";
  linkEl.href = v.link || "index.html";
});
