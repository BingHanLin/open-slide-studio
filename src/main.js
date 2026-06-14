"use strict";

const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { fetch: undiciFetch, Agent } = require("undici");

// Agent turns are long (slide generation can take minutes); the opencode server
// holds the prompt/command request open until the turn finishes. Node's default
// fetch (undici) aborts after a ~5-min headers timeout → "fetch failed". Use a
// dispatcher with timeouts disabled for all SDK calls (incl. the SSE stream).
const NO_TIMEOUT = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
async function noTimeoutFetch(request) {
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;
  return undiciFetch(request.url, {
    method: request.method,
    headers: Object.fromEntries(request.headers),
    body,
    dispatcher: NO_TIMEOUT,
  });
}

const ROOT = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

const slideDir = path.isAbsolute(config.slideProjectDir)
  ? config.slideProjectDir
  : path.join(ROOT, config.slideProjectDir);

// User-picked model persists here (separate from config.json so we never
// rewrite the user's hand-edited config).
const SETTINGS_PATH = path.join(ROOT, "user-settings.json");
function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    return {};
  }
}
function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
}

// ---- process & client state -------------------------------------------------
let win = null;
let slideProc = null; // open-slide vite dev server child process
let opencodeProc = null; // `opencode serve` child process (we own it)
let client = null; // SDK client bound to our opencode server
let opencodeUrl = null; // base URL of our opencode server (for raw question endpoints)
let sessionId = null; // lazily-created opencode session
let activeModel = loadSettings().model || config.opencode.model; // "provider/modelID"
let shuttingDown = false; // suppress error toasts from killing child procs on quit

// ---- helpers ----------------------------------------------------------------

// Poll a URL until it responds (vite takes a moment to boot).
function waitForUrl(url, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) return reject(new Error(`timeout waiting for ${url}`));
        setTimeout(tick, intervalMs);
      });
    };
    tick();
  });
}

// The SDK client wraps every call as { data, error, request, response }.
// Unwrap to the payload, surfacing any error.
function unwrap(r) {
  if (r && typeof r === "object" && "data" in r && ("request" in r || "response" in r || "error" in r)) {
    if (r.error) throw new Error(JSON.stringify(r.error));
    return r.data;
  }
  return r;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// The opencode client connects a few seconds after the window loads; renderer
// calls (model list, first send) may arrive before then.
function waitForClient(timeoutMs = 25000) {
  if (client) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (client) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error("opencode 尚未就緒"));
      }
    }, 200);
  });
}

// Info goes to the console only; the renderer hides these. Errors are flagged
// so the renderer can surface them briefly.
function status(text) {
  console.log("[shell]", text);
  send("shell:status", { text, error: false });
}
function statusError(text) {
  console.error("[shell:error]", text);
  send("shell:status", { text, error: true });
}

// ---- open-slide dev server --------------------------------------------------

const ANSI = /\[[0-9;]*m/g;
let slideUrlAnnounced = false;

// open-slide runs on Vite, which picks the next free port if its default is
// taken — so we can't hardcode the URL. Parse the "Local: http://..." line the
// dev server prints, then embed that exact URL.
function onSlideOutput(buf) {
  const text = buf.toString().replace(ANSI, "");
  process.stdout.write(`[slide] ${text}`);
  if (slideUrlAnnounced) return;
  const m = text.match(/https?:\/\/localhost:\d+\/?/i);
  if (m) {
    slideUrlAnnounced = true;
    const url = m[0];
    status(`open-slide dev server at ${url}`);
    waitForUrl(url)
      .then(() => send("slide:ready", url))
      .catch((err) => statusError(err.message));
  }
}

function startSlideServer() {
  if (!fs.existsSync(slideDir)) {
    statusError(`slide project not found at ${slideDir} — run \`npm run init-slides\` first`);
    return;
  }
  status(`starting open-slide dev server in ${slideDir}`);
  slideProc = spawn(config.slideDevCommand, config.slideDevArgs, {
    cwd: slideDir,
    shell: true, // needed on Windows so .cmd shims (npm/npx) resolve
    env: process.env,
  });
  slideProc.stdout.on("data", onSlideOutput);
  slideProc.stderr.on("data", onSlideOutput); // vite prints the URL on stdout, but be safe
  slideProc.on("exit", (code) => {
    if (!shuttingDown) statusError(`open-slide dev server exited (${code})`);
  });
}

// ---- opencode ---------------------------------------------------------------

// Spawn `opencode serve` ourselves (instead of the SDK's createOpencode) so we
// control the binary path and the working directory. cwd = slideDir means the
// server's project IS the slide deck — the agent reads its CLAUDE.md/skills and
// edits slide files. For bundling, set config.opencode.bin to the shipped exe.
async function startOpencode() {
  const { createOpencodeClient } = await import("@opencode-ai/sdk");
  // bin = bare name → resolve via PATH; bin = path → resolve against the app
  // root (NOT the slideDir cwd we spawn in).
  let bin = config.opencode.bin || "opencode";
  if (/[\\/]/.test(bin) && !path.isAbsolute(bin)) bin = path.join(ROOT, bin);
  const cmd = /\s/.test(bin) ? `"${bin}"` : bin; // quote paths with spaces under shell
  const { hostname, port, permission } = config.opencode;

  status(`starting opencode serve (cwd=${slideDir})`);
  // permission lockdown travels with the server config (see config.json).
  // model is just the server default; each prompt sends activeModel explicitly.
  const serverConfig = { model: activeModel, ...(permission ? { permission } : {}) };
  opencodeProc = spawn(cmd, ["serve", `--hostname=${hostname}`, `--port=${port}`], {
    cwd: slideDir,
    shell: true, // Windows: resolves the exe / .cmd shim on PATH
    env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(serverConfig) },
  });

  // The server prints "opencode server listening on <url>" once ready.
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for opencode server")), 20000);
    const scan = (buf) => {
      const text = buf.toString().replace(ANSI, "");
      process.stdout.write(`[opencode] ${text}`);
      const m = text.match(/listening on\s+(https?:\/\/[^\s]+)/i);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    opencodeProc.stdout.on("data", scan);
    opencodeProc.stderr.on("data", scan);
    opencodeProc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`opencode serve exited (${code}) before it was ready`));
    });
  });

  opencodeUrl = url;
  client = createOpencodeClient({ baseUrl: url, fetch: noTimeoutFetch });
  status(`opencode running at ${url}`);
  subscribeEvents(); // fire-and-forget live event stream
}

let currentAssistantMsg = null; // id of the assistant message we're streaming
const announcedTools = new Set(); // callIDs already surfaced this turn
const seenQuestions = new Set(); // question callIDs already forwarded to the renderer

// The agent's "question" tool blocks the turn until answered. The SDK event
// stream drops the question.v2.asked event, so we detect the running tool part
// and resolve its requestID from GET /question (matching the tool callID).
async function resolveAndSendQuestion(callID) {
  for (let i = 0; i < 15; i++) {
    try {
      const arr = await (await undiciFetch(`${opencodeUrl}/question`)).json();
      const q = (Array.isArray(arr) ? arr : []).find(
        (x) => x.sessionID === sessionId && x.questions && (!callID || x.tool?.callID === callID)
      );
      if (q) {
        send("chat:question", { requestID: q.id, questions: q.questions });
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  statusError("could not resolve pending question");
}

// Map a tool to an activity "kind" (localized in the renderer) — or null to
// hide it. Non-engineers never see raw tool names, diffs, or permission noise.
function toolKind(tool) {
  switch (tool) {
    case "write":
    case "edit":
    case "patch":
      return "editing";
    case "task":
    case "subtask":
      return "working";
    case "webfetch":
    case "websearch":
      return "searching";
    default:
      return null; // read/list/glob/grep/etc. — hide
  }
}

function slideLabel(file) {
  let label = path.basename(file);
  if (/^index\.(tsx?|jsx?|mdx?)$/i.test(label)) label = path.basename(path.dirname(file));
  return label;
}

// Subscribe to the opencode event stream and translate it into two simple
// renderer signals: chat:stream (assistant text, replace) and chat:activity
// (a transient friendly status line). Everything else stays hidden.
async function subscribeEvents() {
  try {
    const events = await client.event.subscribe();
    for await (const event of events.stream) {
      const p = event.properties || {};
      switch (event.type) {
        case "message.updated": {
          const info = p.info;
          if (info?.sessionID === sessionId && info?.role === "assistant") {
            currentAssistantMsg = info.id;
          }
          break;
        }
        case "message.part.updated": {
          const part = p.part;
          if (!part || part.sessionID !== sessionId) break;
          if (part.messageID !== currentAssistantMsg) break;
          if (part.type === "text" && part.text) {
            send("chat:stream", { id: part.id, text: part.text });
          } else if (part.type === "reasoning") {
            send("chat:activity", { kind: "thinking" });
          } else if (
            part.type === "tool" &&
            part.tool === "question" &&
            part.state?.status === "running" &&
            !seenQuestions.has(part.callID)
          ) {
            seenQuestions.add(part.callID);
            resolveAndSendQuestion(part.callID);
          } else if (part.type === "tool" && !announcedTools.has(part.callID)) {
            announcedTools.add(part.callID);
            const kind = toolKind(part.tool);
            if (kind) send("chat:activity", { kind });
          }
          break;
        }
        case "file.edited": {
          if (p.file) send("chat:activity", { kind: "fileEdited", label: slideLabel(p.file) });
          break;
        }
        case "session.error": {
          send("chat:activity", { kind: "error" });
          break;
        }
      }
    }
  } catch (err) {
    status(`event stream ended: ${err.message}`);
  }
}

async function ensureSession() {
  if (sessionId) return sessionId;
  await waitForClient();
  // Belt-and-suspenders: server cwd is already slideDir, but scope explicitly too.
  const session = unwrap(
    await client.session.create({
      query: { directory: slideDir },
      body: { title: "open-slide deck" },
    })
  );
  sessionId = session.id;
  return sessionId;
}

// Chat send: route the user's natural-language message to the agent. Live output
// is driven by subscribeEvents(); the returned text is only a fallback in case
// no streaming text part arrived. When a skill action is chosen, invoke it via
// opencode's command system (the `/skill-name` mechanism) instead of a plain prompt.
async function handleSend(_evt, { text, skill } = {}) {
  await ensureSession();
  currentAssistantMsg = null;
  announcedTools.clear();
  seenQuestions.clear();

  let result;
  if (skill) {
    result = unwrap(
      await client.session.command({
        path: { id: sessionId },
        query: { directory: slideDir },
        body: { command: skill, arguments: text || "", model: activeModel },
      })
    );
  } else {
    const [providerID, ...rest] = String(activeModel).split("/");
    result = unwrap(
      await client.session.prompt({
        path: { id: sessionId },
        query: { directory: slideDir },
        body: { model: { providerID, modelID: rest.join("/") }, parts: [{ type: "text", text }] },
      })
    );
  }
  const parts = result?.parts || result?.message?.parts || [];
  const replyText = parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n")
    .trim();
  return { text: replyText };
}

// ---- question reply ---------------------------------------------------------

// Answer the agent's pending question (unblocks the turn). answers is an array
// with one entry per question, each an array of selected option labels.
async function handleReplyQuestion(_evt, { requestID, answers }) {
  const res = await undiciFetch(`${opencodeUrl}/question/${requestID}/reply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  return { ok: res.ok };
}

async function handleRejectQuestion(_evt, requestID) {
  try {
    await undiciFetch(`${opencodeUrl}/question/${requestID}/reject`, { method: "POST" });
  } catch {}
  return { ok: true };
}

// ---- action context ---------------------------------------------------------

// "apply-comments" only makes sense when the inspector left real markers in a
// slide. Match the actual JSX-comment marker — {/* @slide-comment id="c-..." ... */}
// — not slides that merely display the literal text (e.g. the tutorial deck).
const COMMENT_MARKER = /\{\/\*\s*@slide-comment\s+id="c-/;
function hasPendingComments() {
  try {
    const dir = path.join(slideDir, "slides");
    if (!fs.existsSync(dir)) return false;
    for (const id of fs.readdirSync(dir)) {
      const f = path.join(dir, id, "index.tsx");
      if (fs.existsSync(f) && COMMENT_MARKER.test(fs.readFileSync(f, "utf8"))) return true;
    }
  } catch {}
  return false;
}

// ---- model selection --------------------------------------------------------

// List the authenticated providers/models for the dropdown, grouped by provider.
async function handleListModels() {
  await waitForClient();
  const data = unwrap(await client.config.providers());
  const groups = (data.providers || []).map((p) => ({
    id: p.id,
    name: p.name,
    // Use each model's friendly display name (e.g. "Kimi K2.6 Code") not its id.
    models: Object.entries(p.models || {})
      .map(([id, m]) => ({ id, name: m.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
  return { current: activeModel, groups };
}

// Switch model: takes effect on the next prompt (no server restart needed),
// and persists across launches.
function handleSetModel(_evt, model) {
  if (typeof model === "string" && model.includes("/")) {
    activeModel = model;
    saveSettings({ model });
    status(`model switched to ${model}`);
  }
  return { current: activeModel };
}

// ---- window -----------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "open-slide studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // right pane uses <webview> so we can read open-slide's settings
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// ---- boot -------------------------------------------------------------------

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // no native menu bar — this is a kiosk-style app
  ipcMain.handle("chat:send", handleSend);
  ipcMain.handle("models:list", handleListModels);
  ipcMain.handle("model:set", handleSetModel);
  ipcMain.handle("actions:context", () => ({ hasComments: hasPendingComments() }));
  ipcMain.handle("question:reply", handleReplyQuestion);
  ipcMain.handle("question:reject", handleRejectQuestion);

  createWindow();
  startSlideServer();

  try {
    await startOpencode();
  } catch (err) {
    statusError(`opencode failed to start: ${err.message} — is it installed & authenticated?`);
  }

  // The slide view URL is detected from the dev server's output (port is
  // dynamic) and announced via send("slide:ready") in onSlideOutput().

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// On Windows, shell:true wraps children in cmd.exe, so .kill() can orphan the
// real exe (opencode.exe / vite). Kill the whole tree by PID.
function killTree(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      proc.kill();
    }
  } catch {}
}

function shutdown() {
  shuttingDown = true;
  killTree(slideProc);
  killTree(opencodeProc);
}

app.on("window-all-closed", () => {
  shutdown();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", shutdown);
