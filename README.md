# open-slide studio

<p align="center">
  <b>English</b> · <a href="README.zh-TW.md">繁體中文</a>
</p>

<p align="center">
  <a href="https://github.com/BingHanLin/open-slide-studio/releases"><img alt="Release" src="https://img.shields.io/github/v/release/BingHanLin/open-slide-studio"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/BingHanLin/open-slide-studio"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-blue">
</p>

<p align="center">
  <img src="docs/hero.png" alt="open-slide studio — opencode agent chat on the left, the live open-slide deck on the right" width="900">
</p>

**Build slide decks by chatting in natural language.** open-slide studio is a desktop
app that **integrates [opencode](https://opencode.ai) and
[open-slide](https://github.com/1weiho/open-slide)** into one window, so
**non-engineers** can go from an idea to a live, editable deck without touching code.

## Features

- 🗣️ **Author by chatting** — describe your deck; the agent writes and edits the slides.
- ⚡ **Live preview** — the deck hot-reloads beside the chat as the agent works.
- 🎨 **Themes, assets & comments** — ask for a theme, manage assets, apply your inline comments.
- 🔌 **Bring your own model** — connect any opencode-supported provider from the app.
- 💬 **Conversations** — chat history is kept per deck.
- 📦 **Self-contained** — one Windows installer; no Node.js or npm to set up.
- 🔄 **Auto-updates** — new versions download in the background and install on quit.
- 🔒 **Safe by default** — the agent is confined to the slide project (no arbitrary shell).

---

# For users

## Install

**Windows.** Download **`open-slide-studio-Setup-<version>.exe`** from the
[Releases](https://github.com/BingHanLin/open-slide-studio/releases) page and run it.

The installer is **self-contained** — it bundles opencode and a ready-to-run open-slide
project, so you **don't need Node.js, npm, or anything else installed**. The first
launch takes about a minute to prepare your slide workspace (a one-time copy).

> Not code-signed yet, so Windows SmartScreen may warn on first run — choose
> **More info → Run anyway**.

## Getting started

1. **Connect a model.** Open the **connect** panel and add a provider — paste an API
   key or use its login flow. You'll need access to a model provider (usage may be
   billed). The app keeps its own credentials and history, separate from any other
   opencode on the machine.
2. **Describe what you want.** For example:
   - *"Make a 5-page deck introducing our new product."*
   - *"Give it a dark theme."*
   - *"Apply my comments."*
3. **Watch it build.** The agent edits the slides and the deck updates live on the right.

## Updates

Installed builds check [Releases](https://github.com/BingHanLin/open-slide-studio/releases)
on launch, download any newer version in the background, and install it the next time you
quit the app.

---

# How it works

open-slide studio pairs two open-source projects in one window:

- **[opencode](https://opencode.ai)** — the AI coding agent — runs headless as the
  engine that writes and edits the slide files.
- **[open-slide](https://github.com/1weiho/open-slide)** — a React/MDX slide framework
  on Vite — renders the deck and hot-reloads it live.

```
┌─────────────────────────┬─────────────────────────┐
│  opencode agent chat    │  open-slide live deck    │
│  (left — you type here) │  (right — updates live)  │
└─────────────────────────┴─────────────────────────┘
```

The agent edits the React/MDX slide files; open-slide's Vite dev server hot-reloads; you
see the deck change in real time. No bridge code is needed between the agent and the
viewer — **the filesystem + hot reload *is* the bridge.**

```
Electron shell
├── main.js  ── spawns the open-slide dev server (child process)
│            └─ spawns `opencode serve` (cwd = slide dir) + connects a client
├── preload  ── locked-down IPC bridge (chat only, no fs/node)
└── renderer ── left: chat UI   right: <webview> → open-slide dev server
```

**Isolated opencode environment.** The app spawns `opencode serve` with its config and
data directories pointed into the app's own per-user location — `<userData>/opencode-data`,
via the `XDG_*` base-dir vars opencode honors — **not** the global opencode setup on your
machine (e.g. `~/.config/opencode`). So the app's credentials (`auth.json`), session
history (`opencode.db`), and model cache all live under the app and stay separate: logging
into opencode in a terminal and authenticating inside the app are independent, and neither
sees the other's setup.

---

# For developers

## Develop from source

Prerequisites: **Node.js** 18+.

```bash
git clone https://github.com/BingHanLin/open-slide-studio.git
cd open-slide-studio
npm install             # also downloads the pinned opencode binary
npm run init-slides     # scaffolds the open-slide project into ./slides
npm start
```

In dev the slide dev server runs via its npm script; when packaged it runs through
Electron's own bundled Node — which is why the installed app needs no Node.

## Configure

These settings live in `config.json` inside the app bundle, so they only matter when
running or building from source — installed users configure everything in-app.

- `slideProjectDir` — where the open-slide project is (default `slides`; resolved against
  the writable data dir when installed, the project root in dev)
- `slideDevCommand` / `slideDevArgs` — how dev starts the slide server (`npm run dev`)
- `opencode.bin` — opencode executable; defaults to the npm-installed binary. Path bins
  resolve against the app root; a bare name resolves via PATH.
- `opencode.model` — `provider/modelID`, e.g. `kimi-for-coding/k2p6`
- `opencode.permission` — the agent's permission lockdown (edits confined to the slide
  deck, shell disabled) so it's safe for non-engineers
- `opencode.port` — server port (default `4099`; the slide dev server port is
  auto-detected from Vite's output since it's dynamic)

## Build the installer

```bash
npm run dist            # → dist/open-slide-studio-Setup-<version>.exe  (NSIS, Windows)
npm run pack            # → dist/win-unpacked/  (unpacked app, no installer — faster)
```

A `slides/` project must be scaffolded first (`npm run init-slides`); the build's
`afterPack` hook bundles it — including its `node_modules` (Vite, the open-slide CLI, the
esbuild/rollup native binaries) — as the template that first launch seeds. The opencode
binary is asar-unpacked so it can be spawned at runtime.

---

## Credits

Built on, and grateful to, **[opencode](https://opencode.ai)** and
**[open-slide](https://github.com/1weiho/open-slide)**.

## License

[MIT](LICENSE) © 2026 Binghan Lin
