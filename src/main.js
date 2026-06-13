"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

const slideDir = path.isAbsolute(config.slideProjectDir)
  ? config.slideProjectDir
  : path.join(ROOT, config.slideProjectDir);

// ---- process & client state -------------------------------------------------
let win = null;
let slideProc = null; // open-slide vite dev server child process
let opencodeProc = null; // `opencode serve` child process (we own it)
let client = null; // SDK client bound to our opencode server
let sessionId = null; // lazily-created opencode session

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

function status(text) {
  console.log("[shell]", text);
  send("shell:status", text);
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
      .catch((err) => status(err.message));
  }
}

function startSlideServer() {
  if (!fs.existsSync(slideDir)) {
    status(`slide project not found at ${slideDir} — run \`npm run init-slides\` first`);
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
  slideProc.on("exit", (code) => status(`open-slide dev server exited (${code})`));
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
  const { hostname, port, model } = config.opencode;

  status(`starting opencode serve (cwd=${slideDir})`);
  opencodeProc = spawn(cmd, ["serve", `--hostname=${hostname}`, `--port=${port}`], {
    cwd: slideDir,
    shell: true, // Windows: resolves the exe / .cmd shim on PATH
    env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify({ model }) },
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

  client = createOpencodeClient({ baseUrl: url });
  status(`opencode running at ${url}`);
  subscribeEvents(); // fire-and-forget live event stream
}

// Forward opencode events to the renderer so the chat can show live progress.
async function subscribeEvents() {
  try {
    const events = await client.event.subscribe();
    for await (const event of events.stream) {
      send("chat:event", { type: event.type, properties: event.properties });
    }
  } catch (err) {
    status(`event stream ended: ${err.message}`);
  }
}

async function ensureSession() {
  if (sessionId) return sessionId;
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

// Chat send: route the user's natural-language message to the agent.
async function handleSend(_evt, text) {
  await ensureSession();
  const [providerID, ...rest] = String(config.opencode.model).split("/");
  const modelID = rest.join("/");
  const result = unwrap(
    await client.session.prompt({
      path: { id: sessionId },
      query: { directory: slideDir },
      body: {
        model: { providerID, modelID },
        parts: [{ type: "text", text }],
      },
    })
  );
  // Pull any text parts out of the final assistant message.
  const parts = result?.parts || result?.message?.parts || [];
  const replyText = parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n")
    .trim();
  return { text: replyText || "(no text reply — check the slide preview)" };
}

// ---- window -----------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "open-slide studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// ---- boot -------------------------------------------------------------------

app.whenReady().then(async () => {
  ipcMain.handle("chat:send", handleSend);
  ipcMain.handle("config:get", () => ({ slideUrl: config.slideUrl }));

  createWindow();
  startSlideServer();

  try {
    await startOpencode();
  } catch (err) {
    status(`opencode failed to start: ${err.message} — is it installed & authenticated?`);
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
  killTree(slideProc);
  killTree(opencodeProc);
}

app.on("window-all-closed", () => {
  shutdown();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", shutdown);
