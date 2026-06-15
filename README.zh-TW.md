# open-slide studio

<p align="center">
  <a href="README.md">English</a> · <b>繁體中文</b>
</p>

<p align="center">
  <img src="docs/hero.png" alt="open-slide studio — 左側 opencode 代理對話，右側 open-slide 即時投影片" width="900">
</p>

一款**整合 [opencode](https://opencode.ai) 與 [open-slide](https://github.com/1weiho/open-slide)** 的桌面應用程式，讓**非工程師**也能用自然語言對話、直接做出投影片。

它把兩個開源專案併進同一個視窗：

- **[opencode](https://opencode.ai)** — AI 程式代理 — 以無介面（headless）方式執行，作為撰寫、編輯投影片檔案的引擎。
- **[open-slide](https://github.com/1weiho/open-slide)** — 建構在 Vite 上的 React/MDX 投影片框架 — 負責渲染並即時熱重載投影片。

```
┌─────────────────────────┬─────────────────────────┐
│  opencode 代理對話       │  open-slide 即時投影片   │
│  (左側 — 在這裡輸入)     │  (右側 — 即時更新)       │
└─────────────────────────┴─────────────────────────┘
```

你描述想要的內容；代理編輯 React/MDX 投影片檔案；open-slide 的 Vite 開發伺服器熱重載；你即時看到投影片變化。代理與檢視器之間不需要任何橋接程式碼 —— **檔案系統 ＋ 熱重載本身就是橋樑。**

```
Electron 外殼
├── main.js  ── 啟動 open-slide 開發伺服器（子行程）
│            └─ 啟動 `opencode serve`（cwd = 投影片資料夾）並連上 client
├── preload  ── 鎖定權限的 IPC 橋接（只有對話，無 fs/node）
└── renderer ── 左：對話 UI   右：<webview> → open-slide 開發伺服器
```

## 安裝

從 [Releases](https://github.com/BingHanLin/open-slide-studio/releases) 頁面下載 **`open-slide studio Setup <版本>.exe`** 後執行。

安裝檔是**自帶完整環境的**——內含 opencode 與一個可直接執行的 open-slide 專案，所以你**不需要安裝 Node.js、npm 或任何其他東西**。首次啟動時會準備你的投影片工作區（一次性複製），接著在 App 內的面板連接模型供應商，就能開始對話。

> 安裝檔目前尚未經過程式碼簽章，Windows SmartScreen 首次執行時可能會跳出警告——請選擇 **更多資訊 → 仍要執行**。

### 連接模型

在 App 中打開**連接（connect）**面板並加入供應商（貼上 API key，或使用該供應商的登入流程）。安裝版會把自己的 opencode 憑證與對話紀錄存在你的個人資料夾中，與機器上其他的 opencode 互不干擾。

## 從原始碼開發

前置需求：

- **Node.js** 18+

```bash
git clone https://github.com/BingHanLin/open-slide-studio.git
cd open-slide-studio
npm install             # 同時下載版本鎖定的 opencode 二進位檔
npm run init-slides     # 將 open-slide 專案 scaffold 到 ./slides
npm start
```

開發模式下投影片伺服器是透過 npm script 啟動；打包後則改用 Electron 內建的 Node 執行，這也是安裝版不需要 Node 的原因。

### 設定

這些設定位於 App 套件內的 `config.json`，因此**只在從原始碼執行或建置時**才有意義——安裝版使用者一切都在 App 內設定（在連接面板選模型供應商，模型選擇另外保存）。

- `slideProjectDir` — open-slide 專案位置（預設 `slides`；安裝版解析到可寫的資料夾、開發時解析到專案根目錄）
- `slideDevCommand` / `slideDevArgs` — 開發模式如何啟動投影片伺服器（`npm run dev`）
- `opencode.bin` — opencode 執行檔；預設為 npm 安裝的二進位檔。相對路徑相對於 App 根目錄解析，純名稱則走 PATH。
- `opencode.model` — `provider/modelID`，例如 `kimi-for-coding/k2p6`
- `opencode.permission` — 代理的權限鎖定（編輯限制在投影片專案內、停用 shell），對非工程師才安全
- `opencode.port` — 伺服器埠（預設 `4099`；投影片開發伺服器的埠是動態的，會從 Vite 輸出自動偵測）

## 建置安裝檔

```bash
npm run dist            # → dist/open-slide studio Setup <版本>.exe  （NSIS，Windows）
npm run pack            # → dist/win-unpacked/  （未封裝的 App，無安裝檔，較快）
```

必須先 scaffold 一個 `slides/` 專案（`npm run init-slides`）；建置時的 `afterPack` hook 會把它——連同 `node_modules`（Vite、open-slide CLI、esbuild/rollup 原生二進位檔）——打包成首次啟動要 seed 的樣板。opencode 二進位檔會做 asar-unpack，才能在執行時被啟動。
