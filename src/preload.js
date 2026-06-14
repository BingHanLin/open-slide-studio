"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Minimal, locked-down bridge. The renderer can chat and listen for shell
// status/events, nothing else — no direct node/fs access.
contextBridge.exposeInMainWorld("api", {
  sendMessage: (payload) => ipcRenderer.invoke("chat:send", payload),
  listModels: () => ipcRenderer.invoke("models:list"),
  setModel: (model) => ipcRenderer.invoke("model:set", model),
  appInfo: () => ipcRenderer.invoke("app:info"),
  authMethods: () => ipcRenderer.invoke("auth:methods"),
  authSetKey: (payload) => ipcRenderer.invoke("auth:setKey", payload),
  authOauthStart: (payload) => ipcRenderer.invoke("auth:oauthStart", payload),
  authOauthFinish: (payload) => ipcRenderer.invoke("auth:oauthFinish", payload),
  newConversation: () => ipcRenderer.invoke("chat:new"),
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  switchSession: (id) => ipcRenderer.invoke("session:switch", id),
  deleteSession: (id) => ipcRenderer.invoke("session:delete", id),
  replyQuestion: (payload) => ipcRenderer.invoke("question:reply", payload),
  rejectQuestion: (requestID) => ipcRenderer.invoke("question:reject", requestID),
  onQuestion: (cb) => ipcRenderer.on("chat:question", (_e, payload) => cb(payload)),

  onSlideReady: (cb) => ipcRenderer.on("slide:ready", (_e, url) => cb(url)),
  onStatus: (cb) => ipcRenderer.on("shell:status", (_e, payload) => cb(payload)),
  onStream: (cb) => ipcRenderer.on("chat:stream", (_e, payload) => cb(payload)),
  onActivity: (cb) => ipcRenderer.on("chat:activity", (_e, payload) => cb(payload)),
});
