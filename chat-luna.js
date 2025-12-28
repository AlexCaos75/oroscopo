//
// ==========================
// 💬 CHAT LUNA — REALTIME (DRAGGABLE + ANTI-SBORDO + MOBILE SAFE)
// ✅ compatibile con script.js (window.LUNA.user / window.LUNA.isAdmin / window.LUNA.db)
// ✅ join per-utente (se cambi nickname, manda join nuovo)
// ✅ API debug console: window.LUNA.sendChat(), window.LUNA.resetChat(), window.LUNA.purgeJoinFlag()
// ✅ anti-spam (utente) + anti-burst (render)
// ==========================
//
import {
  ref,
  set,
  onValue,
  query,
  limitToLast,
  remove
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

// ==========================
// ⚙️ CONFIG
// ==========================
const CHAT_PATH     = "ruota-lunare/chat";
const MAX_MESSAGES  = 160;

// anti-spam invio utente
const SPAM_DELAY    = 900;

// anti-burst render (se arrivano tante patch insieme)
const RENDER_DEBOUNCE_MS = 50;

const EDGE_PAD = 10;          // margine minimo dai bordi
const DRAG_THRESHOLD = 6;     // px: oltre questo è drag (non toggle)

// ==========================
// 🧠 STATE
// ==========================
let lastSend = 0;
let chatDisabled = false;

let dragging = false;
let startX = 0, startY = 0;
let startLeft = 0, startTop = 0;
let moved = 0;

let renderTimer = null;
let pendingSnap = null;

// join
let joinedSent = false;
let joinedForUser = null;

// ==========================
// 🌙 INIT
// ==========================
window.addEventListener("load", initChatLuna);

function initChatLuna() {
  const chat     = document.getElementById("chatLuna");
  const chatBox  = document.getElementById("chatMessages");
  const input    = document.getElementById("chatInput");
  const sendBtn  = document.getElementById("chatSend");
  const resetBtn = document.getElementById("chatReset");
  const header   = document.getElementById("chatHeader");
  const toggleEl = document.getElementById("chatToggle");

  if (!chat || !chatBox || !input || !sendBtn || !resetBtn || !header || !toggleEl) return;
  if (!window.LUNA?.db) return;

  // ✅ evita scroll/zoom durante drag su mobile
  header.style.touchAction = "none";

  restoreState(chat, toggleEl);

  initSend(input, sendBtn);
  initReset(resetBtn);
  listen(chatBox);
  watchModal(chat);

  initDragAndToggle(chat, header, toggleEl);

  // clamp iniziale
  clampChatToViewport(chat);

  // clamp su resize / rotate
  window.addEventListener("resize", () => clampChatToViewport(chat));
  window.addEventListener("orientationchange", () => setTimeout(() => clampChatToViewport(chat), 120));

  // reset solo admin (UI)
  setInterval(() => {
    resetBtn.disabled = !Boolean(window.LUNA?.isAdmin);
  }, 600);

  // join solo dopo login reale (e per-utente)
  waitForUserThenJoin();

  // ✅ API debug comode
  exposeDebugAPI();
}

// ==========================
// 📡 LISTEN
// ==========================
function listen(chatBox) {
  const q = query(ref(window.LUNA.db, CHAT_PATH), limitToLast(MAX_MESSAGES));

  onValue(q, snap => {
    // debounce render
    pendingSnap = snap;
    if (renderTimer) return;

    renderTimer = setTimeout(() => {
      renderTimer = null;
      const s = pendingSnap;
      pendingSnap = null;
      if (!s) return;
      renderMessages(chatBox, s);
    }, RENDER_DEBOUNCE_MS);
  });
}

function renderMessages(chatBox, snap) {
  const stick =
    chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 20;

  chatBox.innerHTML = "";

  let count = 0;
  snap.forEach(m => {
    const v = m.val() || {};
    chatBox.appendChild(render(v.user, v.text));
    count++;
  });

  if (count === 0) {
    const empty = document.createElement("div");
    empty.className = "chat-msg luna";
    empty.innerHTML = `<span class="chat-user">🌙 Luna:</span> <span class="chat-text">La chat è vuota...</span>`;
    chatBox.appendChild(empty);
  }

  if (stick) chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================
// ✉️ SEND
// ==========================
function initSend(input, sendBtn) {
  sendBtn.onclick = send;

  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  function send() {
    if (chatDisabled) return;

    const text = input.value.trim();
    if (!text) return;

    const now = Date.now();
    if (now - lastSend < SPAM_DELAY) return;
    lastSend = now;

    set(ref(window.LUNA.db, `${CHAT_PATH}/${now}`), {
      user: window.LUNA.user || "Anonimo",
      text
    });

    input.value = "";
  }
}

// ==========================
// ♻️ RESET (solo admin)
// ==========================
function initReset(btn) {
  // IMPORTANTISSIMO: non far partire drag/toggle quando clicchi reset
  btn.addEventListener("pointerdown", e => e.stopPropagation());
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!Boolean(window.LUNA?.isAdmin)) return;
    const ok = confirm("Vuoi davvero resettare la chat pubblica?");
    if (!ok) return;

    await remove(ref(window.LUNA.db, CHAT_PATH));
    sendSystemMessage("🌀 La chat è stata purificata dall'Oracolo.");
  });
}

// ==========================
// 🧱 RENDER
// ==========================
function render(user, text) {
  const d = document.createElement("div");
  d.className = "chat-msg";

  if (user?.includes("🌙")) d.classList.add("luna");
  if (user && user === window.LUNA.user) d.classList.add("me");

  d.innerHTML = `
    <span class="chat-user">${esc(user || "Anonimo")}:</span>
    <span class="chat-text">${esc(text || "")}</span>
  `;
  return d;
}

// ==========================
// 🔽 TOGGLE + 🖐️ DRAG (ANTI-SBORDO)
// ==========================
function initDragAndToggle(chat, header, toggleEl) {
  header.addEventListener("pointerdown", e => {
    if (chatDisabled) return;

    // se clicchi su bottoni/azioni nell’header, NON è drag/toggle
    if (e.target.closest(".chat-actions")) return;

    header.setPointerCapture?.(e.pointerId);

    dragging = true;
    moved = 0;

    const r = chat.getBoundingClientRect();
    startLeft = r.left;
    startTop  = r.top;

    startX = e.clientX;
    startY = e.clientY;

    chat.style.position = "fixed";
    chat.style.right = "auto";
    chat.style.bottom = "auto";
    chat.style.left = `${startLeft}px`;
    chat.style.top  = `${startTop}px`;

    chat.classList.add("dragging");
  });

  window.addEventListener("pointermove", e => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    moved = Math.max(moved, Math.abs(dx), Math.abs(dy));

    chat.style.left = `${startLeft + dx}px`;
    chat.style.top  = `${startTop + dy}px`;

    clampChatToViewport(chat);
  });

  window.addEventListener("pointerup", () => {
    if (!dragging) return;

    dragging = false;
    chat.classList.remove("dragging");

    // se NON hai davvero trascinato → toggle collapse
    if (moved < DRAG_THRESHOLD) {
      toggleCollapse(chat, toggleEl);
      clampChatToViewport(chat);
    }
  });

  // toggle cliccando sul simbolo (+/—)
  toggleEl.addEventListener("pointerdown", e => e.stopPropagation());
  toggleEl.addEventListener("click", e => {
    e.stopPropagation();
    if (chatDisabled) return;
    toggleCollapse(chat, toggleEl);
    clampChatToViewport(chat);
  });
}

function toggleCollapse(chat, toggleEl) {
  chat.classList.toggle("collapsed");
  const closed = chat.classList.contains("collapsed");
  toggleEl.textContent = closed ? "+" : "—";
  localStorage.setItem("chatCollapsed", closed ? "1" : "0");
}

// clamp dentro viewport
function clampChatToViewport(chat) {
  const r = chat.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const hasLeft = chat.style.left && chat.style.left !== "";
  const hasTop  = chat.style.top && chat.style.top !== "";

  // se non è mai stato trascinato, lascialo bottom/right (CSS)
  if (!hasLeft || !hasTop) return;

  let left = parseFloat(chat.style.left) || r.left;
  let top  = parseFloat(chat.style.top)  || r.top;

  const maxLeft = Math.max(EDGE_PAD, vw - r.width  - EDGE_PAD);
  const maxTop  = Math.max(EDGE_PAD, vh - r.height - EDGE_PAD);

  left = Math.min(Math.max(EDGE_PAD, left), maxLeft);
  top  = Math.min(Math.max(EDGE_PAD, top),  maxTop);

  chat.style.left = `${left}px`;
  chat.style.top  = `${top}px`;
}

// ripristino collapse
function restoreState(chat, toggleEl) {
  const closed = localStorage.getItem("chatCollapsed") === "1";
  if (closed) chat.classList.add("collapsed");
  toggleEl.textContent = closed ? "+" : "—";
}

// ==========================
// 🔮 MODAL SYNC (disabilita chat quando il modale oroscopo è aperto)
// ==========================
function watchModal(chat) {
  const modal = document.getElementById("modal");
  if (!modal) return;

  new MutationObserver(() => {
    chatDisabled = !modal.classList.contains("hidden");
    chat.classList.toggle("disabled", chatDisabled);
  }).observe(modal, { attributes: true, attributeFilter: ["class"] });
}

// ==========================
// 🌙 JOIN (DOPO LOGIN REALE) — per-utente
// ==========================
function waitForUserThenJoin() {
  const timer = setInterval(() => {
    const u = (window.LUNA?.user || "").trim();

    if (u.length >= 2) {
      clearInterval(timer);

      // join per-utente: se cambi nickname manda join nuovo
      const key = `luna-joined:${u}`;
      const already = sessionStorage.getItem(key) === "1";

      joinedForUser = u;
      if (!already && !joinedSent) {
        joinedSent = true;
        sessionStorage.setItem(key, "1");
        sendSystemMessage(`✨ ${u} è entrato nel cerchio`);
      }

      return;
    }
  }, 250);
}

// ==========================
// 🌙 SYSTEM
// ==========================
function sendSystemMessage(text) {
  if (!window.LUNA?.db) return;

  set(ref(window.LUNA.db, `${CHAT_PATH}/${Date.now()}`), {
    user: "🌙 Luna",
    text
  });
}

// ==========================
// 🧰 DEBUG API (console)
// ==========================
function exposeDebugAPI() {
  // invia un messaggio a mano
  window.LUNA.sendChat = (text) => {
    const t = String(text || "").trim();
    if (!t) return;
    set(ref(window.LUNA.db, `${CHAT_PATH}/${Date.now()}`), {
      user: window.LUNA.user || "Anonimo",
      text: t
    });
  };

  // reset chat (solo admin)
  window.LUNA.resetChat = async () => {
    if (!Boolean(window.LUNA?.isAdmin)) return false;
    await remove(ref(window.LUNA.db, CHAT_PATH));
    sendSystemMessage("🌀 La chat è stata purificata dall'Oracolo.");
    return true;
  };

  // se vuoi rifare il join (debug)
  window.LUNA.purgeJoinFlag = () => {
    const u = (window.LUNA?.user || "").trim();
    if (!u) return;
    sessionStorage.removeItem(`luna-joined:${u}`);
    joinedSent = false;
  };
}

// ==========================
// 🛡️ UTIL
// ==========================
function esc(str = "") {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[m]);
}
