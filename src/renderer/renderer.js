"use strict";

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const modelEl = document.getElementById("model");
const frameEl = document.getElementById("frame");
const placeholderEl = document.getElementById("placeholder");
const statusEl = document.getElementById("statusbar");

// Refs to the in-flight assistant turn, updated by the stream/activity events.
let activeBubble = null;
let activeActivity = null;
let streamed = false;

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function scrollToEnd() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  sendEl.disabled = true;
  addMessage("user", text);

  // Assistant bubble fills in via chat:stream; activity line shows friendly
  // progress (思考中… / 更新投影片:…) and is removed when the turn ends.
  activeBubble = addMessage("agent", "");
  activeActivity = addMessage("agent thinking", "正在製作投影片…");
  streamed = false;

  try {
    const reply = await window.api.sendMessage(text);
    if (!streamed) activeBubble.textContent = reply?.text || "完成了,看右側預覽 👉";
  } catch (err) {
    activeBubble.textContent = `出錯了:${err.message}`;
  } finally {
    if (activeActivity) activeActivity.remove();
    if (activeBubble && !activeBubble.textContent) activeBubble.remove();
    activeBubble = null;
    activeActivity = null;
    sendEl.disabled = false;
    inputEl.focus();
    scrollToEnd();
  }
}

sendEl.addEventListener("click", send);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

// ---- shell wiring ----
window.api.onSlideReady((url) => {
  frameEl.src = url;
  frameEl.style.display = "block";
  placeholderEl.style.display = "none";
});

window.api.onStatus((text) => {
  statusEl.textContent = text;
});

// Streaming assistant text — replace the bubble contents as it grows.
window.api.onStream(({ text }) => {
  if (!activeBubble) return;
  streamed = true;
  activeBubble.textContent = text;
  scrollToEnd();
});

// Friendly progress — update the transient activity line under the bubble.
window.api.onActivity(({ text }) => {
  if (activeActivity) {
    activeActivity.textContent = text;
    scrollToEnd();
  }
});

// ---- model dropdown ----
async function loadModels() {
  try {
    const { current, groups } = await window.api.listModels();
    modelEl.innerHTML = "";
    for (const g of groups) {
      const og = document.createElement("optgroup");
      og.label = g.name;
      for (const m of g.models) {
        const id = `${g.id}/${m}`;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = m;
        if (id === current) opt.selected = true;
        og.appendChild(opt);
      }
      modelEl.appendChild(og);
    }
  } catch (err) {
    statusEl.textContent = `無法載入模型清單:${err.message}`;
  }
}

modelEl.addEventListener("change", () => {
  window.api.setModel(modelEl.value);
});

loadModels();
inputEl.focus();
