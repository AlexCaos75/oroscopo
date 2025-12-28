// ==========================
// 🔥 RUOTA LUNARE 2026 — CAPOLAVORO VINCENTE
// ✅ 12 segni sempre presenti (daily)
// ✅ ruota NON ripete: ciclo 0/12 → 12/12 → reset automatico
// ✅ "SCELTO" elegante sulle carte uscite
// ✅ POST OROSCOPO (opzionale) + POST NEUTRO (indipendente)
// ✅ COPIA POST: genera HTML pronto da incollare (con ASCOLTA/STOP musica invisibile)
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
window.LUNA.currentDay = null;
window.LUNA.oroscopo = null;

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
// 📡 PATH
// ==========================
const GAME_PATH        = "ruota-lunare/global-spin";
const ORO_CURRENT_PATH = "ruota-lunare/oroscopiCurrent";
const ORO_CURRENT_STR  = "ruota-lunare/oroscopiCurrentDate";
const ORO_DAILY_BASE   = "ruota-lunare/oroscopiDaily";

const BACHECA_LATEST   = "ruota-lunare/bacheca/latest";

// ✅ stato round (no repeat)
const ROUND_PATH       = "ruota-lunare/roundState";

// ==========================
// 🧼 ASCII SAFE
// ==========================
function sanitizePlainASCII(input) {
  let s = String(input ?? "");
  try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch {}
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
  s = s.replace(/\?{2,}/g, "?");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

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

function safeImg(img) { return `immagini/${img || "p01.png"}`; }

// ==========================
// 🧩 DAILY INIT (12 segni garantiti)
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
// 🔮 OROSCOPO REALTIME
// ==========================
function initOroscopoRealtime() {
  onValue(ref(db, ORO_CURRENT_STR), snap => {
    const dayFromDb = snap.val();
    const day = (dayFromDb && typeof dayFromDb === "string") ? dayFromDb : localDayKey();
    attachDaily(day);
  }, () => {
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

  if (dailyRef) off(dailyRef);

  dailyRef = ref(db, `${ORO_DAILY_BASE}/${day}`);
  onValue(dailyRef, s2 => {
    oroscopo2026 = s2.val() || {};
    window.LUNA.oroscopo = oroscopo2026;
  });
}

// ==========================
// ✅ ROUND STATE (NO REPEAT + RESET 12/12)
// ==========================
function defaultRoundState(){
  return { used: Array(SIGNS.length).fill(false), pickedCount: 0, updatedAt: Date.now() };
}
function safeUsed(v){
  if (Array.isArray(v) && v.length === SIGNS.length) return v.map(Boolean);
  return Array(SIGNS.length).fill(false);
}
function countUsed(arr){ return arr.reduce((a,b)=>a+(b?1:0),0); }

let roundState = defaultRoundState();

function renderPickStatus(){
  const el = document.getElementById("pickStatus");
  if (!el) return;
  el.textContent = `scelti ${roundState.pickedCount}/${SIGNS.length}`;
}

function markCardsUsed(){
  if (!cards || !cards.length) return;
  roundState.used.forEach((u,i)=>{
    if (!cards[i]) return;
    cards[i].classList.toggle("used", !!u);
  });
}

function listenRoundState(){
  onValue(ref(db, ROUND_PATH), (snap)=>{
    if (!snap.exists()){
      roundState = defaultRoundState();
      renderPickStatus();
      markCardsUsed();
      return;
    }
    const v = snap.val() || {};
    const used = safeUsed(v.used);
    roundState = {
      used,
      pickedCount: Number(v.pickedCount || countUsed(used)),
      updatedAt: Number(v.updatedAt || Date.now())
    };
    renderPickStatus();
    markCardsUsed();
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

  loginBtn.addEventListener("click", () => doLogin(loginInput.value.trim()));
  loginInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(loginInput.value.trim()); });

  const saved = sessionStorage.getItem("lunaUser");
  if (saved) setTimeout(() => doLogin(saved), 600);

  function doLogin(name) {
    if (!name || name.length < 2) return;

    window.LUNA.user = name;
    sessionStorage.setItem("lunaUser", name);

    loginModal.classList.add("hidden");
    app.classList.remove("hidden");
    controls.classList.remove("hidden");

    STATE = "IDLE";
  }
}

// ==========================
// 🎴 CARDS
// ==========================
function preloadImages() { SIGNS.forEach(s => { const img = new Image(); img.src = safeImg(s.img); }); }

function initCards() {
  const left  = document.getElementById("cardsLeft");
  const right = document.getElementById("cardsRight");

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
// 🌪️ SPIN multiplayer (winner deciso qui)
// ==========================
function initSpin() {
  const spinBtn = document.getElementById("spin");
  if (!spinBtn) return;

  spinBtn.onclick = async () => {
    if (STATE !== "IDLE") return;

    await runTransaction(ref(db, ROUND_PATH), (cur) => {
      const st = cur ? {
        used: safeUsed(cur.used),
        pickedCount: Number(cur.pickedCount || countUsed(safeUsed(cur.used))),
        updatedAt: Number(cur.updatedAt || Date.now())
      } : defaultRoundState();

      // ✅ se 12/12 -> reset totale 0/12
      if (st.pickedCount >= SIGNS.length) {
        st.used = Array(SIGNS.length).fill(false);
        st.pickedCount = 0;
      }

      const available = [];
      for (let i = 0; i < SIGNS.length; i++) if (!st.used[i]) available.push(i);

      const winner = available[Math.floor(Math.random() * available.length)];

      st.used[winner] = true;
      st.pickedCount = countUsed(st.used);
      st.updatedAt = Date.now();

      // trigger animazione su tutti
      set(ref(db, GAME_PATH), { winner, time: Date.now() });

      return st;
    });
  };
}

function listenSpin() {
  onValue(ref(db, GAME_PATH), snap => {
    if (!snap.exists()) return;
    if (ignoreFirstSpin) { ignoreFirstSpin = false; return; }
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

  wheel.className = "wheel boost";
  cards.forEach(c => (c.className = "card" + (c.classList.contains("used") ? " used" : "")));
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

  setTimeout(() => openModal(SIGNS[w]), 400);
}

function idlePulse() {
  const wheel = document.getElementById("wheel");
  setInterval(() => {
    if (STATE === "IDLE") wheel.classList.add("idle");
    else wheel.classList.remove("idle");
  }, 900);
}

// ==========================
// 🌌 MODALE OROSCOPO
// ==========================
function initModal() {
  document.getElementById("closeModal")?.addEventListener("click", closeModal);
  document.getElementById("modalBackdrop")?.addEventListener("click", closeModal);
}

function openModal(data) {
  STATE = "MODAL";
  document.getElementById("modal")?.classList.remove("hidden");
  document.getElementById("modalBackdrop")?.classList.remove("hidden");

  document.getElementById("modalTitle").innerText = data.name;
  document.getElementById("modalLore").innerText  = data.lore;
  document.getElementById("modalHint").innerText  = data.hint;

  const v = (oroscopo2026 && oroscopo2026[data.name]) ? oroscopo2026[data.name] : null;
  document.getElementById("oroscopo2026").innerText = formatHoroscopeForOutput(data.name, v);

  const image = document.getElementById("fullscreenImage");
  if (image) image.style.backgroundImage = `url("${safeImg(data.img)}")`;
}

function closeModal() {
  document.getElementById("modal")?.classList.add("hidden");
  document.getElementById("modalBackdrop")?.classList.add("hidden");
  STATE = "IDLE";
}

// ==========================
// 🧠 YouTube helpers
// ==========================
function extractYouTubeId(input){
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^[a-zA-Z0-9_-]{6,20}$/.test(s)) return s;

  // youtu.be/ID
  let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,20})/);
  if (m) return m[1];

  // youtube.com/watch?v=ID
  m = s.match(/[?&]v=([a-zA-Z0-9_-]{6,20})/);
  if (m) return m[1];

  // youtube.com/embed/ID
  m = s.match(/embed\/([a-zA-Z0-9_-]{6,20})/);
  if (m) return m[1];

  return "";
}

function isHttpUrl(s){ return /^https?:\/\//i.test(String(s||"").trim()); }

// ==========================
// 🧾 POST: OROSCOPO (opzionale)
// ==========================
function getBaseLink() {
  const { origin, pathname } = window.location;
  const baseDir = pathname.replace(/\/[^/]*$/, "/");
  return origin + baseDir + "index.html";
}

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
    author, oracle,
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
  alert("POST OROSCOPO OK: bacheca aggiornata.");
}

// ==========================
// 🧾 POST: NEUTRO (indipendente)
// ==========================
function readNeutralForm(){
  const title = sanitizePlainASCII(document.getElementById("neutralTitle")?.value || "");
  const body  = sanitizePlainASCII(document.getElementById("neutralBody")?.value  || "");
  const link  = sanitizePlainASCII(document.getElementById("neutralLink")?.value  || "");
  const image = String(document.getElementById("neutralImage")?.value || "").trim();
  const videoRaw = String(document.getElementById("neutralVideo")?.value || "").trim();
  const musicRaw = String(document.getElementById("neutralMusic")?.value || "").trim();
  const modeSel = String(document.getElementById("videoMode")?.value || "visible");

  const video = extractYouTubeId(videoRaw);
  const music = extractYouTubeId(musicRaw);

  let safeLink = link;
  if (!safeLink) safeLink = "https://alexcaos75.github.io/oroscopo/";
  if (safeLink && !isHttpUrl(safeLink) && !/^[./]/.test(safeLink)) safeLink = "https://alexcaos75.github.io/oroscopo/";

  // immagine: accetta http/https oppure immagini/...
  let safeImage = "";
  if (image && (isHttpUrl(image) || /^immagini\/[a-z0-9_\-./]+$/i.test(image))) safeImage = image;

  return {
    title: title || "Pianeta Segreto",
    body: body || "Il nostro oracolo ci accompagna.\n\nQuando il cielo tace, ascolta il cuore.",
    link: safeLink,
    image: safeImage,
    video: (modeSel === "visible") ? video : "",
    music
  };
}

function clearNeutralForm(){
  ["neutralTitle","neutralBody","neutralLink","neutralImage","neutralVideo","neutralMusic"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

async function postNeutroToBacheca(){
  if (!isAdmin) return alert("Solo ADMIN puo postare in bacheca.");

  const author = sanitizePlainASCII(window.LUNA.user || "Luna Vallyy");
  const oracle = "Oracolo di Pianeta Segreto";

  const f = readNeutralForm();

  const discordText = sanitizePlainASCII(
    `${f.title}\n${oracle}\n\n${f.body}\n\nLink: ${f.link}`
  );

  const payload = {
    at: Date.now(),
    author, oracle,
    title: sanitizePlainASCII(f.title),
    subtitle: sanitizePlainASCII("Messaggio neutro dal Pianeta Segreto. Pronto anche per Discord."),
    text: discordText,
    link: f.link,
    image: f.image || "",
    video: f.video || "",
    music: f.music || "",
    tag: "Pianeta Segreto",
    mode: "NEUTRO"
  };

  await set(ref(db, BACHECA_LATEST), payload);
  clearNeutralForm();
  alert("POST NEUTRO OK: bacheca aggiornata.");
}

// ==========================
// 📋 COPIA DISCORD (solo oroscopo selezionato)
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

  await copyToClipboard(msg);
  alert("Copiato (Discord pronto).");
}

// ==========================
// 🧩 COPIA POST (HTML pronto da incollare)
// ==========================
function buildEmbedsHTML({title, body, link, image, video, music}){
  // Video visibile
  const videoHTML = video ? `
    <div style="margin-top:14px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 42px rgba(0,0,0,.35);">
      <iframe
        src="https://www.youtube.com/embed/${video}?rel=0"
        style="width:100%;aspect-ratio:16/9;border:0;display:block;"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe>
    </div>` : "";

  // Musica invisibile con tasti (autoplay con audio richiede click utente: per questo c’è ASCOLTA)
  const musicHTML = music ? `
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
      <button onclick="(function(){
        var w=document.getElementById('ps-music-wrap');
        if(!w) return;
        if(w.dataset.on==='1') return;
        w.dataset.on='1';
        w.innerHTML='<iframe src=\\'https://www.youtube.com/embed/${music}?autoplay=1&loop=1&playlist=${music}&rel=0\\' allow=\\'autoplay; encrypted-media\\' style=\\'width:1px;height:1px;opacity:0;position:absolute;left:-9999px;top:-9999px;border:0\\'></iframe>';
      })()"
      style="padding:12px 16px;border-radius:999px;border:0;cursor:pointer;font-weight:900;letter-spacing:.6px;">
        ASCOLTA
      </button>

      <button onclick="(function(){
        var w=document.getElementById('ps-music-wrap');
        if(!w) return;
        w.dataset.on='0';
        w.innerHTML='';
      })()"
      style="padding:12px 16px;border-radius:999px;border:0;cursor:pointer;font-weight:900;letter-spacing:.6px;">
        STOP
      </button>
      <div id="ps-music-wrap" data-on="0"></div>
    </div>` : "";

  const imgHTML = image ? `
    <div style="margin-top:14px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 42px rgba(0,0,0,.35);">
      <img src="${image}" alt="Pianeta Segreto" style="display:block;width:100%;height:auto;">
    </div>` : "";

  const safeBody = body.replace(/</g,"&lt;").replace(/>/g,"&gt;");

  return `
<div style="
  max-width:980px;margin:0 auto;
  padding:18px;
  color:#fff;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
  background: radial-gradient(900px 600px at 20% 10%, rgba(170,80,255,.22), transparent 55%),
              radial-gradient(900px 600px at 80% 20%, rgba(40,220,255,.16), transparent 55%),
              linear-gradient(180deg,#090a24,#050612);
  border-radius:22px;
  border:1px solid rgba(255,255,255,.14);
  box-shadow:0 24px 90px rgba(0,0,0,.55);
">
  <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
    <div style="font-weight:1000;letter-spacing:.3px;font-size:20px;">${title}</div>
    <a href="${link}" target="_blank" rel="noopener"
      style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;
      padding:12px 16px;border-radius:999px;
      color:#0b1020;font-weight:1000;letter-spacing:.6px;
      background:linear-gradient(135deg, rgba(180,80,255,.95), rgba(40,230,255,.75));
      box-shadow:0 18px 55px rgba(120,120,255,.25);">
      APRI LINK
    </a>
  </div>

  <div style="margin-top:12px;opacity:.82;line-height:1.5;white-space:pre-wrap;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
${safeBody}
  </div>

  ${imgHTML}
  ${videoHTML}
  ${musicHTML}
</div>`.trim();
}

async function copyPostHTML(){
  const f = readNeutralForm();
  const html = buildEmbedsHTML({
    title: f.title || "Pianeta Segreto",
    body: f.body || "",
    link: f.link || "https://alexcaos75.github.io/oroscopo/",
    image: f.image || "",
    video: f.video || "",
    music: f.music || ""
  });

  await copyToClipboard(html);
  alert("COPIA POST OK: codice HTML copiato (incolla in bacheca / post).");
}

// ==========================
// 📋 Clipboard helper
// ==========================
async function copyToClipboard(text){
  try{
    await navigator.clipboard.writeText(text);
  }catch{
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// ==========================
// 🛡️ ADMIN UI
// ==========================
function initAdmin() {
  const select = document.getElementById("adminSelect");
  const text   = document.getElementById("adminText");
  const btn    = document.getElementById("adminBtn");
  const save   = document.getElementById("saveAdmin");
  const close  = document.getElementById("closeAdmin");

  const postOro = document.getElementById("postOroscopo");
  const postNeu = document.getElementById("postNeutro");
  const copyDis = document.getElementById("copyDiscord");
  const copyPos = document.getElementById("copyPost");

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

    alert("Salvato.");
  };

  postOro.onclick = async () => {
    if (!isAdmin) return alert("Prima attiva ADMIN.");
    await postOroscopoToBacheca(select.value);
  };

  postNeu.onclick = async () => {
    if (!isAdmin) return alert("Prima attiva ADMIN.");
    await postNeutroToBacheca();
  };

  copyDis.onclick = async () => {
    await copyDiscordMessage(select.value);
  };

  copyPos.onclick = async () => {
    await copyPostHTML();
  };

  btn.onclick = () => {
    if (!isAdmin) {
      const pass = prompt("Password ADMIN");
      if (pass !== ADMIN_PASSWORD) return;
      isAdmin = true;
      window.LUNA.isAdmin = true;
    }
    document.getElementById("adminModal")?.classList.remove("hidden");
    select.dispatchEvent(new Event("change"));
  };

  close.onclick = () => document.getElementById("adminModal")?.classList.add("hidden");
}

// ==========================
// ✅ INIT
// ==========================
window.addEventListener("load", init);

function init() {
  if (DEBUG) console.log("### RUOTA LUNARE 2026 — WIN ###");

  // intro
  const curtain = document.getElementById("cosmicCurtain");
  setTimeout(()=>curtain?.classList.add("fadeout"), 1200);
  setTimeout(()=>curtain && (curtain.style.display="none"), 2000);

  ensureDailyOroscopoUpToDate().catch(()=>{});
  scheduleMidnightResync();

  initOroscopoRealtime();

  initUI();
  initCards();
  preloadImages();

  listenRoundState();     // ✅ mostra scelti 0/12 e “SCELTO”
  initSpin();             // ✅ no repeat + reset 12/12
  listenSpin();

  initModal();
  initAdmin();
  idlePulse();

  // export debug
  window.LUNA.postNeutroToBacheca = postNeutroToBacheca;
  window.LUNA.copyPostHTML = copyPostHTML;
}
