"use strict";

const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const { spawn, spawnSync } = require("child_process");
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

// Read-only app code lives under ROOT (an asar archive once packaged). Anything
// we write at runtime — the scaffolded slide deck, user settings — must live in
// a writable location instead: the project root in dev, the per-user data dir
// when installed.
const DATA_ROOT = app.isPackaged ? app.getPath("userData") : ROOT;

// Installed opencode versions, surfaced as a small label in the panel. (Their
// package.json blocks subpath require via "exports", so read the file directly.)
function readPkgVersion(...parts) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", ...parts, "package.json"), "utf8")).version || "";
  } catch {
    return "";
  }
}
const opencodeVersion = readPkgVersion("opencode-ai"); // the bundled runtime/server
const sdkVersion = readPkgVersion("@opencode-ai", "sdk");

const slideDir = path.isAbsolute(config.slideProjectDir)
  ? config.slideProjectDir
  : path.join(DATA_ROOT, config.slideProjectDir);

// Installed builds ship the slide deck (and its node_modules) as a read-only
// template under resources/; it's copied into the writable slideDir on first
// launch. In dev there's no template — the deck already lives at slideDir.
const SLIDE_TEMPLATE = app.isPackaged ? path.join(process.resourcesPath, "slides-template") : null;

// User-picked model persists here (separate from config.json so we never
// rewrite the user's hand-edited config).
const SETTINGS_PATH = path.join(DATA_ROOT, "user-settings.json");
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
let turnInFlight = false; // a prompt/command is streaming — don't restart the server under it

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

// Seed the slide workspace on first launch (installed builds only): copy the
// bundled template — deck source + node_modules — into the writable slideDir,
// once. After that the agent edits it and Vite caches into it freely.
async function ensureSlideProject() {
  if (fs.existsSync(slideDir)) return;
  if (!SLIDE_TEMPLATE || !fs.existsSync(SLIDE_TEMPLATE)) return; // dev: nothing to seed
  status("first launch — preparing the slide workspace (one-time copy)…");
  await fs.promises.cp(SLIDE_TEMPLATE, slideDir, { recursive: true });
  status("slide workspace ready");
}

// Start the open-slide (Vite) dev server. Installed builds have no Node/npm on
// the user's machine, so run the CLI entry with Electron's own bundled Node
// (ELECTRON_RUN_AS_NODE) instead of `npm run dev`; dev keeps the npm script.
function spawnSlideDev() {
  if (app.isPackaged) {
    const cli = path.join(slideDir, "node_modules", "@open-slide", "core", "bin.js");
    return spawn(process.execPath, [cli, "dev"], {
      cwd: slideDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
  }
  return spawn(config.slideDevCommand, config.slideDevArgs, {
    cwd: slideDir,
    shell: true, // dev: needed on Windows so the npm/.cmd shim resolves
    env: process.env,
  });
}

function startSlideServer() {
  if (!fs.existsSync(slideDir)) {
    statusError(`slide project not found at ${slideDir} — run \`npm run init-slides\` first`);
    return;
  }
  status(`starting open-slide dev server in ${slideDir}`);
  slideProc = spawnSlideDev();
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
  // The bundled binary is asar-unpacked (it can't be spawned from inside the
  // archive); point at the on-disk copy electron-builder extracts alongside it.
  if (app.isPackaged) bin = bin.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
  const cmd = /\s/.test(bin) ? `"${bin}"` : bin; // quote paths with spaces under shell
  const { hostname, port, permission } = config.opencode;

  // A previous run killed mid-flight (e.g. Ctrl+C in the dev terminal) can orphan
  // an opencode serve still holding our port, which would make this spawn exit(1)
  // with EADDRINUSE. Free the port first — but ONLY by killing our own bundled
  // binary on it, never an unrelated process.
  reclaimPort(port, bin);

  status(`starting opencode serve (cwd=${slideDir})`);
  // permission lockdown travels with the server config (see config.json).
  // model is just the server default; each prompt sends activeModel explicitly.
  const serverConfig = { model: activeModel, ...(permission ? { permission } : {}) };
  // Isolate this app's opencode footprint (auth.json, opencode.db, model cache,
  // logs) into our own per-user data dir via the XDG base-dir vars opencode
  // honors. Keeps the app self-contained: credentials and conversation history
  // don't mix with — or get polluted by — any other opencode on the machine.
  // opencode creates these dirs itself on first run.
  const dataRoot = path.join(app.getPath("userData"), "opencode-data");
  opencodeProc = spawn(cmd, ["serve", `--hostname=${hostname}`, `--port=${port}`], {
    cwd: slideDir,
    shell: true, // Windows: resolves the exe / .cmd shim on PATH
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(serverConfig),
      XDG_DATA_HOME: path.join(dataRoot, "data"), // auth.json + opencode.db
      XDG_CONFIG_HOME: path.join(dataRoot, "config"),
      XDG_CACHE_HOME: path.join(dataRoot, "cache"), // models.json
      XDG_STATE_HOME: path.join(dataRoot, "state"),
    },
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

// opencode enumerates providers (and installs a provider's SDK package) once, at
// startup, reading auth.json then. A credential added via auth.set on the
// already-running server therefore isn't reflected until a fresh process — which
// is why a newly connected provider wouldn't appear in the model list until the
// app was restarted. Re-spawn the server so the new provider shows up right away.
// Pending/subsequent SDK calls block on waitForClient() until the new client is up.
async function restartOpencode() {
  // Never sever an active turn: if the agent is mid-generation (or paused on a
  // question), wait for it to finish before recycling the server. The key is
  // already stored, so the new provider just appears a little later instead of
  // killing the user's running turn.
  if (turnInFlight) status("provider connected — will refresh once the current turn finishes");
  while (turnInFlight) await new Promise((r) => setTimeout(r, 250));
  status("restarting opencode to pick up the new provider");
  client = null;
  const old = opencodeProc;
  opencodeProc = null;
  if (old) {
    old.removeAllListeners(); // its exit is intentional — don't reject/toast
    killTree(old);
    await new Promise((r) => setTimeout(r, 500)); // let the OS release the port before rebinding
  }
  await startOpencode();
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
  // No title — opencode auto-names the session from the first message, which is
  // what the conversation switcher lists.
  const session = unwrap(
    await client.session.create({
      query: { directory: slideDir },
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

  // Mark the turn in flight so a provider connect can't restart the server out
  // from under this streaming request (it would abort the turn). The flag stays
  // set while the turn is paused on a pending question too.
  turnInFlight = true;
  try {
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
  } finally {
    turnInFlight = false;
  }
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

// ---- conversation (session) switching ---------------------------------------

// Drop the current session reference (and its per-turn stream state). The next
// send lazily creates a fresh session via ensureSession() — so a brand-new,
// not-yet-sent conversation never materializes on the server or in the list.
function resetSession() {
  sessionId = null;
  currentAssistantMsg = null;
  announcedTools.clear();
  seenQuestions.clear();
}

function handleNewConversation() {
  resetSession();
  return { ok: true };
}

// List top-level conversations for this deck, newest first. Child sessions
// (spawned by the task/subtask tools) carry a parentID and are hidden.
async function handleListSessions() {
  await waitForClient();
  const data = unwrap(await client.session.list({ query: { directory: slideDir } }));
  const sessions = (Array.isArray(data) ? data : [])
    .filter((s) => !s.parentID)
    .sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0))
    .map((s) => ({ id: s.id, title: s.title || "", updated: s.time?.updated || 0, current: s.id === sessionId }));
  return { sessions };
}

// Switch the active session and return its history flattened to {role, text}
// bubbles. Tool/question/reasoning parts are transient and omitted — only the
// text the user already saw is rebuilt. Live events re-filter on the new id.
async function handleSwitchSession(_evt, id) {
  await waitForClient();
  sessionId = id;
  currentAssistantMsg = null;
  announcedTools.clear();
  seenQuestions.clear();
  const data = unwrap(await client.session.messages({ path: { id }, query: { directory: slideDir } }));
  const messages = (Array.isArray(data) ? data : [])
    .map((m) => ({
      role: m.info?.role,
      text: (m.parts || [])
        .filter((p) => p.type === "text" && p.text && !p.synthetic)
        .map((p) => p.text)
        .join("\n")
        .trim(),
    }))
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.text);
  return { messages };
}

// Delete a session and all its data (irreversible). If it was the active one,
// reset to a clean new-conversation state.
async function handleDeleteSession(_evt, id) {
  await waitForClient();
  const wasCurrent = id === sessionId;
  try {
    await client.session.delete({ path: { id }, query: { directory: slideDir } });
  } catch {}
  if (wasCurrent) resetSession();
  return { ok: true, wasCurrent };
}

// ---- model-provider authentication ------------------------------------------

// Combine the catalog (display names + connected state) with each provider's
// auth methods, so the connect panel can render "paste key" vs "login" per
// provider. Only providers that expose at least one auth method are listable.
async function handleAuthMethods() {
  await waitForClient();
  const list = unwrap(await client.provider.list({ query: { directory: slideDir } }));
  const methods = unwrap(await client.provider.auth({ query: { directory: slideDir } }));
  const connected = new Set(list.connected || []);
  const providers = (list.all || [])
    .map((p) => {
      let m = methods[p.id] || [];
      // Only ~9 of ~145 providers expose a special auth flow (OAuth / named API
      // flow). The rest authenticate with a plain API key, which auth.set writes
      // straight to opencode's store. Offer that key field whenever the catalog
      // marks the provider as key-based (it declares an env var) — so the panel
      // covers the whole catalog (e.g. Kimi, Anthropic, OpenRouter), not just
      // the handful with interactive flows.
      if (m.length === 0 && (p.env || []).length > 0) m = [{ type: "api" }];
      return { id: p.id, name: p.name || p.id, connected: connected.has(p.id), methods: m };
    })
    .filter((p) => p.methods.length > 0) // still drop ones with no way to connect here
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.name.localeCompare(b.name));
  return { providers };
}

// API-key auth: hand the key to opencode's auth store. We pass it through once
// and never persist or log it ourselves.
async function handleAuthSetKey(_evt, { id, key }) {
  await waitForClient();
  unwrap(await client.auth.set({ path: { id }, query: { directory: slideDir }, body: { type: "api", key } }));
  await restartOpencode(); // so the renderer's post-connect model refresh sees the new provider
  return { ok: true };
}

// OAuth step 1: fetch the authorization URL and open the system browser. For
// "auto" (loopback) flows opencode catches the redirect itself, so we await the
// callback here — the NO_TIMEOUT dispatcher tolerates the human delay. For
// "code" flows we return instructions so the renderer can collect the code.
async function handleAuthOauthStart(_evt, { id, method }) {
  await waitForClient();
  const auth = unwrap(
    await client.provider.oauth.authorize({ path: { id }, query: { directory: slideDir }, body: { method } })
  );
  if (auth.url) shell.openExternal(auth.url);
  if (auth.method === "code") {
    return { done: false, needCode: true, instructions: auth.instructions || "" };
  }
  unwrap(await client.provider.oauth.callback({ path: { id }, query: { directory: slideDir }, body: { method } }));
  await restartOpencode(); // so the renderer's post-connect model refresh sees the new provider
  return { done: true };
}

// OAuth step 2 (code flow only): complete with the pasted authorization code.
async function handleAuthOauthFinish(_evt, { id, method, code }) {
  await waitForClient();
  unwrap(
    await client.provider.oauth.callback({ path: { id }, query: { directory: slideDir }, body: { method, code } })
  );
  await restartOpencode(); // so the renderer's post-connect model refresh sees the new provider
  return { ok: true };
}

// ---- model selection --------------------------------------------------------

function modelAvailable(model, groups) {
  const [pid, ...rest] = String(model).split("/");
  const mid = rest.join("/");
  return groups.some((g) => g.id === pid && g.models.some((m) => m.id === mid));
}

// Pick a usable model when the active one isn't available: prefer each
// provider's declared default (in returned order), else the first model.
function pickFallbackModel(groups, defaults) {
  for (const g of groups) {
    const def = defaults[g.id];
    if (def && g.models.some((m) => m.id === def)) return `${g.id}/${def}`;
  }
  const g = groups[0];
  return g && g.models[0] ? `${g.id}/${g.models[0].id}` : null;
}

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
  // The configured default (config.json) may point at a provider that isn't
  // connected on a fresh, isolated store — leaving the app on a dead model.
  // Fall back to an available one (e.g. OpenCode Zen's free default) so it
  // always boots usable; the user can switch once they connect their provider.
  if (groups.length && !modelAvailable(activeModel, groups)) {
    const fallback = pickFallbackModel(groups, data.default || {});
    if (fallback) {
      activeModel = fallback;
      status(`default model unavailable — falling back to ${fallback}`);
    }
  }
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
    icon: path.join(ROOT, "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
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

// ---- auto-update ------------------------------------------------------------

// Installed builds check GitHub Releases for a newer version on launch, download
// it in the background, and install on quit. The repo is public, so no token is
// needed; app-update.yml (bundled by electron-builder from the publish config)
// points electron-updater at the release feed. No-op in dev (no app-update.yml).
function initAutoUpdater() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    return statusError(`auto-update unavailable: ${err.message}`);
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (info) => status(`update ${info.version} available — downloading`));
  autoUpdater.on("update-not-available", () => status("app is up to date"));
  autoUpdater.on("download-progress", (p) => status(`downloading update… ${Math.round(p.percent)}%`));
  autoUpdater.on("update-downloaded", (info) => status(`update ${info.version} ready — installs when you quit`));
  autoUpdater.on("error", (err) => statusError(`update check failed: ${err?.message || err}`));
  autoUpdater.checkForUpdates().catch((err) => statusError(`update check failed: ${err?.message || err}`));
}

// ---- boot -------------------------------------------------------------------

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null); // no native menu bar — this is a kiosk-style app
  ipcMain.handle("chat:send", handleSend);
  ipcMain.handle("models:list", handleListModels);
  ipcMain.handle("model:set", handleSetModel);
  ipcMain.handle("question:reply", handleReplyQuestion);
  ipcMain.handle("question:reject", handleRejectQuestion);
  ipcMain.handle("app:info", () => ({ opencodeVersion, sdkVersion }));
  ipcMain.handle("chat:new", handleNewConversation);
  ipcMain.handle("sessions:list", handleListSessions);
  ipcMain.handle("session:switch", handleSwitchSession);
  ipcMain.handle("session:delete", handleDeleteSession);
  ipcMain.handle("auth:methods", handleAuthMethods);
  ipcMain.handle("auth:setKey", handleAuthSetKey);
  ipcMain.handle("auth:oauthStart", handleAuthOauthStart);
  ipcMain.handle("auth:oauthFinish", handleAuthOauthFinish);

  createWindow();
  initAutoUpdater(); // background check; non-blocking, installed builds only
  await ensureSlideProject();
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
// real exe (opencode.exe / vite). Kill the whole tree by PID. Use spawnSync so
// the kill completes before we exit on a signal (process.exit won't wait for an
// async spawn).
function killTree(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      proc.kill();
    }
  } catch {}
}

// Before binding our port, kill any stale opencode that a crashed/interrupted
// run left holding it — but ONLY our own bundled binary, matched by executable
// path, never an unrelated process that happens to use the port.
function reclaimPort(port, binPath) {
  if (process.platform !== "win32" || !path.isAbsolute(binPath)) return;
  try {
    const ps =
      `Get-CimInstance Win32_Process -Filter "Name='opencode.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*--port=${port}*' -and $_.ExecutablePath -eq '${binPath}' } | ` +
      `ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
    const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      stdio: "ignore",
      timeout: 5000,
    });
    if (r.status === 0) status(`reclaimed port ${port} from a stale opencode (if any)`);
  } catch {}
}

let didShutdown = false;
function shutdown() {
  if (didShutdown) return; // signal + app event can both fire
  didShutdown = true;
  shuttingDown = true;
  killTree(slideProc);
  killTree(opencodeProc);
}

app.on("window-all-closed", () => {
  shutdown();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", shutdown);

// Terminal interrupts (Ctrl+C during `npm start`) don't reliably fire Electron's
// quit events, which is how opencode gets orphaned. Catch the signals and clean
// up the child processes ourselves before exiting.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    shutdown();
    process.exit(0);
  });
}
