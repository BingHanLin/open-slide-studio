"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Minimal, locked-down bridge. The renderer can chat and listen for shell
// status/events, nothing else — no direct node/fs access.
contextBridge.exposeInMainWorld("api", {
  sendMessage: (payload) => ipcRenderer.invoke("chat:send", payload),
  listModels: () => ipcRenderer.invoke("models:list"),
  setModel: (model) => ipcRenderer.invoke("model:set", model),
  getActionsContext: () => ipcRenderer.invoke("actions:context"),
  replyQuestion: (payload) => ipcRenderer.invoke("question:reply", payload),
  rejectQuestion: (requestID) => ipcRenderer.invoke("question:reject", requestID),
  onQuestion: (cb) => ipcRenderer.on("chat:question", (_e, payload) => cb(payload)),

  onSlideReady: (cb) => ipcRenderer.on("slide:ready", (_e, url) => cb(url)),
  onStatus: (cb) => ipcRenderer.on("shell:status", (_e, payload) => cb(payload)),
  onStream: (cb) => ipcRenderer.on("chat:stream", (_e, payload) => cb(payload)),
  onActivity: (cb) => ipcRenderer.on("chat:activity", (_e, payload) => cb(payload)),
});
