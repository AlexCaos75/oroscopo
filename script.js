// ==========================
// 🔥 RUOTA LUNARE 2026 — CAPOLAVORO VINCENTE (FULL)
// ✅ 12 segni: random SENZA ripetizioni fino a completamento
// ✅ segni scelti restano evidenti -> reset round automatico
// ✅ multiplayer sync con Firebase runTransaction
// ✅ daily listener con off()
// ✅ fallback giorno locale
// ✅ auto daily init + lock globale (1 volta al giorno)
// ✅ Oroscopo ricco compatibile
// ✅ POST bacheca: OR0SCOPO + POST NEUTRO (indipendente)
// ✅ COPIA POST: genera HTML incollabile (img/gif + video o musica invisibile)
// ✅ COPIA POST ROBUSTA: NO <script>, NO onclick (per siti che bloccano JS inline)
// ✅ Musica nel post: usa data-attribute (serve handler nella bacheca)
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
const ORO_CURRENT_PATH = "ruota-lunare/oroscopiCurrent";
const ORO_CURRENT_STR  = "ruota-lunare/oroscopiCurrentDate";
const ORO_DAILY_BASE   = "ruota-lunare/oroscopiDaily";
const BACHECA_LATEST   = "ruota-lunare/bacheca/latest";
const SPIN_STATE_PATH  = "ruota-lunare/spinState";

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

// ==========================
// 🔗 Helpers: Link / YouTube
// ==========================
function normalizeLink(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[./]/.test(s)) return s;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/?].*)?$/i.test(s)) return "https://" + s;
  return "";
}

function extractYouTubeId(input) {
  const s = String(input || "").trim();
  if (!s) return "";

  // ID "puro"
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(s)) return s;

  // youtu.be/ID
  let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  // youtube.com/watch?v=ID
  m = s.match(/[?&]v=([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  // youtube.com/embed/ID
  m = s.match(/\/embed\/([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  // youtube.com/shorts/ID
  m = s.match(/\/shorts\/([a-zA-Z0-9_-]{6,20})/i);
  if (m) return m[1];

  return "";
}

function safeImg(img) {
  return `immagini/${img || "p01.png"}`;
}

// ==========================
// 🌟 DEFAULT OROSCOPO RICCO
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
// 🧩 FORMAT OUTPUT
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

  if (localStorage.getItem(key) === "1") return;

  const lockRef = ref(db, `ruota-lunare/meta/dailyInitLock/${today}`);
  const tx = await runTransaction(lockRef, (cur) => {
    if (cur && cur.locked) return cur;
    return { locked: true, at: Date.now() };
  });

  const gotLock = tx?.committed === true && tx?.snapshot?.val()?.locked === true;

  if (!gotLock) {
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
    }

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await update(dailyRefToday, patch);
    }
  }

  await set(ref(db, ORO_CURRENT_STR), today);
  await set(ref(db, ORO_CURRENT_PATH), { date: today, updatedAt: Date.now() });

  localStorage.setItem(key, "1");
}

// ==========================
// 🌙 RESYNC DOPO MEZZANOTTE
// ==========================
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

    if (v == null) {
      patch[sign] = def[sign];
      converted++;
      continue;
    }

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
  onValue(
    ref(db, ORO_CURRENT_STR),
    snap => {
      const dayFromDb = snap.val();
      const day = (dayFromDb && typeof dayFromDb === "string") ? dayFromDb : localDayKey();
      attachDaily(day);
    },
    _ => {
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
      attachDaily(day);
    }
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

  onValue(dailyRef, s2 => {
    oroscopo2026 = s2.val() || {};
    window.LUNA.oroscopo = oroscopo2026;
    window.OROSCOPO_2026 = oroscopo2026;
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
// 🖼️ CARDS
// ==========================
function preloadImages() {
  SIGNS.forEach(s => {
    const img = new Image();
    img.src = safeImg(s.img);
  });
}

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
    c.dataset.idx = String(i);
    (i < 6 ? left : right).appendChild(c);
    cards.push(c);
  });
}

// ==========================
// 🌪️ RUOTA — senza ripetizioni (TRANSACTION)
// ==========================
function defaultSpinState() {
  return {
    round: 1,
    remaining: Array.from({length: SIGNS.length}, (_, i) => i),
    picked: [],
    lastWinner: null,
    lastAt: 0
  };
}

function setRoundInfo(state) {
  const el = document.getElementById("roundInfo");
  if (!el) return;
  const r = state?.round ?? 1;
  const done = (state?.picked?.length ?? 0);
  el.textContent = `ROUND ${r} — scelti ${done}/12`;
}

function markPicked(state) {
  const picked = new Set(state?.picked || []);
  cards.forEach((c, idx) => {
    c.classList.toggle("picked", picked.has(idx));
  });
}

async function ensureSpinStateExists() {
  const rSpin = ref(db, SPIN_STATE_PATH);
  const snap = await get(rSpin);
  if (!snap.exists()) {
    await set(rSpin, defaultSpinState());
  }
}

function initSpinButton() {
  const spinBtn = document.getElementById("spin");
  if (!spinBtn) return;

  spinBtn.onclick = async () => {
    if (STATE !== "IDLE") return;

    const rSpin = ref(db, SPIN_STATE_PATH);

    await runTransaction(rSpin, (cur) => {
      const st = cur && typeof cur === "object" ? cur : defaultSpinState();
      const remaining = Array.isArray(st.remaining) ? st.remaining.slice() : [];

      if (remaining.length === 0) {
        st.round = (st.round || 1) + 1;
        st.remaining = Array.from({length: SIGNS.length}, (_, i) => i);
        st.picked = [];
      }

      const rem = st.remaining.slice();
      const pickIndex = Math.floor(Math.random() * rem.length);
      const winner = rem[pickIndex];

      rem.splice(pickIndex, 1);
      st.remaining = rem;
      st.picked = Array.isArray(st.picked) ? st.picked.concat([winner]) : [winner];
      st.lastWinner = winner;
      st.lastAt = Date.now();

      return st;
    });
  };
}

function listenSpinState() {
  const rSpin = ref(db, SPIN_STATE_PATH);

  onValue(rSpin, (snap) => {
    if (!snap.exists()) return;
    const st = snap.val();
    setRoundInfo(st);
    markPicked(st);

    if (ignoreFirstSpin) {
      ignoreFirstSpin = false;
      return;
    }

    const w = st?.lastWinner;
    if (typeof w !== "number") return;
    playSpin(w);
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
  cards.forEach(c => c.classList.remove("winner","doomed","active"));
  await sleep(520);

  wheel.className = "wheel command";

  let cur = 0;
  for (let i = 0; i < 42; i++) {
    cards.forEach(c => c.classList.remove("active"));
    cards[cur].classList.add("active");
    cur = (cur + 1) % cards.length;
    await sleep(24 + i * 4);
  }

  const win = cards[w];
  cards.forEach(c => c !== win && c.classList.add("doomed"));
  win.classList.add("winner");

  wheel.className = "wheel";
  STATE = "RESULT";

  lunaBot(`Il destino ha parlato: ${SIGNS[w].name}`);
  setTimeout(() => openModal(SIGNS[w]), 520);
}

function idlePulse() {
  const wheel = document.getElementById("wheel");
  if (!wheel) return;

  setInterval(() => {
    if (STATE === "IDLE") wheel.classList.add("idle");
    else wheel.classList.remove("idle");
  }, 900);
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
// 🧾 BACHECA — POST OROSCOPO
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
    `Luna Vallyy - ${oracle}\n` +
    `Giorno: ${day}\n` +
    `Pianetini: ${signName}\n\n` +
    `${formatted}\n\n` +
    `Link: ${link}`
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
    mode: "OROSCOPO"
  };

  await set(ref(db, BACHECA_LATEST), payload);
  lunaBot(`Bacheca aggiornata (OROSCOPO): ${signName}.`);
  alert("POST OK: bacheca aggiornata.");
}

// ==========================
// 🧾 POST NEUTRO — lettura campi
// ==========================
function readNeutralFields(){
  const title = sanitizePlainASCII(document.getElementById("pnTitle")?.value || "");
  const body  = sanitizePlainASCII(document.getElementById("pnBody")?.value || "");
  const link  = normalizeLink(document.getElementById("pnLink")?.value || "");
  const image = String(document.getElementById("pnImage")?.value || "").trim();

  const videoId = extractYouTubeId(document.getElementById("pnVideo")?.value || "");
  const musicId = extractYouTubeId(document.getElementById("pnMusic")?.value || "");

  const mode =
    document.querySelector('input[name="pnVideoMode"]:checked')?.value || "visible";

  return { title, body, link, image, videoId, musicId, videoMode: mode };
}

function clearNeutralFields(){
  ["pnTitle","pnBody","pnLink","pnImage","pnVideo","pnMusic"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const radio = document.querySelector('input[name="pnVideoMode"][value="visible"]');
  if (radio) radio.checked = true;
}

// ==========================
// 🧾 POST NEUTRO — pubblica su Firebase
// ==========================
async function postNeutralToBacheca() {
  if (!isAdmin) return alert("Solo ADMIN puo postare in bacheca.");

  const author = sanitizePlainASCII(window.LUNA.user || "Luna Vallyy");
  const oracle = "Oracolo di Pianeta Segreto";

  const { title, body, link, image, videoId, musicId, videoMode } = readNeutralFields();

  const finalTitle = title || "Luna Vallyy - Oracolo di Pianeta Segreto";
  const finalBody  = body  || "Il nostro oracolo ci accompagna.\n\nQuando il cielo tace, ascolta il cuore.";
  const finalLink  = link  || "https://alexcaos75.github.io/oroscopo/";

  const discordText = sanitizePlainASCII(
    `${finalTitle}\n${oracle}\n\n${finalBody}\n\nLink: ${finalLink}`
  );

  const payload = {
    at: Date.now(),
    author,
    oracle,
    title: sanitizePlainASCII(finalTitle),
    subtitle: sanitizePlainASCII("Post neutro dal Pianeta Segreto. Pronto anche per Discord."),
    text: discordText,
    link: finalLink,
    image: image || "",
    video: videoMode === "visible" ? (videoId || "") : "",
    music: videoMode === "hidden" ? ((musicId || videoId) || "") : "",
    videoMode,
    tag: "Pianeta Segreto",
    mode: "NEUTRO"
  };

  await set(ref(db, BACHECA_LATEST), payload);
  clearNeutralFields();

  lunaBot("Bacheca aggiornata: POST NEUTRO pubblicato.");
  alert("POST NEUTRO OK: bacheca aggiornata.");
}

// ==========================
// 🧾 COPIA POST — HTML incollabile (ROBUSTO PER BACHECHE)
// ✅ NO <script>
// ✅ NO onclick
// ✅ Musica controllata via data-attribute (handler nella bacheca)
// ✅ GIF/IMG riempie 100% del box (cover)
// ==========================
function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function buildPublishablePostHTML({ title, body, link, image, videoId, musicId, videoMode }) {
  const t = title || "Luna Vallyy - Oracolo di Pianeta Segreto";
  const b = body  || "Il nostro oracolo ci accompagna.\n\nQuando il cielo tace, ascolta il cuore.";
  const l = link  || "https://alexcaos75.github.io/oroscopo/";

  const img = (image && String(image).trim()) ? String(image).trim() : "";
  const vid = (videoMode === "visible") ? (videoId || "") : "";
  const mus = (videoMode === "hidden") ? (musicId || videoId || "") : "";

  const escT = escapeHtml(t);
  const escB = escapeHtml(b);
  const escL = escapeHtml(l);
  const escImg = escapeHtml(img);
  const escVid = escapeHtml(vid);
  const escMus = escapeHtml(mus);

  return `
<div style="
  max-width:920px;
  margin:18px auto;
  border-radius:26px;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.14);
  background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.06));
  box-shadow:0 26px 90px rgba(0,0,0,.55);
">
  <div style="
    padding:18px 18px 14px;
    background:
      radial-gradient(900px 420px at 10% 0%, rgba(180,80,255,.25), transparent 60%),
      radial-gradient(900px 420px at 95% 20%, rgba(40,230,255,.20), transparent 60%),
      radial-gradient(900px 420px at 50% 110%, rgba(255,80,210,.14), transparent 60%),
      rgba(0,0,0,.22);
  ">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="
        width:46px;height:46px;border-radius:16px;
        background:linear-gradient(135deg, rgba(180,80,255,.90), rgba(40,230,255,.40));
        border:1px solid rgba(255,255,255,.18);
        display:grid;place-items:center;
        font-weight:900;letter-spacing:.6px;
        color:white;
        box-shadow:0 18px 60px rgba(110,120,255,.22);
      ">PS</div>
      <div style="min-width:0;">
        <div style="font-weight:950;font-size:18px;letter-spacing:.2px;color:rgba(255,255,255,.95);">
          ${escT}
        </div>
        <div style="margin-top:6px;font-size:13px;opacity:.84;color:rgba(255,255,255,.86);line-height:1.3;">
          Il Pianeta Segreto sussurra: ascolta con calma e scegli con eleganza.
        </div>
      </div>
    </div>

    <div style="
      margin-top:14px;
      white-space:pre-wrap;
      line-height:1.55;
      font-family:ui-monospace, Menlo, Consolas, monospace;
      font-size:13.6px;
      color:rgba(255,255,255,.92);
      background:rgba(0,0,0,.22);
      border:1px solid rgba(255,255,255,.14);
      border-radius:18px;
      padding:14px;
    ">${escB}</div>

    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <a href="${escL}" target="_blank" rel="noopener"
        style="
          display:inline-flex;align-items:center;gap:10px;
          padding:12px 16px;border-radius:999px;
          text-decoration:none;
          font-weight:950;font-size:13px;letter-spacing:.35px;
          color:white;
          background:linear-gradient(135deg, rgba(180,80,255,.74), rgba(40,230,255,.30));
          border:1px solid rgba(255,255,255,.18);
          box-shadow:0 18px 56px rgba(80,120,255,.22);
        ">
        APRI ORACOLO
      </a>

      ${mus ? `
      <span data-psmusic data-yt="${escMus}" style="display:inline-flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button type="button" data-ps-play
          style="
            padding:12px 16px;border-radius:999px;
            font-weight:950;font-size:13px;letter-spacing:.35px;
            color:white;cursor:pointer;
            background:linear-gradient(135deg, rgba(255,120,220,.40), rgba(120,120,255,.38));
            border:1px solid rgba(255,255,255,.18);
            box-shadow:0 18px 56px rgba(0,0,0,.35);
          "
        >ASCOLTA</button>

        <button type="button" data-ps-stop
          style="
            padding:12px 16px;border-radius:999px;
            font-weight:950;font-size:13px;letter-spacing:.35px;
            color:white;cursor:pointer;
            background:rgba(255,255,255,.10);
            border:1px solid rgba(255,255,255,.18);
          "
        >STOP</button>
      </span>
      ` : ``}
    </div>
  </div>

  ${img ? `
  <div style="background:rgba(0,0,0,.35); border-top:1px solid rgba(255,255,255,.10);">
    <div style="
      width:100%;
      height:70vh;
      max-height:760px;
      background:#000;
      overflow:hidden;
    ">
      <img src="${escImg}" alt="Pianeta Segreto"
        style="
          width:100%;
          height:100%;
          display:block;
          object-fit:cover;
        " />
    </div>
  </div>
  ` : ``}

  ${vid ? `
  <div style="padding:16px;background:rgba(0,0,0,.25);border-top:1px solid rgba(255,255,255,.10);">
    <iframe
      src="https://www.youtube.com/embed/${escVid}?rel=0&modestbranding=1&playsinline=1"
      style="width:100%;aspect-ratio:16/9;border-radius:18px;border:1px solid rgba(255,255,255,.14);"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen></iframe>
  </div>
  ` : ``}

</div>
`.trim();
}

async function copyPostHTML(){
  const { title, body, link, image, videoId, musicId, videoMode } = readNeutralFields();
  const html = buildPublishablePostHTML({ title, body, link, image, videoId, musicId, videoMode });

  try{
    await navigator.clipboard.writeText(html);
    alert("COPIA POST OK: HTML copiato (incollalo in bacheca).");
  }catch{
    const ta = document.createElement("textarea");
    ta.value = html;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("COPIA POST OK (fallback).");
  }
}

// ==========================
// 📋 COPIA DISCORD
// ==========================
async function copyDiscordMessage(signName) {
  if (!CURRENT_DAY) return alert("CURRENT_DAY non disponibile.");

  const day = CURRENT_DAY;
  const oracle = "Oracolo di Pianeta Segreto";
  const v = (oroscopo2026 && oroscopo2026[signName]) ? oroscopo2026[signName] : null;
  const formatted = formatHoroscopeForOutput(signName, v);

  const link = getBaseLink() + `?day=${encodeURIComponent(day)}&sign=${encodeURIComponent(signName)}`;
  const msg = sanitizePlainASCII(`Luna Vallyy - ${oracle}\nGiorno: ${day}\nPianetini: ${signName}\n\n${formatted}\n\nLink: ${link}`);

  try {
    await navigator.clipboard.writeText(msg);
    alert("Copiato negli appunti (Discord pronto).");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = msg;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copiato negli appunti (fallback).");
  }
}

// ==========================
// 🛡️ ADMIN
// ==========================
function initAdmin() {
  const select = document.getElementById("adminSelect");
  const text   = document.getElementById("adminText");
  const btn    = document.getElementById("adminBtn");
  const save   = document.getElementById("saveAdmin");
  const close  = document.getElementById("closeAdmin");

  const postBtn   = document.getElementById("postBacheca");
  const postNeut  = document.getElementById("postNeutral");
  const copyBtn   = document.getElementById("copyDiscord");
  const copyPost  = document.getElementById("copyPost");

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

  if (postBtn)  postBtn.onclick  = async () => { if (!isAdmin) return alert("Prima attiva ADMIN."); await postOroscopoToBacheca(select.value); };
  if (postNeut) postNeut.onclick = async () => { if (!isAdmin) return alert("Prima attiva ADMIN."); await postNeutralToBacheca(); };
  if (copyBtn)  copyBtn.onclick  = async () => { await copyDiscordMessage(select.value); };
  if (copyPost) copyPost.onclick = async () => { await copyPostHTML(); };

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

async function init() {
  if (DEBUG) console.log("### LUNA SCRIPT CAPOLAVORO ###");

  playIntro();

  ensureDailyOroscopoUpToDate().catch(()=>{});
  scheduleMidnightResync();

  initOroscopoRealtime();
  initUI();

  initCards();
  preloadImages();

  await ensureSpinStateExists();
  initSpinButton();
  listenSpinState();

  initModal();
  initAdmin();
  idlePulse();

  // exports utili
  window.LUNA.migrateTodayToRichFormat = migrateTodayToRichFormat;
  window.LUNA.ensureDailyOroscopoUpToDate = ensureDailyOroscopoUpToDate;

  // export utili per UI
  window.LUNA.copyPostHTML = copyPostHTML;
  window.LUNA.buildPublishablePostHTML = buildPublishablePostHTML;
}
