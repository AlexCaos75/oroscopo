// ==========================
// 🔥 RUOTA LUNARE 2026 — SCRIPT VINCENTE (FULL)
// ✅ ruota: 12 segni, NO ripetizioni, mantiene evidenza, reset automatico a fine giro (multi-client)
// ✅ daily listener con off()
// ✅ fallback giorno locale
// ✅ admin salva sul daily corrente
// ✅ compatibile oroscopiCurrent: stringa OR {date, updatedAt}
// ✅ AUTO-UPDATE GIORNALIERO DIRETTO SU FIREBASE
// ✅ anti-spam: 1 volta al giorno + lock globale vero (transaction)
// ✅ resync dopo mezzanotte
// ✅ supporta OROSCOPO RICCO: stringa OR oggetto {testo, amore, lavoro, fortuna, consiglio}
// ✅ MIGRAZIONE: window.LUNA.migrateTodayToRichFormat()
// ✅ POST: bacheca OR oscopo (opzionale)
// ✅ POST NEUTRO: 13° evento separato (titolo/testo/link/immagine/video/musica)
// ✅ COPIA POST: discord-safe completo
// ==========================

const DEBUG = true;

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  onValue,
  update,
  off,
  get,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

// ==========================
// ⚙️ FIREBASE CONFIG
// ==========================
const firebaseConfig = {
  apiKey: "AIzaSyAwvbPE9ERhPsguZGqBK1ZCA1LBWUDDDTw",
  authDomain: "ruota-lunare-2026.firebaseapp.com",
  projectId: "ruota-lunare-2026",
  storageBucket: "ruota-lunare-2026.firebasestorage.app",
  messagingSenderId: "30667953656",
  appId: "1:30667953656:web:3bd55af9bbf2ce8b8fb20d",
  databaseURL: "https://ruota-lunare-2026-default-rtdb.europe-west1.firebasedatabase.app"
};

const appFB = initializeApp(firebaseConfig);
const db = getDatabase(appFB);

// ==========================
// 🌐 GLOBAL
// ==========================
window.LUNA = window.LUNA || {};
window.LUNA.db = db;
window.LUNA.user = null;
window.LUNA.isAdmin = false;
window.LUNA.lastBotMessage = 0;
window.LUNA.currentDay = null;
window.LUNA.oroscopo = null;

window.CURRENT_DAY = null;
window.OROSCOPO_2026 = null;

// ==========================
// 📡 PATH
// ==========================
const CHAT_PATH        = "ruota-lunare/chat";
const ORO_CURRENT_PATH = "ruota-lunare/oroscopiCurrent";      // fallback
const ORO_CURRENT_STR  = "ruota-lunare/oroscopiCurrentDate";  // primario
const ORO_DAILY_BASE   = "ruota-lunare/oroscopiDaily";
const BACHECA_LATEST   = "ruota-lunare/bacheca/latest";

// ✅ RUOTA “NO REPEAT” (stato condiviso)
const SPIN_STATE_PATH  = "ruota-lunare/spinState";

// ==========================
// 🧠 STATO UI
// ==========================
let STATE = "BOOT";
let isAdmin = false;
const ADMIN_PASSWORD = "oracolo2026";
let CURRENT_DAY = null;

const SIGNS = [
  { name:"Ariete", img:"p01.png", lore:"Inizio, energia", hint:"Coraggio" },
  { name:"Toro", img:"p02.png", lore:"Stabilita", hint:"Determinazione" },
  { name:"Gemelli", img:"p03.png", lore:"Comunicazione", hint:"Flessibilita" },
  { name:"Cancro", img:"p04.png", lore:"Emozione", hint:"Cura" },
  { name:"Leone", img:"p05.png", lore:"Leadership", hint:"Potere" },
  { name:"Vergine", img:"p06.png", lore:"Precisione", hint:"Ordine" },
  { name:"Bilancia", img:"p07.png", lore:"Equilibrio", hint:"Giustizia" },
  { name:"Scorpione", img:"p08.png", lore:"Mistero", hint:"Trasformazione" },
  { name:"Sagittario", img:"p09.png", lore:"Avventura", hint:"Verita" },
  { name:"Capricorno", img:"p10.png", lore:"Disciplina", hint:"Struttura" },
  { name:"Acquario", img:"p11.png", lore:"Visione", hint:"Rivoluzione" },
  { name:"Pesci", img:"p12.png", lore:"Sogno", hint:"Intuizione" }
];

let oroscopo2026 = {};
let cards = [];
let dailyRef = null;

// per animazione / sync
let lastSpinIdSeen = "";
let resetArmed = false;

// ==========================
// 🗓️ DATE KEY
// ==========================
function localDayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseCurrentDayFromDb(v) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (v && typeof v === "object" && typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) return v.date;
  return null;
}

// ==========================
// 🧼 SANITIZER ASCII (NO STRANI / DISCORD SAFE)
// ==========================
function sanitizePlainASCII(input) {
  let s = String(input ?? "");
  try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch {}
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
  s = s.replace(/\?{2,}/g, "?");
  s = s.replace(/"{2,}/g, '"');
  s = s.replace(/'{2,}/g, "'");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function isValidYouTubeId(id){
  return typeof id === "string" && /^[a-zA-Z0-9_-]{6,20}$/.test(id);
}

// ==========================
// 🌟 DEFAULT OROSCOPO RICCO (ASCII safe)
// ==========================
function buildDefaultDailyPayload() {
  const base = {
    "Ariete": { testo:"Energia alta e voglia di ripartire. Scegli una sfida e affrontala senza esitazioni.", amore:"Diretto e magnetico: chiarisci subito cosa vuoi.", lavoro:"Taglia il superfluo e agisci: oggi conta la rapidita.", fortuna:"Alta se segui listinto.", consiglio:"Una decisione netta vale piu di mille dubbi." },
    "Toro": { testo:"Stabilita e riflessioni profonde. Costruisci con calma: un passo solido oggi vale doppio domani.", amore:"Gesti concreti: poche parole ma vere.", lavoro:"Ritmo costante: chi semina raccoglie.", fortuna:"Media-alta se non forzi i tempi.", consiglio:"Scegli una priorita e proteggila." },
    "Gemelli": { testo:"Comunicazione al centro: una notizia, un invito o un contatto sblocca la giornata.", amore:"Leggerezza intelligente: flirt e sorrisi.", lavoro:"Ottimo per riunioni, messaggi, accordi.", fortuna:"Alta nelle relazioni.", consiglio:"Parla chiaro, ma ascolta di piu." },
    "Cancro": { testo:"Emozioni intense: oggi lintuizione e una bussola precisa.", amore:"Dolcezza e protezione: evita le punzecchiature.", lavoro:"Meglio procedure e continuita che cambi improvvisi.", fortuna:"Buona se resti centrato.", consiglio:"Non difenderti: esprimiti." },
    "Leone": { testo:"Brilla senza paura: lattenzione e su di te, usala bene.", amore:"Passione e orgoglio: chiedi, non pretendere.", lavoro:"Leadership naturale: guida e ispira.", fortuna:"Alta quando osi.", consiglio:"Fatti vedere, ma con eleganza." },
    "Vergine": { testo:"Ordine e precisione premiano: risolvi piccoli dettagli e vinci sul lungo periodo.", amore:"Dimostra con fatti, non con ansia.", lavoro:"Perfetto per revisioni, conti, organizzazione.", fortuna:"Media, cresce con disciplina.", consiglio:"Un problema alla volta." },
    "Bilancia": { testo:"Equilibrio tra cuore e mente: oggi scegli cio che ti rende leggero.", amore:"Armonia e dialogo: evita mezze verita.", lavoro:"Mediazione vincente: ottimo per accordi.", fortuna:"Buona nelle scelte eleganti.", consiglio:"Non rimandare la decisione." },
    "Scorpione": { testo:"Trasformazioni in arrivo: una verita emerge, e ti rende piu forte.", amore:"Intensita: evita gelosie inutili.", lavoro:"Strategia: muoviti in silenzio e colpisci preciso.", fortuna:"Alta se resti lucido.", consiglio:"Taglia cio che ti drena energia." },
    "Sagittario": { testo:"Desiderio di avventura: espandi confini, anche solo con unidea nuova.", amore:"Spontaneo: sorprendi chi ami.", lavoro:"Visione ampia: pensa in grande, poi pianifica.", fortuna:"Alta se ti muovi.", consiglio:"Non temere di cambiare rotta." },
    "Capricorno": { testo:"Determinazione e risultati: oggi costruisci una prova concreta del tuo valore.", amore:"Stabilita: prometti poco, mantieni tutto.", lavoro:"Focus e responsabilita: ottimo per chiudere pratiche.", fortuna:"Media ma sicura.", consiglio:"Fai cio che conta, non cio che appare." },
    "Acquario": { testo:"Idee fuori dagli schemi: una soluzione creativa ti fa saltare di livello.", amore:"Originale: chiedi spazio e dai spazio.", lavoro:"Innovazione: prova una strada diversa.", fortuna:"Alta nelle intuizioni improvvise.", consiglio:"Non spiegare troppo: fai." },
    "Pesci": { testo:"Intuizioni forti: sogni e segnali parlano chiaro, se li ascolti.", amore:"Empatia: abbraccia invece di analizzare.", lavoro:"Creativita: ispira e crea connessioni.", fortuna:"Buona se segui il cuore.", consiglio:"Proteggi la tua sensibilita." }
  };
  return { ...base, updatedAt: Date.now() };
}

// ==========================
// 🧩 FORMAT OUTPUT (stringa o oggetto)
// ==========================
function formatHoroscopeForOutput(signName, value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const parts = [];
    if (value.testo) parts.push(value.testo);
    parts.push("");
    parts.push(`Amore: ${value.amore || "-"}`);
    parts.push(`Lavoro: ${value.lavoro || "-"}`);
    parts.push(`Fortuna: ${value.fortuna || "-"}`);
    parts.push(`Consiglio: ${value.consiglio || "-"}`);
    return parts.join("\n").trim();
  }
  return `Oroscopo non disponibile per ${signName}.`;
}

// ==========================
// 🔗 LINK BASE
// ==========================
function getBaseLink() {
  const { origin, pathname } = window.location;
  const baseDir = pathname.replace(/\/[^/]*$/, "/");
  return origin + baseDir + "index.html";
}

// ==========================
// 🧩 AUTO-UPDATE DAILY (LOCK VERO)
// ==========================
let lastUpdateTry = 0;

async function ensureDailyOroscopoUpToDate() {
  const now = Date.now();
  if (now - lastUpdateTry < 15000) return;
  lastUpdateTry = now;

  const today = localDayKey();
  const key = "lunaDailyInit_" + today;

  if (localStorage.getItem(key) === "1") {
    if (DEBUG) console.log("[ORO] daily init already done for", today);
    return;
  }

  // lock globale multi-client
  const lockRef = ref(db, `ruota-lunare/meta/dailyInitLock/${today}`);
  const tx = await runTransaction(lockRef, (cur) => {
    if (cur && cur.locked) return cur;
    return { locked: true, at: Date.now() };
  });

  const gotLock = tx?.committed === true && tx?.snapshot?.val()?.locked === true;
  if (!gotLock) {
    if (DEBUG) console.log("[ORO] lock exists, skip init for", today);
    localStorage.setItem(key, "1");
    return;
  }

  const dailyRefToday = ref(db, `${ORO_DAILY_BASE}/${today}`);
  const snapDaily = await get(dailyRefToday);
  const def = buildDefaultDailyPayload();

  if (!snapDaily.exists()) {
    await set(dailyRefToday, def);
  } else {
    const cur = snapDaily.val() || {};
    const patch = {};
    for (const sign of Object.keys(def)) {
      if (sign === "updatedAt") continue;
      if (cur[sign] == null) { patch[sign] = def[sign]; continue; }
      if (typeof cur[sign] === "object" && cur[sign] !== null) {
        const src = cur[sign], dst = def[sign];
        for (const k of ["testo","amore","lavoro","fortuna","consiglio"]) {
          if (src[k] == null || src[k] === "") patch[`${sign}/${k}`] = dst[k];
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await update(dailyRefToday, patch);
    }
  }

  await set(ref(db, ORO_CURRENT_STR), today);
  await set(ref(db, ORO_CURRENT_PATH), { date: today, updatedAt: Date.now() });

  localStorage.setItem(key, "1");
  if (DEBUG) console.log("[ORO] daily ok, current =", today);
}

function scheduleMidnightResync() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0);
  const ms = next.getTime() - now.getTime();

  setTimeout(() => {
    ensureDailyOroscopoUpToDate().catch(()=>{});
    scheduleMidnightResync();
  }, ms);
}

// ==========================
// 🧿 MIGRAZIONE (console)
// ==========================
async function migrateTodayToRichFormat() {
  if (!isAdmin) return alert("Solo ADMIN puo migrare il daily.");
  if (!CURRENT_DAY) return alert("CURRENT_DAY non disponibile.");

  const day = CURRENT_DAY;
  const dailyRefToday = ref(db, `${ORO_DAILY_BASE}/${day}`);
  const snap = await get(dailyRefToday);
  if (!snap.exists()) return alert("Daily non trovato per " + day);

  const cur = snap.val() || {};
  const def = buildDefaultDailyPayload();

  const patch = {};
  let converted = 0;

  for (const sign of Object.keys(def)) {
    if (sign === "updatedAt") continue;

    const v = cur[sign];
    if (v == null) { patch[sign] = def[sign]; converted++; continue; }

    if (typeof v === "string") {
      const d = def[sign];
      patch[sign] = { testo: v, amore: d.amore, lavoro: d.lavoro, fortuna: d.fortuna, consiglio: d.consiglio };
      converted++;
      continue;
    }

    if (v && typeof v === "object") {
      const d = def[sign];
      for (const k of ["testo","amore","lavoro","fortuna","consiglio"]) {
        if (v[k] == null || v[k] === "") patch[`${sign}/${k}`] = d[k];
      }
    }
  }

  patch.updatedAt = Date.now();
  await update(dailyRefToday, patch);
  alert(`Migrazione completata: ${converted} segni convertiti per ${day}.`);
}

// ==========================
// 🔮 OROSCOPO REALTIME
// ==========================
function initOroscopoRealtime() {
  onValue(ref(db, ORO_CURRENT_STR), snap => {
    const dayFromDb = snap.val();
    const day = (dayFromDb && typeof dayFromDb === "string") ? dayFromDb : localDayKey();
    attachDaily(day);
  }, _err => {
    listenCurrentFallback();
    attachDaily(localDayKey());
  });
}

function listenCurrentFallback() {
  onValue(ref(db, ORO_CURRENT_PATH), snap => {
    const raw = snap.val();
    const parsed = parseCurrentDayFromDb(raw);
    attachDaily(parsed || localDayKey());
  });
}

function attachDaily(day) {
  if (!day || typeof day !== "string") return;
  if (CURRENT_DAY === day) return;

  CURRENT_DAY = day;
  window.LUNA.currentDay = CURRENT_DAY;
  window.CURRENT_DAY = CURRENT_DAY;

  if (dailyRef) off(dailyRef);
  dailyRef = ref(db, `${ORO_DAILY_BASE}/${day}`);

  onValue(dailyRef, s2 => {
    oroscopo2026 = s2.val() || {};
    window.LUNA.oroscopo = oroscopo2026;
    window.OROSCOPO_2026 = oroscopo2026;
    if (DEBUG) console.log("[ORO] day =", CURRENT_DAY, "keys =", Object.keys(oroscopo2026 || {}));
  });
}

// ==========================
// 🔐 LOGIN
// ==========================
function initUI() {
  const loginModal = document.getElementById("loginModal");
  const app        = document.querySelector(".app");
  const controls   = document.getElementById("controls");
  const loginBtn   = document.getElementById("loginBtn");
  const loginInput = document.getElementById("loginName");

  if (!loginModal || !app || !controls || !loginBtn || !loginInput) return;

  loginBtn.addEventListener("click", () => doLogin(loginInput.value.trim()));
  loginInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(loginInput.value.trim()); });

  const saved = sessionStorage.getItem("lunaUser");
  if (saved) setTimeout(() => doLogin(saved), 1200);

  function doLogin(name) {
    if (!name || name.length < 2) return;
    window.LUNA.user = name;
    sessionStorage.setItem("lunaUser", name);

    loginModal.classList.add("hidden");
    app.classList.remove("hidden");
    controls.classList.remove("hidden");

    STATE = "IDLE";
    lunaBot(`Benvenuto ${name}. La ruota attende.`);
  }
}

// ==========================
// 🌙 INTRO
// ==========================
function playIntro() {
  const curtain = document.getElementById("cosmicCurtain");
  const login   = document.getElementById("loginModal");
  if (!curtain || !login) return;

  document.body.classList.add("lock");
  login.classList.add("hidden");

  setTimeout(() => curtain.classList.add("fadeout"), 2200);
  setTimeout(() => {
    curtain.style.display = "none";
    login.classList.remove("hidden");
    document.body.classList.remove("lock");
  }, 3000);
}

// ==========================
// 🖼️ IMMAGINI
// ==========================
function safeImg(img) { return `immagini/${img || "p01.png"}`; }
function preloadImages() { SIGNS.forEach(s => { const img = new Image(); img.src = safeImg(s.img); }); }

// ==========================
// 🎴 CARDS (con classi chosen/winner)
// ==========================
function initCards() {
  const left  = document.getElementById("cardsLeft");
  const right = document.getElementById("cardsRight");
  if (!left || !right) return;

  cards = [];
  left.innerHTML = "";
  right.innerHTML = "";

  SIGNS.forEach((s, i) => {
    const c = document.createElement("div");
    c.className = "card";
    c.dataset.idx = String(i);
    c.style.backgroundImage = `url("${safeImg(s.img)}")`;
    (i < 6 ? left : right).appendChild(c);
    cards.push(c);
  });
}

// ==========================
// 🧠 RUOTA NO-REPEAT (stato condiviso)
// ==========================
function defaultSpinState(){
  const remaining = Array.from({length: SIGNS.length}, (_,i)=>i);
  return {
    remaining,
    picked: {},             // { "3": true, ... }
    lastWinner: -1,
    spinId: "",             // id unico per evitare doppia animazione
    updatedAt: Date.now()
  };
}

async function ensureSpinState(){
  const stRef = ref(db, SPIN_STATE_PATH);
  const snap = await get(stRef);
  if (!snap.exists()) {
    await set(stRef, defaultSpinState());
  }
}

function applyPickedToUI(pickedMap){
  const picked = pickedMap || {};
  cards.forEach((c, idx) => {
    c.classList.remove("winner");
    if (picked[String(idx)]) c.classList.add("chosen");
    else c.classList.remove("chosen");
  });
}

async function spinNoRepeat(){
  if (STATE !== "IDLE") return;

  const stRef = ref(db, SPIN_STATE_PATH);
  await runTransaction(stRef, (cur) => {
    if (!cur || !Array.isArray(cur.remaining)) cur = defaultSpinState();

    const remaining = cur.remaining.filter(n => Number.isInteger(n) && n >= 0 && n < SIGNS.length);
    const picked = cur.picked && typeof cur.picked === "object" ? cur.picked : {};

    // se finiti → reset immediato e riparte nuovo giro
    if (remaining.length === 0) {
      const fresh = defaultSpinState();
      return fresh;
    }

    // estrai a caso tra i rimanenti
    const rIndex = Math.floor(Math.random() * remaining.length);
    const winner = remaining[rIndex];

    // rimuovi
    remaining.splice(rIndex, 1);
    picked[String(winner)] = true;

    const spinId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    return {
      remaining,
      picked,
      lastWinner: winner,
      spinId,
      updatedAt: Date.now()
    };
  });
}

function listenSpinState(){
  onValue(ref(db, SPIN_STATE_PATH), (snap) => {
    if (!snap.exists()) return;

    const st = snap.val() || {};
    const picked = st.picked || {};
    applyPickedToUI(picked);

    // se nuovo spin → anima
    if (st.spinId && st.spinId !== lastSpinIdSeen && typeof st.lastWinner === "number" && st.lastWinner >= 0) {
      lastSpinIdSeen = st.spinId;
      playSpin(st.lastWinner);
    }

    // se completati tutti (remaining vuoto) → reset dopo un attimo (UNA SOLA VOLTA)
    const rem = Array.isArray(st.remaining) ? st.remaining : [];
    const allDone = rem.length === 0;
    if (allDone && !resetArmed) {
      resetArmed = true;
      setTimeout(async () => {
        // reset di fine giro (transaction safe)
        await runTransaction(ref(db, SPIN_STATE_PATH), (cur) => {
          if (!cur) return defaultSpinState();
          const r = Array.isArray(cur.remaining) ? cur.remaining : [];
          if (r.length !== 0) return cur; // qualcuno ha già resettato
          return defaultSpinState();
        });
        resetArmed = false;
      }, 1400);
    }
    if (!allDone) resetArmed = false;
  });
}

// ==========================
// 🚀 SPIN animation
// ==========================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function playSpin(w) {
  if (!cards.length) return;
  if (w < 0 || w >= SIGNS.length) return;

  STATE = "SPINNING";
  const wheel = document.getElementById("wheel");
  if (!wheel) return;

  wheel.className = "wheel boost";

  // lascia i "chosen", ma togli winner temporaneo
  cards.forEach(c => c.classList.remove("winner", "active", "doomed"));

  await sleep(550);
  wheel.className = "wheel command";

  let cur = 0;
  for (let i = 0; i < 36; i++) {
    cards.forEach(c => c.classList.remove("active"));
    cards[cur].classList.add("active");
    cur = (cur + 1) % cards.length;
    await sleep(24 + i * 4);
  }

  // evidenzia winner
  const win = cards[w];
  cards.forEach(c => c !== win && c.classList.add("doomed"));
  win.classList.add("winner");

  wheel.className = "wheel";
  STATE = "RESULT";

  lunaBot(`Il destino ha parlato: ${SIGNS[w].name}`);
  setTimeout(() => openModal(SIGNS[w]), 450);
}

// ==========================
// 🌙 idle
// ==========================
function idlePulse() {
  const wheel = document.getElementById("wheel");
  if (!wheel) return;
  setInterval(() => {
    if (STATE === "IDLE") wheel.classList.add("idle");
    else wheel.classList.remove("idle");
  }, 900);
}

// ==========================
// 🌌 MODALE OROSCOPO
// ==========================
function initModal() {
  const closeBtn = document.getElementById("closeModal");
  const back     = document.getElementById("modalBackdrop");
  if (closeBtn) closeBtn.onclick = closeModal;
  if (back) back.onclick = closeModal;
}

function openModal(data) {
  STATE = "MODAL";

  document.getElementById("modal")?.classList.remove("hidden");
  document.getElementById("modalBackdrop")?.classList.remove("hidden");
  document.getElementById("chatLuna")?.classList.add("disabled");

  document.getElementById("modalTitle").innerText = data.name;
  document.getElementById("modalLore").innerText  = data.lore;
  document.getElementById("modalHint").innerText  = data.hint;

  const v = (oroscopo2026 && oroscopo2026[data.name]) ? oroscopo2026[data.name] : null;
  document.getElementById("oroscopo2026").innerText = formatHoroscopeForOutput(data.name, v);

  const image = document.getElementById("fullscreenImage");
  if (image) {
    image.classList.remove("zoom");
    image.style.backgroundImage = `url("${safeImg(data.img)}")`;
    void image.offsetWidth;
    image.classList.add("zoom");
  }
}

function closeModal() {
  document.getElementById("modal")?.classList.add("hidden");
  document.getElementById("modalBackdrop")?.classList.add("hidden");
  document.getElementById("chatLuna")?.classList.remove("disabled");
  STATE = "IDLE";
}

// ==========================
// 🧾 POST OROSCOPO (opzionale)
// ==========================
async function postOroscopoToBacheca(signName) {
  if (!isAdmin) return alert("Solo ADMIN puo postare in bacheca.");
  if (!CURRENT_DAY) return alert("CURRENT_DAY non disponibile.");

  const day = CURRENT_DAY;
  const author = sanitizePlainASCII(window.LUNA.user || "Luna Vallyy");
  const oracle = "Oracolo di Pianeta Segreto";

  const v = (oroscopo2026 && oroscopo2026[signName]) ? oroscopo2026[signName] : null;
  const formatted = formatHoroscopeForOutput(signName, v);

  const link = getBaseLink() + `?day=${encodeURIComponent(day)}&sign=${encodeURIComponent(signName)}`;

  const discordText = sanitizePlainASCII(
    `Luna Vallyy - ${oracle}\nGiorno: ${day}\nPianetini: ${signName}\n\n${formatted}\n\nLink: ${link}`
  );

  const payload = {
    at: Date.now(),
    author,
    oracle,
    title: sanitizePlainASCII(`Luna Vallyy - ${oracle}`),
    subtitle: sanitizePlainASCII("Messaggio dal Pianeta Segreto. Pronto anche per Discord."),
    text: discordText,
    link,
    tag: "Pianeta Segreto",
    mode: "OROSCOPO",
    image: "",
    video: "",
    music: ""
  };

  await set(ref(db, BACHECA_LATEST), payload);
  lunaBot(`Bacheca aggiornata (OROSCOPO): ${signName}.`);
  alert("POST OK: bacheca aggiornata.");
}

// ==========================
// 🧾 POST NEUTRO (13° evento) — NON legato ai segni
// ==========================
async function postNeutralToBacheca() {
  if (!isAdmin) return alert("Solo ADMIN puo postare in bacheca.");

  const author = sanitizePlainASCII(window.LUNA.user || "Luna Vallyy");
  const oracle = "Oracolo di Pianeta Segreto";

  const titleEl = document.getElementById("spotTitle");
  const bodyEl  = document.getElementById("spotBody");
  const linkEl  = document.getElementById("spotLink");
  const imgEl   = document.getElementById("spotImage");
  const vidEl   = document.getElementById("spotVideo");
  const musEl   = document.getElementById("spotMusic");

  let title = sanitizePlainASCII(titleEl?.value || "");
  let body  = sanitizePlainASCII(bodyEl?.value || "");
  let link  = sanitizePlainASCII(linkEl?.value || "");
  let image = sanitizePlainASCII(imgEl?.value || "");
  let video = sanitizePlainASCII(vidEl?.value || "");
  let music = sanitizePlainASCII(musEl?.value || "");

  if (!title) title = "Luna Vallyy - Oracolo di Pianeta Segreto";
  if (!body)  body  = "Il nostro oracolo ci accompagna.\n\nQuando il cielo tace, ascolta il cuore.";
  if (!link)  link  = "https://alexcaos75.github.io/oroscopo/";

  // validate link
  if (link && !/^https?:\/\//i.test(link) && !/^[./]/.test(link)) link = "https://alexcaos75.github.io/oroscopo/";

  // validate image (url o immagini/)
  if (image && !/^https?:\/\//i.test(image) && !/^immagini\/[a-z0-9_\-./]+$/i.test(image)) image = "";

  // validate youtube IDs
  if (video && !isValidYouTubeId(video)) video = "";
  if (music && !isValidYouTubeId(music)) music = "";

  // testo discord pulito (descrittivo)
  const discordText = sanitizePlainASCII(
    `${title}\n${oracle}\n\n${body}\n\n` +
    (image ? `Immagine: ${image}\n` : "") +
    (video ? `Video: https://youtu.be/${video}\n` : "") +
    (music ? `Musica: https://youtu.be/${music}\n` : "") +
    `Link: ${link}`
  );

  const payload = {
    at: Date.now(),
    author,
    oracle,
    title,
    subtitle: sanitizePlainASCII("Messaggio neutro dal Pianeta Segreto. Pronto anche per Discord."),
    text: discordText,
    link,
    image: image || "",
    video: video || "",
    music: music || "",
    tag: "Pianeta Segreto",
    mode: "NEUTRO"
  };

  await set(ref(db, BACHECA_LATEST), payload);

  // reset campi
  if (titleEl) titleEl.value = "";
  if (bodyEl) bodyEl.value = "";
  if (linkEl) linkEl.value = "";
  if (imgEl) imgEl.value = "";
  if (vidEl) vidEl.value = "";
  if (musEl) musEl.value = "";

  lunaBot("Bacheca aggiornata: POST NEUTRO pubblicato.");
  alert("POST NEUTRO OK: bacheca aggiornata.");
}

// ==========================
// 📋 COPIA DISCORD (per segno selezionato)
// ==========================
async function copyDiscordMessage(signName) {
  if (!CURRENT_DAY) return alert("CURRENT_DAY non disponibile.");

  const day = CURRENT_DAY;
  const oracle = "Oracolo di Pianeta Segreto";

  const v = (oroscopo2026 && oroscopo2026[signName]) ? oroscopo2026[signName] : null;
  const formatted = formatHoroscopeForOutput(signName, v);
  const link = getBaseLink() + `?day=${encodeURIComponent(day)}&sign=${encodeURIComponent(signName)}`;

  const msg = sanitizePlainASCII(
    `Luna Vallyy - ${oracle}\nGiorno: ${day}\nPianetini: ${signName}\n\n${formatted}\n\nLink: ${link}`
  );

  try { await navigator.clipboard.writeText(msg); alert("Copiato (Discord pronto)."); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = msg; document.body.appendChild(ta); ta.select(); document.execCommand("copy");
    document.body.removeChild(ta); alert("Copiato (fallback).");
  }
}

// ==========================
// 📋 COPIA POST NEUTRO (discord-safe completo)
// ==========================
async function copyNeutralPostPack() {
  const titleEl = document.getElementById("spotTitle");
  const bodyEl  = document.getElementById("spotBody");
  const linkEl  = document.getElementById("spotLink");
  const imgEl   = document.getElementById("spotImage");
  const vidEl   = document.getElementById("spotVideo");
  const musEl   = document.getElementById("spotMusic");

  let title = sanitizePlainASCII(titleEl?.value || "");
  let body  = sanitizePlainASCII(bodyEl?.value || "");
  let link  = sanitizePlainASCII(linkEl?.value || "");
  let image = sanitizePlainASCII(imgEl?.value || "");
  let video = sanitizePlainASCII(vidEl?.value || "");
  let music = sanitizePlainASCII(musEl?.value || "");

  if (!title) title = "Luna Vallyy - Oracolo di Pianeta Segreto";
  if (!body)  body  = "Il nostro oracolo ci accompagna.\n\nQuando il cielo tace, ascolta il cuore.";
  if (!link)  link  = "https://alexcaos75.github.io/oroscopo/";

  const pack = sanitizePlainASCII(
    `${title}\nOracolo di Pianeta Segreto\n\n${body}\n\n` +
    (image ? `Immagine: ${image}\n` : "") +
    (video && isValidYouTubeId(video) ? `Video: https://youtu.be/${video}\n` : "") +
    (music && isValidYouTubeId(music) ? `Musica (ASCOLTA/STOP in bacheca): https://youtu.be/${music}\n` : "") +
    `Link: ${link}`
  );

  try { await navigator.clipboard.writeText(pack); alert("Copiato: POST completo pronto da pubblicare."); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = pack; document.body.appendChild(ta); ta.select(); document.execCommand("copy");
    document.body.removeChild(ta); alert("Copiato (fallback): POST completo pronto da pubblicare.");
  }
}

// ==========================
// 🛡️ ADMIN (editor + post + copia)
// ==========================
function initAdmin() {
  const select = document.getElementById("adminSelect");
  const text   = document.getElementById("adminText");
  const btn    = document.getElementById("adminBtn");
  const save   = document.getElementById("saveAdmin");
  const close  = document.getElementById("closeAdmin");

  const postBtn = document.getElementById("postBacheca"); // oroscopo
  const spotBtn = document.getElementById("postSpot");    // neutro
  const copyBtn = document.getElementById("copyDiscord");
  const copySpot= document.getElementById("copySpot");

  if (!select || !text || !btn || !save || !close) return;

  select.innerHTML = "";
  SIGNS.forEach(s => {
    const o = document.createElement("option");
    o.value = s.name;
    o.textContent = s.name;
    select.appendChild(o);
  });

  select.onchange = () => {
    const v = (oroscopo2026 && oroscopo2026[select.value]) ? oroscopo2026[select.value] : "";
    text.value = (typeof v === "string") ? v : (v?.testo || "");
  };

  save.onclick = async () => {
    if (!isAdmin) return alert("Prima attiva ADMIN.");
    if (!CURRENT_DAY) return alert("Giorno corrente non disponibile.");

    const existing = oroscopo2026?.[select.value];
    const clean = sanitizePlainASCII(text.value);

    if (existing && typeof existing === "object") {
      await update(ref(db, `${ORO_DAILY_BASE}/${CURRENT_DAY}/${select.value}`), { testo: clean });
    } else {
      await update(ref(db, `${ORO_DAILY_BASE}/${CURRENT_DAY}`), { [select.value]: clean });
    }
    await update(ref(db, `${ORO_DAILY_BASE}/${CURRENT_DAY}`), { updatedAt: Date.now() });
    lunaBot(`Oroscopo aggiornato: ${select.value}.`);
    alert("Salvato.");
  };

  if (postBtn) postBtn.onclick = async () => { if (!isAdmin) return alert("Prima attiva ADMIN."); await postOroscopoToBacheca(select.value); };
  if (spotBtn) spotBtn.onclick = async () => { if (!isAdmin) return alert("Prima attiva ADMIN."); await postNeutralToBacheca(); };
  if (copyBtn) copyBtn.onclick = async () => { await copyDiscordMessage(select.value); };
  if (copySpot) copySpot.onclick = async () => { await copyNeutralPostPack(); };

  btn.onclick = () => {
    if (!isAdmin) {
      const pass = prompt("Password ADMIN");
      if (pass !== ADMIN_PASSWORD) return;
      isAdmin = true;
      window.LUNA.isAdmin = true;
      lunaBot(`ADMIN attivo: ${window.LUNA.user || "Luna"}.`);
    }
    document.getElementById("adminModal")?.classList.remove("hidden");
    select.dispatchEvent(new Event("change"));
  };

  close.onclick = () => document.getElementById("adminModal")?.classList.add("hidden");
}

// ==========================
// 🤖 LUNA BOT (chat)
// ==========================
function lunaBot(text) {
  const now = Date.now();
  if (now - window.LUNA.lastBotMessage < 1200) return;
  window.LUNA.lastBotMessage = now;
  set(ref(db, `${CHAT_PATH}/${now}`), { user: "Luna", text: sanitizePlainASCII(text) });
}

// ==========================
// 🎯 CLICK SCEGLI
// ==========================
function initSpinButton(){
  const spinBtn = document.getElementById("spin");
  if (!spinBtn) return;
  spinBtn.onclick = async () => {
    if (STATE !== "IDLE") return;
    await spinNoRepeat();
  };
}

// ==========================
// ✅ INIT
// ==========================
window.addEventListener("load", init);

async function init() {
  if (DEBUG) {
    console.log("[APP] loaded");
    console.log("[APP] db =", firebaseConfig.databaseURL);
    console.log("### LUNA SCRIPT MARKER 2025-12-28 VINCENTE CAPOLAVORO ###");
  }

  playIntro();

  await ensureSpinState().catch(()=>{});

  ensureDailyOroscopoUpToDate().catch(()=>{});
  scheduleMidnightResync();

  initOroscopoRealtime();
  initUI();
  initCards();
  preloadImages();
  initSpinButton();
  initModal();
  initAdmin();
  listenSpinState();
  idlePulse();

  window.LUNA.migrateTodayToRichFormat = migrateTodayToRichFormat;
  window.LUNA.ensureDailyOroscopoUpToDate = ensureDailyOroscopoUpToDate;
  window.LUNA.postNeutralToBacheca = postNeutralToBacheca;
}
