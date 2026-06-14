# open-slide studio

A desktop app that **integrates [opencode](https://opencode.ai) and
[open-slide](https://github.com/1weiho/open-slide)** so **non-engineers** can
build slide decks just by chatting in natural language.

It pairs two open-source projects in one window:

- **[opencode](https://opencode.ai)** — the AI coding agent — runs headless as
  the engine that writes and edits the slide files.
- **[open-slide](https://github.com/1weiho/open-slide)** — a React/MDX slide
  framework on Vite — renders the deck and hot-reloads it live.

```
┌─────────────────────────┬─────────────────────────┐
│  opencode agent chat    │  open-slide live deck    │
│  (left — you type here) │  (right — updates live)  │
└─────────────────────────┴─────────────────────────┘
```

You describe what you want; the agent edits the React/MDX slide files; open-slide's
Vite dev server hot-reloads; you see the deck change in real time. No bridge code is
needed between the agent and the viewer — **the filesystem + hot reload *is* the
bridge.**

```
Electron shell
├── main.js  ── spawns the open-slide dev server (child process)
│            └─ spawns `opencode serve` (cwd = slide dir) + connects a client
├── preload  ── locked-down IPC bridge (chat only, no fs/node)
└── renderer ── left: chat UI   right: <webview> → open-slide dev server
```

## Install

Download **`open-slide studio Setup <version>.exe`** from the
[Releases](https://github.com/BingHanLin/open-slide-studio/releases) page and run it.

The installer is **self-contained** — it bundles opencode and a ready-to-run
open-slide project, so **you do not need Node.js, npm, or anything else
installed**. On first launch it prepares your slide workspace (a one-time copy),
then you connect a model provider from the in-app panel and start chatting.

> The installer isn't code-signed yet, so Windows SmartScreen may warn on first
> run — choose **More info → Run anyway**.

### Connect a model

Open the **connect** panel in the app and add a provider (paste an API key, or use
the provider's login flow). The installed app keeps its own opencode credentials
and conversation history in your per-user data dir, separate from any other
opencode on the machine.

## Develop from source

Prerequisites:

- **Node.js** 18+

```bash
git clone https://github.com/BingHanLin/open-slide-studio.git
cd open-slide-studio
npm install             # also downloads the pinned opencode binary
npm run init-slides     # scaffolds the open-slide project into ./slides
npm start
```

In dev the slide dev server is started via its npm script; when packaged it runs
through Electron's own bundled Node, which is why the installed app needs no Node.

### Configure

These settings live in `config.json` inside the app bundle, so they only matter
when running or building from source — installed users configure everything
in-app (model provider in the connect panel, model choice persisted separately).

- `slideProjectDir` — where the open-slide project is (default `slides`; resolved
  against the writable data dir when installed, the project root in dev)
- `slideDevCommand` / `slideDevArgs` — how dev starts the slide server (`npm run dev`)
- `opencode.bin` — opencode executable; defaults to the npm-installed binary.
  Path bins resolve against the app root; a bare name resolves via PATH.
- `opencode.model` — `provider/modelID`, e.g. `kimi-for-coding/k2p6`
- `opencode.permission` — the agent's permission lockdown (edits confined to the
  slide deck, shell disabled) so it's safe for non-engineers
- `opencode.port` — server port (default `4099`; the slide dev server port is
  auto-detected from Vite's output since it's dynamic)

## Build the installer

```bash
npm run dist            # → dist/open-slide studio Setup <version>.exe  (NSIS, Windows)
npm run pack            # → dist/win-unpacked/  (unpacked app, no installer — faster)
```

A `slides/` project must be scaffolded first (`npm run init-slides`); the build's
`afterPack` hook bundles it — including its `node_modules` (Vite, the open-slide
CLI, the esbuild/rollup native binaries) — as the template that first launch
seeds. The opencode binary is asar-unpacked so it can be spawned at runtime.
