# open-slide studio

A bundled desktop app for **non-engineers** to build slide decks by chatting in
natural language. One window:

- **Left** — a deliberately simplified [opencode](https://opencode.ai) agent chat.
- **Right** — the live [open-slide](https://github.com/1weiho/open-slide) web view,
  hot-reloading as the agent edits the deck.

The agent edits the React/MDX slide files in the project folder; open-slide's Vite
dev server hot-reloads; the user sees slides update in real time. No bridge code is
needed between agent and viewer — the filesystem + hot reload *is* the bridge.

```
Electron shell
├── main.js  ── spawns open-slide dev server (child process)
│            └─ spawns `opencode serve` (cwd = slide dir) + connects a client
├── preload  ── locked-down IPC bridge (chat only, no fs/node)
└── renderer ── left: chat UI   right: <iframe> → open-slide dev server
```

The opencode binary ships via the version-pinned `opencode-ai` npm dependency
(downloaded on `npm install`), so there's no global install to manage. We spawn
`opencode serve` ourselves with `cwd` = the slide project, so the agent reads the
deck's CLAUDE.md/skills and edits its slide files directly.

## Prerequisites

- **Node.js** (18+)
- opencode **authenticated once** for your model provider: `opencode auth login`
  (credentials live in your home dir and are shared by any opencode binary)

## Setup

```bash
cd open-slide-studio
npm install             # also downloads the pinned opencode binary
npm run init-slides     # scaffolds the open-slide project into ./slides
npm start
```

## Configure

Everything machine-specific lives in `config.json`:

- `slideProjectDir` — where the open-slide project is (default `./slides`)
- `slideDevCommand` / `slideDevArgs` — how to start its dev server (`npm run dev`)
- `opencode.bin` — opencode executable; defaults to the npm-installed binary.
  Path bins resolve against the app root; a bare name resolves via PATH.
- `opencode.model` — `provider/modelID`, e.g. `kimi-for-coding/k2p6`
- `opencode.port` — server port (default `4099`; the slide dev server port is
  auto-detected from Vite's output since it's dynamic)

## What's intentionally NOT done yet (next steps)

- **Streaming** — replies render once complete; wire `chat:event` into the bubble
  for token-by-token output.
- **Locked-down permissions** — confine opencode to the slide dir and disable
  arbitrary shell before shipping to non-engineers.
- **Bundling** — package Node + opencode + a pre-installed slide project into a
  Windows installer (electron-builder) so it's double-click-to-open.
- **Inspector → chat** — feed open-slide's click-to-comment back into the chat.
- **Export button** — surface open-slide's PDF/HTML export.
