"use strict";

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const frameEl = document.getElementById("frame");
const placeholderEl = document.getElementById("placeholder");
const statusEl = document.getElementById("statusbar");

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

async function send() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  sendEl.disabled = true;
  addMessage("user", text);
  const pending = addMessage("agent thinking", "正在製作投影片…");

  try {
    const reply = await window.api.sendMessage(text);
    pending.className = "msg agent";
    pending.textContent = reply.text;
  } catch (err) {
    pending.className = "msg agent";
    pending.textContent = `出錯了:${err.message}`;
  } finally {
    sendEl.disabled = false;
    inputEl.focus();
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

// Best-effort live progress: surface session events as a transient status line.
window.api.onEvent((evt) => {
  if (evt.type) statusEl.textContent = `agent: ${evt.type}`;
});

inputEl.focus();
