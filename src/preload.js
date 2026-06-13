"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Minimal, locked-down bridge. The renderer can chat and listen for shell
// status/events, nothing else — no direct node/fs access.
contextBridge.exposeInMainWorld("api", {
  sendMessage: (text) => ipcRenderer.invoke("chat:send", text),
  getConfig: () => ipcRenderer.invoke("config:get"),

  onSlideReady: (cb) => ipcRenderer.on("slide:ready", (_e, url) => cb(url)),
  onStatus: (cb) => ipcRenderer.on("shell:status", (_e, text) => cb(text)),
  onEvent: (cb) => ipcRenderer.on("chat:event", (_e, evt) => cb(evt)),
});
