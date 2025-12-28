// ==========================
// 🔥 RUOTA LUNARE 2026 — SCRIPT CAPOLAVORO (FULL)
// ✅ daily listener con off()
// ✅ fallback giorno locale
// ✅ admin salva sul daily corrente
// ✅ compatibile oroscopiCurrent: stringa OR {date, updatedAt}
// ✅ AUTO-UPDATE GIORNALIERO DIRETTO SU FIREBASE
// ✅ anti-spam: una volta al giorno + cooldown
// ✅ resync dopo mezzanotte
// ✅ supporta OROSCOPO RICCO: stringa OR oggetto {testo, amore, lavoro, fortuna, consiglio}
// ✅ MIGRAZIONE: window.LUNA.migrateTodayToRichFormat()
// ✅ POST: Bacheca Pianeta Segreto + Copia Discord (testo pulito ASCII)
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
// 🌐 GLOBAL / DEBUG
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
const GAME_PATH        = "ruota-lunare/global-spin";
const CHAT_PATH        = "ruota-lunare/chat";
const ORO_CURRENT_PATH = "ruota-lunare/oroscopiCurrent";      // fallback
const ORO_CURRENT_STR  = "ruota-lunare/oroscopiCurrentDate";  // primario
const ORO_DAILY_BASE   = "ruota-lunare/oroscopiDaily";

// ✅ BACHECA PIANETA SEGRETO
const BACHECA_LATEST   = "ruota-lunare/bacheca/latest";

// ==========================
// 🧠 STATO
// ==========================
let STATE = "BOOT";
let isAdmin = false;
let ignoreFirstSpin = true;
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

  // normalizza e rimuove accenti
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {}

  // smart quotes -> normali
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // rimuove tutto non-ASCII stampabile (teniamo newline/tab)
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");

  // pulizia
  s = s.replace(/\?{2,}/g, "?");
  s = s.replace(/"{2,}/g, '"');
  s = s.replace(/'{2,}/g, "'");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}

// ==========================
// 🌟 DEFAULT OROSCOPO RICCO (ASCII safe)
// ==========================
function buildDefaultDailyPayload() {
  const base = {
    "Ariete": {
      testo: "Energia alta e voglia di ripartire. Scegli una sfida e affrontala senza esitazioni.",
      amore: "Diretto e magnetico: chiarisci subito cosa vuoi.",
      lavoro: "Taglia il superfluo e agisci: oggi conta la rapidita.",
      fortuna: "Alta se segui listinto.",
      consiglio: "Una decisione netta vale piu di mille dubbi."
    },
    "Toro": {
      testo: "Stabilita e riflessioni profonde. Costruisci con calma: un passo solido oggi vale doppio domani.",
      amore: "Gesti concreti: poche parole ma vere.",
      lavoro: "Ritmo costante: chi semina raccoglie.",
      fortuna: "Media-alta se non forzi i tempi.",
      consiglio: "Scegli una priorita e proteggila."
    },
    "Gemelli": {
      testo: "Comunicazione al centro: una notizia, un invito o un contatto sblocca la giornata.",
      amore: "Leggerezza intelligente: flirt e sorrisi.",
      lavoro: "Ottimo per riunioni, messaggi, accordi.",
      fortuna: "Alta nelle relazioni.",
      consiglio: "Parla chiaro, ma ascolta di piu."
    },
    "Cancro": {
      testo: "Emozioni intense: oggi lintuizione e una bussola precisa.",
      amore: "Dolcezza e protezione: evita le punzecchiature.",
      lavoro: "Meglio procedure e continuita che cambi improvvisi.",
      fortuna: "Buona se resti centrato.",
      consiglio: "Non difenderti: esprimiti."
    },
    "Leone": {
      testo: "Brilla senza paura: lattenzione e su di te, usala bene.",
      amore: "Passione e orgoglio: chiedi, non pretendere.",
      lavoro: "Leadership naturale: guida e ispira.",
      fortuna: "Alta quando osi.",
      consiglio: "Fatti vedere, ma con eleganza."
    },
    "Vergine": {
      testo: "Ordine e precisione premiano: risolvi piccoli dettagli e vinci sul lungo periodo.",
      amore: "Dimostra con fatti, non con ansia.",
      lavoro: "Perfetto per revisioni, conti, organizzazione.",
      fortuna: "Media, cresce con disciplina.",
      consiglio: "Un problema alla volta."
    },
    "Bilancia": {
      testo: "Equilibrio tra cuore e mente: oggi scegli cio che ti rende leggero.",
      amore: "Armonia e dialogo: evita mezze verita.",
      lavoro: "Mediazione vincente: ottimo per accordi.",
      fortuna: "Buona nelle scelte eleganti.",
      consiglio: "Non rimandare la decisione."
    },
    "Scorpione": {
      testo: "Trasformazioni in arrivo: una verita emerge, e ti rende piu forte.",
      amore: "Intensita: evita gelosie inutili.",
      lavoro: "Strategia: muoviti in silenzio e colpisci preciso.",
      fortuna: "Alta se resti lucido.",
      consiglio: "Taglia cio che ti drena energia."
    },
    "Sagittario": {
      testo: "Desiderio di avventura: espandi confini, anche solo con unidea nuova.",
      amore: "Spontaneo: sorprendi chi ami.",
      lavoro: "Visione ampia: pensa in grande, poi pianifica.",
      fortuna: "Alta se ti muovi.",
      consiglio: "Non temere di cambiare rotta."
    },
    "Capricorno": {
      testo: "Determinazione e risultati: oggi costruisci una prova concreta del tuo valore.",
      amore: "Stabilita: prometti poco, mantieni tutto.",
      lavoro: "Focus e responsabilita: ottimo per chiudere pratiche.",
      fortuna: "Media ma sicura.",
      consiglio: "Fai cio che conta, non cio che appare."
    },
    "Acquario": {
      testo: "Idee fuori dagli schemi: una soluzione creativa ti fa saltare di livello.",
      amore: "Originale: chiedi spazio e dai spazio.",
      lavoro: "Innovazione: prova una strada diversa.",
      fortuna: "Alta nelle intuizioni improvvise.",
      consiglio: "Non spiegare troppo: fai."
    },
    "Pesci": {
      testo: "Intuizioni forti: sogni e segnali parlano chiaro, se li ascolti.",
      amore: "Empatia: abbraccia invece di analizzare.",
      lavoro: "Creativita: ispira e crea connessioni.",
      fortuna: "Buona se segui il cuore.",
      consiglio: "Proteggi la tua sensibilita."
    }
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
// 🔗 LINK BASE (index.html nella stessa cartella)
// ==========================
function getBaseLink() {
  const { origin, pathname } = window.location;
  const baseDir = pathname.replace(/\/[^/]*$/, "/");
  return origin + baseDir + "index.html";
}

// ==========================
// 🧩 AUTO-UPDATE DAILY
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

  // lock globale (anti-spam multi-client)
  const lockRef = ref(db, `ruota-lunare/meta/dailyInitLock/${today}`);
  await runTransaction(lockRef, (cur) => {
    if (cur && cur.locked) return;
    return { locked: true, at: Date.now() };
  });

  const dailyRefToday = ref(db, `${ORO_DAILY_BASE}/${today}`);
  const snapDaily = await get(dailyRefToday);
  const def = buildDefaultDailyPayload();

  if (!snapDaily.exists()) {
    await set(dailyRefToday, def);
    if (DEBUG) console.log("[ORO] created missing daily for", today);
  } else {
    // patch: non sovrascrive admin, completa solo mancanti
    const cur = snapDaily.val() || {};
    const patch = {};

    for (const sign of Object.keys(def)) {
      if (sign === "updatedAt") continue;

      if (cur[sign] == null) {
        patch[sign] = def[sign];
        continue;
      }

      if (typeof cur[sign] === "object" && cur[sign] !== null) {
        const src = cur[sign];
        const dst = def[sign];
        for (const k of ["testo","amore","lavoro","fortuna","consiglio"]) {
          if (src[k] == null || src[k] === "") patch[`${sign}/${k}`] = dst[k];
        }
      }
      // se e' stringa: la lasciamo (compat) e non la convertiamo automaticamente
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await update(dailyRefToday, patch);
      if (DEBUG) console.log("[ORO] daily patched:", Object.keys(patch).length);
    } else {
      if (DEBUG) console.log("[ORO] daily exists for", today, "-> ok");
    }
  }

  // current day pointers
  await set(ref(db, ORO_CURRENT_STR), today);
  await set(ref(db, ORO_CURRENT_PATH), { date: today, updatedAt: Date.now() });

  localStorage.setItem(key, "1");
  if (DEBUG) console.log("[ORO] daily init done, current set to", today);
}

// ==========================
// 🌙 RESYNC DOPO MEZZANOTTE
// ==========================
function scheduleMidnightResync() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0); // 00:00:05
  const ms = next.getTime() - now.getTime();

  setTimeout(() => {
    if (DEBUG) console.log("[ORO] midnight resync...");
    ensureDailyOroscopoUpToDate().catch(e => console.warn("[ORO] midnight ensure error:", e));
    scheduleMidnightResync();
  }, ms);
}

// ==========================
// 🧿 MIGRAZIONE (1 click da console)
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

    if (v == null) {
      patch[sign] = def[sign];
      converted++;
      continue;
    }

    if (typeof v === "string") {
      const d = def[sign];
      patch[sign] = {
        testo: v, // mantiene il testo esistente
        amore: d.amore,
        lavoro: d.lavoro,
        fortuna: d.fortuna,
        consiglio: d.consiglio
      };
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
  if (DEBUG) console.log("[ORO] migrateTodayToRichFormat:", { day, converted });
}

// ==========================
// 🧾 POST BACHECA + COPIA DISCORD
// ==========================
async function postOroscopoToBacheca(signName) {
  if (!isAdmin) return alert("Solo ADMIN puo postare in bacheca.");
  if (!CURRENT_DAY) return alert("CURRENT_DAY non disponibile.");

  const day = CURRENT_DAY;

  const author = sanitizePlainASCII(window.LUNA.user || "Luna Vallyy");
  const oracle = "Oracolo di PianetaSegreto";

  const v = (oroscopo2026 && oroscopo2026[signName]) ? oroscopo2026[signName] : null;
  const formatted = formatHoroscopeForOutput(signName, v);

  const link = getBaseLink() + `?day=${encodeURIComponent(day)}&sign=${encodeURIComponent(signName)}`;

  // SOLO TESTO + LINK (discord safe)
  const discordText = sanitizePlainASCII(
    `Luna Vallyy - ${oracle}\n` +
    `Giorno: ${day}\n` +
    `Pianetini: ${signName}\n\n` +
    `${formatted}\n\n` +
    `Link: ${link}`
  );

  const payload = {
    at: Date.now(),
    day,
    sign: sanitizePlainASCII(signName),
    author,
    oracle,
    text: discordText,
    link
  };

  await set(ref(db, BACHECA_LATEST), payload);

  lunaBot(`Bacheca aggiornata: ${signName} (${day}).`);
  alert("POST OK: bacheca aggiornata.");
}

async function copyDiscordMessage(signName) {
  if (!CURRENT_DAY) return alert("CURRENT_DAY non disponibile.");

  const day = CURRENT_DAY;
  const oracle = "Oracolo di PianetaSegreto";

  const v = (oroscopo2026 && oroscopo2026[signName]) ? oroscopo2026[signName] : null;
  const formatted = formatHoroscopeForOutput(signName, v);

  const link = getBaseLink() + `?day=${encodeURIComponent(day)}&sign=${encodeURIComponent(signName)}`;

  const msg = sanitizePlainASCII(
    `Luna Vallyy - ${oracle}\n` +
    `Giorno: ${day}\n` +
    `Pianetini: ${signName}\n\n` +
    `${formatted}\n\n` +
    `Link: ${link}`
  );

  try {
    await navigator.clipboard.writeText(msg);
    alert("Copiato negli appunti (Discord pronto).");
  } catch {
    // fallback (alcuni browser/hosting bloccano clipboard API)
    const ta = document.createElement("textarea");
    ta.value = msg;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copiato negli appunti (fallback).");
  }

  if (DEBUG) console.log("[POST] discord msg:", msg);
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
// 🔮 OROSCOPO REALTIME
// ==========================
function initOroscopoRealtime() {
  onValue(
    ref(db, ORO_CURRENT_STR),
    snap => {
      const dayFromDb = snap.val();
      const day = (dayFromDb && typeof dayFromDb === "string") ? dayFromDb : localDayKey();
      if (DEBUG) console.log("[ORO] currentStr raw =", dayFromDb, "=> day =", day);
      attachDaily(day);
    },
    err => {
      console.error("[ORO] currentStr read error:", err?.code, err?.message, err);
      listenCurrentFallback();
      attachDaily(localDayKey());
    }
  );
}

function listenCurrentFallback() {
  onValue(
    ref(db, ORO_CURRENT_PATH),
    snap => {
      const raw = snap.val();
      const parsed = parseCurrentDayFromDb(raw);
      const day = parsed || localDayKey();
      if (DEBUG) console.log("[ORO] current(raw fallback) =", raw, "=> day =", day);
      attachDaily(day);
    },
    err => console.error("[ORO] current fallback read error:", err?.code, err?.message, err)
  );
}

function attachDaily(day) {
  if (!day || typeof day !== "string") return;
  if (CURRENT_DAY === day) return;

  CURRENT_DAY = day;
  window.LUNA.currentDay = CURRENT_DAY;
  window.CURRENT_DAY = CURRENT_DAY;

  if (dailyRef) off(dailyRef);

  dailyRef = ref(db, `${ORO_DAILY_BASE}/${day}`);
  onValue(
    dailyRef,
    s2 => {
      oroscopo2026 = s2.val() || {};
      window.LUNA.oroscopo = oroscopo2026;
      window.OROSCOPO_2026 = oroscopo2026;
      if (DEBUG) console.log("[ORO] day =", CURRENT_DAY, "keys =", Object.keys(oroscopo2026 || {}));
    },
    err => console.error("[ORO] daily read error:", err?.code, err?.message, err)
  );
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
  loginInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin(loginInput.value.trim());
  });

  const saved = sessionStorage.getItem("lunaUser");
  if (saved) setTimeout(() => doLogin(saved), 3200);

  function doLogin(name) {
    if (!name || name.length < 2) return;
    if (STATE !== "BOOT" && window.LUNA.user === name) return;

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
// 🖼️ IMMAGINI
// ==========================
function safeImg(img) {
  return `immagini/${img || "p01.png"}`;
}

function preloadImages() {
  SIGNS.forEach(s => {
    const img = new Image();
    img.src = safeImg(s.img);
  });
}

// ==========================
// 🎴 CARDS
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
    c.style.backgroundImage = `url("${safeImg(s.img)}")`;
    (i < 6 ? left : right).appendChild(c);
    cards.push(c);
  });
}

// ==========================
// 🌪️ SPIN multiplayer
// ==========================
function initSpin() {
  const spinBtn = document.getElementById("spin");
  if (!spinBtn) return;

  spinBtn.onclick = () => {
    if (STATE !== "IDLE") return;
    const winner = Math.floor(Math.random() * SIGNS.length);
    set(ref(db, GAME_PATH), { winner, time: Date.now() });
  };
}

function listenSpin() {
  onValue(ref(db, GAME_PATH), snap => {
    if (!snap.exists()) return;

    if (ignoreFirstSpin) {
      ignoreFirstSpin = false;
      return;
    }

    const v = snap.val();
    if (!v || typeof v.winner !== "number") return;
    playSpin(v.winner);
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
  cards.forEach(c => (c.className = "card"));
  await sleep(650);

  wheel.className = "wheel command";

  let cur = 0;
  for (let i = 0; i < 42; i++) {
    cards.forEach(c => c.classList.remove("active"));
    cards[cur].classList.add("active");
    cur = (cur + 1) % cards.length;
    await sleep(28 + i * 4);
  }

  const win = cards[w];
  cards.forEach(c => c !== win && c.classList.add("doomed"));
  win.classList.add("winner");

  wheel.className = "wheel";
  STATE = "RESULT";

  lunaBot(`Il destino ha parlato: ${SIGNS[w].name}`);
  setTimeout(() => openModal(SIGNS[w]), 550);
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
// 🌌 MODALE
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
  const out = formatHoroscopeForOutput(data.name, v);

  document.getElementById("oroscopo2026").innerText = out;

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
// 🛡️ ADMIN + POST
// ==========================
function initAdmin() {
  const select = document.getElementById("adminSelect");
  const text   = document.getElementById("adminText");
  const btn    = document.getElementById("adminBtn");
  const save   = document.getElementById("saveAdmin");
  const close  = document.getElementById("closeAdmin");

  // nuovi tasti
  const postBtn = document.getElementById("postBacheca");
  const copyBtn = document.getElementById("copyDiscord");

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

    if (existing && typeof existing === "object") {
      await update(ref(db, `${ORO_DAILY_BASE}/${CURRENT_DAY}/${select.value}`), { testo: sanitizePlainASCII(text.value) });
    } else {
      await update(ref(db, `${ORO_DAILY_BASE}/${CURRENT_DAY}`), { [select.value]: sanitizePlainASCII(text.value) });
    }

    await update(ref(db, `${ORO_DAILY_BASE}/${CURRENT_DAY}`), { updatedAt: Date.now() });
    lunaBot(`Oroscopo aggiornato: ${select.value}.`);
    alert("Salvato.");
  };

  if (postBtn) {
    postBtn.onclick = async () => {
      if (!isAdmin) return alert("Prima attiva ADMIN.");
      await postOroscopoToBacheca(select.value);
    };
  }

  if (copyBtn) {
    copyBtn.onclick = async () => {
      await copyDiscordMessage(select.value);
    };
  }

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
// 🤖 LUNA BOT
// ==========================
function lunaBot(text) {
  const now = Date.now();
  if (now - window.LUNA.lastBotMessage < 2200) return;
  window.LUNA.lastBotMessage = now;

  set(ref(db, `${CHAT_PATH}/${now}`), { user: "Luna", text: sanitizePlainASCII(text) });
}

// ==========================
// ✅ INIT
// ==========================
window.addEventListener("load", init);

function init() {
  if (DEBUG) {
    console.log("[APP] loaded");
    console.log("[APP] db =", firebaseConfig.databaseURL);
    console.log("### LUNA SCRIPT MARKER 2025-12-28 CAPOLAVORO ###");
  }

  playIntro();

  ensureDailyOroscopoUpToDate().catch(e => console.warn("[ORO] ensureDailyOroscopoUpToDate error:", e));
  scheduleMidnightResync();

  initOroscopoRealtime();
  initUI();
  initCards();
  preloadImages();
  initSpin();
  initModal();
  initAdmin();
  listenSpin();
  idlePulse();

  // export comodi per console
  window.LUNA.migrateTodayToRichFormat = migrateTodayToRichFormat;
  window.LUNA.ensureDailyOroscopoUpToDate = ensureDailyOroscopoUpToDate;
}
