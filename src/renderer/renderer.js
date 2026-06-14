"use strict";

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const modelBtn = document.getElementById("model-btn");
const modelNameEl = document.getElementById("model-name");
const modelMenu = document.getElementById("model-menu");
const actionsBtn = document.getElementById("actions-btn");
const actionsMenu = document.getElementById("actions-menu");
const convBtn = document.getElementById("conv-btn");
const convMenu = document.getElementById("conv-menu");
const authModal = document.getElementById("auth-modal");
const authTitle = document.getElementById("auth-title");
const authClose = document.getElementById("auth-close");
const authBody = document.getElementById("auth-body");
const appEl = document.getElementById("app");
const collapseEl = document.getElementById("collapse");
const expandEl = document.getElementById("expand");
const frameEl = document.getElementById("frame");
const placeholderEl = document.getElementById("placeholder");
const statusEl = document.getElementById("statusbar");
const suggestionsEl = document.getElementById("suggestions");
const queueEl = document.getElementById("queue");
const pillEl = document.getElementById("pill");
const pillLabelEl = document.getElementById("pill-label");
const pillXEl = document.getElementById("pill-x");

// ---- i18n (UI text follows open-slide's language: en / zh-TW / zh-CN / ja) ----
const I18N = {
  "zh-TW": {
    title: "🪄 描述你的投影片",
    modelTitle: "選擇 AI 模型",
    placeholder: "例如:做一份 5 頁、介紹我們新產品的簡報",
    send: "送出",
    previewLoading: "投影片預覽載入中…",
    making: "正在製作投影片…",
    thinking: "思考中…",
    editing: "正在編寫投影片…",
    working: "處理中…",
    searching: "正在查資料…",
    fileEdited: (l) => `更新投影片:${l}`,
    error: "發生錯誤,請再試一次",
    sendError: (m) => `出錯了:${m}`,
    done: "完成了,看右側預覽 👉",
    modelsError: (m) => `無法載入模型清單:${m}`,
  },
  "zh-CN": {
    title: "🪄 描述你的幻灯片",
    modelTitle: "选择 AI 模型",
    placeholder: "例如:做一份 5 页、介绍我们新产品的演示",
    send: "发送",
    previewLoading: "幻灯片预览加载中…",
    making: "正在制作幻灯片…",
    thinking: "思考中…",
    editing: "正在编写幻灯片…",
    working: "处理中…",
    searching: "正在查资料…",
    fileEdited: (l) => `更新幻灯片:${l}`,
    error: "出错了,请再试一次",
    sendError: (m) => `出错了:${m}`,
    done: "完成了,看右侧预览 👉",
    modelsError: (m) => `无法加载模型列表:${m}`,
  },
  en: {
    title: "🪄 Describe your slides",
    modelTitle: "Choose AI model",
    placeholder: "e.g. Make a 5-page deck introducing our new product",
    send: "Send",
    previewLoading: "Loading slide preview…",
    making: "Building your slides…",
    thinking: "Thinking…",
    editing: "Writing slides…",
    working: "Working…",
    searching: "Searching the web…",
    fileEdited: (l) => `Updated slide: ${l}`,
    error: "Something went wrong, please try again",
    sendError: (m) => `Error: ${m}`,
    done: "Done — see the preview 👉",
    modelsError: (m) => `Couldn't load models: ${m}`,
  },
  ja: {
    title: "🪄 スライドを説明してください",
    modelTitle: "AIモデルを選択",
    placeholder: "例:新製品を紹介する5ページのスライドを作って",
    send: "送信",
    previewLoading: "スライドプレビューを読み込み中…",
    making: "スライドを作成中…",
    thinking: "考え中…",
    editing: "スライドを作成中…",
    working: "処理中…",
    searching: "情報を検索中…",
    fileEdited: (l) => `スライドを更新:${l}`,
    error: "エラーが発生しました。もう一度お試しください",
    sendError: (m) => `エラー:${m}`,
    done: "完了 — プレビューをご覧ください 👉",
    modelsError: (m) => `モデルを読み込めません:${m}`,
  },
};

// Empty-state action chips → open-slide skills (invoked via /skill-name).
const ACTIONS = [
  { skill: "create-slide", icon: "📊" },
  { skill: "apply-comments", icon: "💬" },
  { skill: "create-theme", icon: "🎨" },
];
const ACTION_LABELS = {
  "zh-TW": { "create-slide": "做一份新簡報", "apply-comments": "套用我的註解", "create-theme": "建立主題風格" },
  "zh-CN": { "create-slide": "做一份新幻灯片", "apply-comments": "应用我的批注", "create-theme": "创建主题风格" },
  en: { "create-slide": "New deck", "apply-comments": "Apply my comments", "create-theme": "Create a theme" },
  ja: { "create-slide": "新しいスライド", "apply-comments": "コメントを反映", "create-theme": "テーマを作成" },
};

// Question-card UI strings per locale.
const QUESTION_UI = {
  "zh-TW": { submit: "送出回答", next: "下一題", awaiting: "等待你選擇…", custom: "或輸入自訂…" },
  "zh-CN": { submit: "提交回答", next: "下一题", awaiting: "等待你选择…", custom: "或输入自定义…" },
  en: { submit: "Submit", next: "Next", awaiting: "Waiting for your choice…", custom: "or type a custom answer…" },
  ja: { submit: "送信", next: "次へ", awaiting: "選択をお待ちしています…", custom: "カスタム入力…" },
};
function qui() {
  return QUESTION_UI[lang] || QUESTION_UI.en;
}

// Conversation-switcher UI strings per locale.
const CONV_UI = {
  "zh-TW": { tip: "對話", neu: "＋ 新對話", untitled: "新對話…", del: "刪除對話", confirm: "確定刪除?", empty: "還沒有對話" },
  "zh-CN": { tip: "对话", neu: "＋ 新对话", untitled: "新对话…", del: "删除对话", confirm: "确定删除?", empty: "还没有对话" },
  en: { tip: "Conversations", neu: "＋ New chat", untitled: "New chat…", del: "Delete", confirm: "Delete?", empty: "No conversations yet" },
  ja: { tip: "会話", neu: "＋ 新しい会話", untitled: "新しい会話…", del: "削除", confirm: "削除しますか?", empty: "会話がありません" },
};
function cui() {
  return CONV_UI[lang] || CONV_UI.en;
}

// Connect-provider (model authentication) UI strings per locale.
const AUTH_UI = {
  "zh-TW": { title: "連接模型供應商", connect: "連接供應商", connected: "已連線", login: "登入", save: "連接", key: "貼上 API Key", code: "貼上授權碼", codeBtn: "完成", opening: "已開啟瀏覽器…", saving: "連接中…", fail: "連接失敗,請再試一次", empty: "沒有可連接的供應商" },
  "zh-CN": { title: "连接模型供应商", connect: "连接供应商", connected: "已连接", login: "登录", save: "连接", key: "粘贴 API Key", code: "粘贴授权码", codeBtn: "完成", opening: "已打开浏览器…", saving: "连接中…", fail: "连接失败,请重试", empty: "没有可连接的供应商" },
  en: { title: "Connect a provider", connect: "Connect provider", connected: "Connected", login: "Log in", save: "Connect", key: "Paste API key", code: "Paste the code", codeBtn: "Done", opening: "Opening browser…", saving: "Connecting…", fail: "Connection failed, try again", empty: "No connectable providers" },
  ja: { title: "プロバイダーを接続", connect: "プロバイダーを接続", connected: "接続済み", login: "ログイン", save: "接続", key: "APIキーを貼り付け", code: "認証コードを貼り付け", codeBtn: "完了", opening: "ブラウザを開きました…", saving: "接続中…", fail: "接続に失敗しました", empty: "接続できるプロバイダーがありません" },
};
function aui() {
  return AUTH_UI[lang] || AUTH_UI.en;
}

// Placeholder hints per skill — shown in the empty input while that action is armed.
const SKILL_PLACEHOLDERS = {
  "zh-TW": {
    "create-slide": "想做什麼主題的簡報?幾頁、給我重點…",
    "apply-comments": "可直接送出套用註解,或補充想怎麼改…",
    "create-theme": "描述想要的風格(配色、字體、感覺),或提供參考圖…",
  },
  "zh-CN": {
    "create-slide": "想做什么主题的演示?几页、给我重点…",
    "apply-comments": "可直接发送应用批注,或补充想怎么改…",
    "create-theme": "描述想要的风格(配色、字体、感觉),或提供参考图…",
  },
  en: {
    "create-slide": "What's the deck about? How many pages, key points…",
    "apply-comments": "Send to apply your comments, or add notes on how…",
    "create-theme": "Describe the style (colors, fonts, vibe), or share reference images…",
  },
  ja: {
    "create-slide": "どんなテーマのスライド?ページ数や要点を…",
    "apply-comments": "そのまま送信でコメント反映、または補足を…",
    "create-theme": "希望のスタイル(配色・フォント・雰囲気)や参考画像を…",
  },
};

// [collapse, expand] button tooltips per locale.
const BTN_TITLES = {
  "zh-TW": ["收合", "展開"],
  "zh-CN": ["收起", "展开"],
  en: ["Collapse", "Expand"],
  ja: ["折りたたむ", "展開"],
};

let lang = "zh-TW"; // overwritten as soon as we read open-slide's setting
let t = I18N[lang];

function applyLocale(locale) {
  if (!I18N[locale] || locale === lang) return;
  lang = locale;
  t = I18N[lang];
  document.documentElement.lang = locale;
  updatePlaceholder();
  modelBtn.dataset.tip = t.modelTitle;
  convBtn.dataset.tip = cui().tip;
  actionsBtn.dataset.tip = { "zh-TW": "動作", "zh-CN": "动作", en: "Actions", ja: "アクション" }[locale] || "Actions";
  sendEl.dataset.tip = t.send;
  collapseEl.dataset.tip = BTN_TITLES[locale][0];
  expandEl.dataset.tip = BTN_TITLES[locale][1];
  if (placeholderEl.style.display !== "none") placeholderEl.textContent = t.previewLoading;
  // refresh action chips / active pill in the new language
  if (suggestionsEl.classList.contains("show")) renderSuggestions();
  if (activeSkill) pillLabelEl.textContent = actionLabel(activeSkill);
  // refresh the connect-provider modal if it's open
  authTitle.textContent = aui().title;
  if (!authModal.hidden) renderAuthList();
  if (modelGroups.length === 0) modelNameEl.textContent = aui().connect;
}

function applyTheme(theme) {
  document.documentElement.classList.toggle("light", theme === "light");
}

// Normalize whatever open-slide reports into one of our four locales.
function normalizeLocale(raw) {
  if (!raw) return null;
  if (I18N[raw]) return raw;
  const v = raw.toLowerCase();
  if (v.startsWith("ja")) return "ja";
  if (v.startsWith("en")) return "en";
  if (v.includes("hant") || v.includes("tw")) return "zh-TW";
  if (v.includes("hans") || v.includes("cn")) return "zh-CN";
  if (v.startsWith("zh")) return "zh-TW";
  return null;
}

// ---- chat ----
let activeActivity = null;
let activityTextEl = null;
let activityTimer = null;
let processing = false;
// Bubbles for the in-flight turn, keyed by the agent message part id, created
// lazily on first content so there's never an empty placeholder, and appended
// in arrival order so they interleave correctly with question cards.
let turnParts = new Map();

function addMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function scrollToEnd() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Minimal, safe markdown → HTML (escapes first, only emits our own tags).
function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
function renderMarkdown(src) {
  const blocks = [];
  src = String(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, _lang, code) => {
    blocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    return ` ${blocks.length - 1} `;
  });
  src = escapeHtml(src);
  src = src.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  src = src.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
  src = src.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  src = src.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1"); // links → label text (no navigation)
  const lines = src.split(/\r?\n/);
  let html = "", inUl = false, inOl = false;
  const close = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };
  for (const line of lines) {
    let m;
    if ((m = line.match(/^#{1,6}\s+(.*)/))) { close(); html += `<div class="md-h">${m[1]}</div>`; }
    else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (!inUl) { close(); html += "<ul>"; inUl = true; } html += `<li>${m[1]}</li>`; }
    else if ((m = line.match(/^\s*\d+\.\s+(.*)/))) { if (!inOl) { close(); html += "<ol>"; inOl = true; } html += `<li>${m[1]}</li>`; }
    else if (line.trim() === "") { close(); }
    else { close(); html += `<div>${line}</div>`; }
  }
  close();
  return html.replace(/ (\d+) /g, (_m, i) => (blocks[+i] !== undefined ? blocks[+i] : _m));
}
function addAgentMarkdown(text) {
  const el = addMessage("agent", "");
  el.innerHTML = renderMarkdown(text);
  return el;
}

// A live "agent is working" line: status text + bouncing dots + elapsed timer.
// The dots animate and the timer ticks continuously, so it never looks frozen
// even when no events arrive for a while.
function startActivity(text) {
  const el = addMessage("agent activity", "");
  activityTextEl = document.createElement("span");
  activityTextEl.className = "act-text";
  activityTextEl.textContent = text;
  const dots = document.createElement("span");
  dots.className = "dots";
  dots.innerHTML = "<i></i><i></i><i></i>";
  const time = document.createElement("span");
  time.className = "time";
  el.append(activityTextEl, dots, time);

  const start = Date.now();
  const tick = () => {
    const s = Math.floor((Date.now() - start) / 1000);
    time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  tick();
  activityTimer = setInterval(tick, 1000);
  return el;
}

function stopActivity() {
  if (activityTimer) clearInterval(activityTimer);
  activityTimer = null;
  if (activeActivity) activeActivity.remove();
  activeActivity = null;
  activityTextEl = null;
}

// ChatGPT-style auto-growing textarea.
function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
}
inputEl.addEventListener("input", autoGrow);

// Turn queue: one turn runs at a time. New input while busy is queued and
// shown in the waiting area; it only becomes a user bubble once the agent
// actually picks it up.
const queue = [];

function queueText(item) {
  return item.skill
    ? item.text
      ? `${actionLabel(item.skill)} · ${item.text}`
      : actionLabel(item.skill)
    : item.text;
}

function renderQueue() {
  queueEl.innerHTML = "";
  queueEl.classList.toggle("show", queue.length > 0);
  for (const item of queue) {
    const div = document.createElement("div");
    div.className = "queued";
    div.textContent = queueText(item);
    queueEl.appendChild(div);
  }
}

function submit() {
  const text = inputEl.value.trim();
  const skill = activeSkill;
  if (!text && !skill) return;
  inputEl.value = "";
  autoGrow();
  clearPill();
  queue.push({ text, skill });
  renderQueue();
  pump();
}

async function pump() {
  if (processing) return;
  const item = queue.shift();
  if (!item) return;
  processing = true;
  convBtn.disabled = true; // no switching/new/delete mid-turn
  closeConvMenu();
  renderQueue(); // it's been picked up — drop from the waiting area

  // now it becomes a real user bubble (the agent is handling it)
  const shown = item.skill
    ? item.text
      ? `${actionLabel(item.skill)}\n${item.text}`
      : actionLabel(item.skill)
    : item.text;
  addMessage("user", shown);
  updateSuggestions();

  // No placeholder bubble — agent bubbles are created lazily on first content.
  turnParts = new Map();
  activeActivity = startActivity(t.making);

  try {
    const reply = await window.api.sendMessage({ text: item.text, skill: item.skill });
    // Fallback only if nothing streamed into a bubble this turn.
    if (turnParts.size === 0) {
      const txt = (reply?.text || "").trim();
      if (txt) addAgentMarkdown(txt);
    }
  } catch (err) {
    addAgentMarkdown(t.sendError(err.message));
  } finally {
    stopActivity();
    scrollToEnd();
  }

  processing = false;
  convBtn.disabled = false;
  pump(); // next queued turn, if any
}

sendEl.addEventListener("click", submit);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});

// ---- shell wiring ----
window.api.onSlideReady((url) => {
  frameEl.src = url;
  frameEl.style.display = "flex";
  placeholderEl.style.display = "none";
  frameEl.addEventListener("dom-ready", startSettingsSync, { once: true });
});

// The status bar stays hidden; it flashes only for real errors, then auto-hides.
let errorTimer = null;
function showError(text) {
  statusEl.textContent = text;
  statusEl.classList.add("show");
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => statusEl.classList.remove("show"), 6000);
}
window.api.onStatus((payload) => {
  if (payload && payload.error) showError(payload.text);
});

// Streaming assistant text — one bubble per message part, created lazily on
// first content and rendered as markdown.
window.api.onStream(({ id, text }) => {
  if (!processing) return;
  let el = turnParts.get(id);
  if (!el) {
    el = addMessage("agent", "");
    turnParts.set(id, el);
  }
  el.innerHTML = renderMarkdown(text);
  if (activeActivity) messagesEl.appendChild(activeActivity); // keep status last
  scrollToEnd();
});

// Friendly localized progress — update the transient activity line.
window.api.onActivity((payload) => {
  if (!activityTextEl) return;
  let text = "";
  switch (payload.kind) {
    case "thinking": text = t.thinking; break;
    case "editing": text = t.editing; break;
    case "working": text = t.working; break;
    case "searching": text = t.searching; break;
    case "fileEdited": text = t.fileEdited(payload.label); break;
    case "error": text = t.error; break;
    default: return;
  }
  activityTextEl.textContent = text;
  scrollToEnd();
});

// Interactive question card — paginated: one question per page, Prev/Next, and
// Submit on the last page. Answering POSTs back to opencode to unblock the turn.
window.api.onQuestion(({ requestID, questions }) => {
  if (activityTextEl) activityTextEl.textContent = qui().awaiting;

  const card = document.createElement("div");
  card.className = "qcard";
  const selections = questions.map(() => new Set()); // selected labels per question
  const customVals = questions.map(() => ""); // custom text per question
  let page = 0;

  const progress = document.createElement("div");
  progress.className = "qprogress";
  const body = document.createElement("div");
  body.className = "qbody";
  const nav = document.createElement("div");
  nav.className = "qnav";
  const prev = document.createElement("button");
  prev.className = "qnavbtn";
  prev.textContent = "‹";
  const next = document.createElement("button");
  next.className = "qnavbtn primary";
  nav.append(prev, next);
  card.append(progress, body, nav);

  const answered = (i) => selections[i].size > 0 || customVals[i].trim();
  const isLast = () => page === questions.length - 1;

  function renderPage() {
    const q = questions[page];
    progress.textContent = `${page + 1} / ${questions.length}`;
    body.innerHTML = "";
    const qt = document.createElement("div");
    qt.className = "qtext";
    qt.textContent = q.question;
    body.appendChild(qt);

    const opts = document.createElement("div");
    opts.className = "qopts";
    q.options.forEach((o) => {
      const btn = document.createElement("button");
      btn.className = "qopt" + (selections[page].has(o.label) ? " sel" : "");
      const lab = document.createElement("div");
      lab.className = "qlabel";
      lab.textContent = o.label;
      btn.appendChild(lab);
      if (o.description) {
        const d = document.createElement("div");
        d.className = "qdesc";
        d.textContent = o.description;
        btn.appendChild(d);
      }
      btn.addEventListener("click", () => {
        if (q.multiple) {
          selections[page].has(o.label) ? selections[page].delete(o.label) : selections[page].add(o.label);
        } else {
          selections[page].clear();
          selections[page].add(o.label);
        }
        renderPage();
      });
      opts.appendChild(btn);
    });
    body.appendChild(opts);

    if (q.custom) {
      const inp = document.createElement("input");
      inp.className = "qcustom";
      inp.placeholder = qui().custom;
      inp.value = customVals[page];
      inp.addEventListener("input", () => {
        customVals[page] = inp.value;
        next.disabled = !answered(page);
      });
      body.appendChild(inp);
    }

    prev.style.visibility = page === 0 ? "hidden" : "visible";
    next.textContent = isLast() ? qui().submit : qui().next;
    next.classList.toggle("submit", isLast());
    next.disabled = !answered(page);
    if (activeActivity) messagesEl.appendChild(activeActivity); // keep status last
    scrollToEnd();
  }

  prev.addEventListener("click", () => {
    if (page > 0) {
      page--;
      renderPage();
    }
  });
  next.addEventListener("click", async () => {
    if (!answered(page)) return;
    if (!isLast()) {
      page++;
      renderPage();
      return;
    }
    // submit
    const answers = questions.map((q, i) => {
      const arr = Array.from(selections[i]);
      if (customVals[i].trim()) arr.push(customVals[i].trim());
      return arr;
    });
    nav.remove();
    body.remove();
    progress.remove();
    card.classList.add("answered");
    const sum = document.createElement("div");
    sum.className = "qsummary";
    questions.forEach((q, i) => {
      const row = document.createElement("div");
      row.className = "qsumrow";
      const h = document.createElement("span");
      h.className = "qsumh";
      h.textContent = q.header || q.question.slice(0, 16);
      const v = document.createElement("span");
      v.className = "qsumv";
      v.textContent = [...selections[i], customVals[i].trim()].filter(Boolean).join(", ");
      row.append(h, v);
      sum.appendChild(row);
    });
    card.appendChild(sum);
    if (activityTextEl) activityTextEl.textContent = t.making;
    if (activeActivity) messagesEl.appendChild(activeActivity);
    try {
      await window.api.replyQuestion({ requestID, answers });
    } catch (e) {
      showError(e.message);
    }
  });

  messagesEl.appendChild(card);
  renderPage();
});

// ---- follow open-slide's theme + language ----
// <webview>.executeJavaScript runs in open-slide's own context, so we can read
// its localStorage / DOM even though it's a different origin.
const READ_SETTINGS = `(function(){
  var ls=function(k){try{return localStorage.getItem(k)}catch(e){return null}};
  var de=document.documentElement;
  var locale = ls('open-slide:locale') || de.getAttribute('lang') || '';
  var theme = de.getAttribute('data-theme')
    || (de.classList.contains('dark')?'dark':(de.classList.contains('light')?'light':''));
  if(!theme){
    try{ for(var i=0;i<localStorage.length;i++){ var k=localStorage.key(i);
      if(/theme|dark|mode/i.test(k)){ var v=(ls(k)||'').toLowerCase();
        if(v.indexOf('dark')>=0){theme='dark';break} if(v.indexOf('light')>=0){theme='light';break} } } }catch(e){}
  }
  if(!theme){
    var m=(getComputedStyle(document.body).backgroundColor||'').match(/\\d+/g);
    if(m){ theme=(0.299*m[0]+0.587*m[1]+0.114*m[2])<128?'dark':'light'; }
  }
  return JSON.stringify({locale:locale, theme:theme});
})()`;

async function syncSettings() {
  try {
    const json = await frameEl.executeJavaScript(READ_SETTINGS, true);
    const { locale, theme } = JSON.parse(json);
    const norm = normalizeLocale(locale);
    if (norm) applyLocale(norm);
    if (theme) applyTheme(theme);
  } catch {
    /* webview not ready yet — next tick will retry */
  }
}

function startSettingsSync() {
  syncSettings();
  setInterval(syncSettings, 1500); // pick up live toggles in the open-slide UI
}

// ---- empty-state action chips → skills ----
let activeSkill = null;

function actionLabel(skill) {
  const a = ACTIONS.find((x) => x.skill === skill);
  const lbl = (ACTION_LABELS[lang] || ACTION_LABELS.en)[skill] || skill;
  return a ? `${a.icon} ${lbl}` : lbl;
}

function renderSuggestions() {
  suggestionsEl.innerHTML = "";
  for (const a of ACTIONS) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = actionLabel(a.skill);
    chip.addEventListener("click", () => selectAction(a.skill));
    suggestionsEl.appendChild(chip);
  }
}

function updateSuggestions() {
  const empty = messagesEl.children.length === 0;
  suggestionsEl.classList.toggle("show", empty);
  if (empty) renderSuggestions();
}

// Empty-input placeholder follows the armed skill (or the default hint).
function updatePlaceholder() {
  const sp = SKILL_PLACEHOLDERS[lang] || SKILL_PLACEHOLDERS.en;
  inputEl.placeholder = activeSkill ? sp[activeSkill] || t.placeholder : t.placeholder;
}

function selectAction(skill) {
  activeSkill = skill;
  pillLabelEl.textContent = actionLabel(skill);
  pillEl.style.display = "inline-flex";
  updatePlaceholder();
  inputEl.focus();
}

function clearPill() {
  activeSkill = null;
  pillEl.style.display = "none";
  updatePlaceholder();
}

pillXEl.addEventListener("click", clearPill);

// "+" actions menu — same skills as the empty-state chips, available any time.
function renderActionsMenu() {
  actionsMenu.innerHTML = "";
  for (const a of ACTIONS) {
    const item = document.createElement("div");
    item.className = "item";
    item.textContent = actionLabel(a.skill);
    item.addEventListener("click", () => {
      selectAction(a.skill);
      closeActionsMenu();
    });
    actionsMenu.appendChild(item);
  }
}
function openActionsMenu() {
  renderActionsMenu();
  actionsMenu.hidden = false;
}
function closeActionsMenu() {
  actionsMenu.hidden = true;
}
actionsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (actionsMenu.hidden) openActionsMenu();
  else closeActionsMenu();
});
document.addEventListener("click", (e) => {
  if (!actionsMenu.hidden && !actionsMenu.contains(e.target) && !actionsBtn.contains(e.target)) closeActionsMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeActionsMenu();
});

function initActions() {
  updateSuggestions();
}

// ---- conversation switcher (new / list / switch / delete) ----
// History/persistence lives entirely in the opencode server; this is pure UI
// over sessions:list / session:switch / session:delete.
let convSessions = [];

// Locale-aware relative time ("3 minutes ago"), no strings to maintain.
function relTime(ts) {
  if (!ts) return "";
  const diff = ts - Date.now(); // negative = past
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const hr = Math.round(diff / 3600000);
  if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
  return rtf.format(Math.round(diff / 86400000), "day");
}

// Wipe the chat pane back to a clean empty state (deck on the right is untouched).
function resetConversationUI() {
  messagesEl.innerHTML = "";
  queue.length = 0;
  renderQueue();
  turnParts = new Map();
  stopActivity();
  clearPill();
  updateSuggestions();
  inputEl.focus();
}

async function newConversation() {
  closeConvMenu();
  try {
    await window.api.newConversation();
  } catch {}
  resetConversationUI();
}

async function switchConversation(id) {
  closeConvMenu();
  let messages = [];
  try {
    const res = await window.api.switchSession(id);
    messages = res.messages || [];
  } catch (e) {
    showError(e.message);
    return;
  }
  resetConversationUI();
  for (const m of messages) {
    if (m.role === "user") addMessage("user", m.text);
    else addAgentMarkdown(m.text);
  }
  updateSuggestions();
  scrollToEnd();
}

async function deleteConversation(id) {
  let res = {};
  try {
    res = await window.api.deleteSession(id);
  } catch {}
  try {
    const { sessions } = await window.api.listSessions();
    convSessions = sessions || [];
  } catch {}
  renderConvMenu();
  if (res && res.wasCurrent) resetConversationUI();
}

// Turn a row into an inline "Delete?" confirm (session.delete is irreversible).
function confirmDeleteRow(itemEl, id) {
  itemEl.classList.add("confirming");
  itemEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "conv-confirm";
  const label = document.createElement("span");
  label.textContent = cui().confirm;
  const yes = document.createElement("button");
  yes.className = "conv-cbtn danger";
  yes.textContent = "✓";
  yes.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteConversation(id);
  });
  const no = document.createElement("button");
  no.className = "conv-cbtn";
  no.textContent = "×";
  no.addEventListener("click", (e) => {
    e.stopPropagation();
    renderConvMenu();
  });
  wrap.append(label, yes, no);
  itemEl.appendChild(wrap);
}

function renderConvMenu() {
  convMenu.innerHTML = "";

  const neu = document.createElement("div");
  neu.className = "item conv-new";
  neu.textContent = cui().neu;
  neu.addEventListener("click", newConversation);
  convMenu.appendChild(neu);

  if (convSessions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "group";
    empty.textContent = cui().empty;
    convMenu.appendChild(empty);
    return;
  }

  for (const s of convSessions) {
    const item = document.createElement("div");
    item.className = "item conv-item" + (s.current ? " selected" : "");

    const main = document.createElement("div");
    main.className = "conv-main";
    const title = document.createElement("div");
    title.className = "conv-title";
    title.textContent = s.title || cui().untitled;
    const time = document.createElement("div");
    time.className = "conv-time";
    time.textContent = relTime(s.updated);
    main.append(title, time);
    main.addEventListener("click", () => switchConversation(s.id));

    const del = document.createElement("button");
    del.className = "conv-del tip";
    del.dataset.tip = cui().del;
    del.textContent = "🗑";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      confirmDeleteRow(item, s.id);
    });

    item.append(main, del);
    convMenu.appendChild(item);
  }
}

async function openConvMenu() {
  try {
    const { sessions } = await window.api.listSessions();
    convSessions = sessions || [];
  } catch {
    convSessions = [];
  }
  renderConvMenu();
  convMenu.hidden = false;
}
function closeConvMenu() {
  convMenu.hidden = true;
}
convBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (convMenu.hidden) openConvMenu();
  else closeConvMenu();
});
document.addEventListener("click", (e) => {
  if (!convMenu.hidden && !convMenu.contains(e.target) && !convBtn.contains(e.target)) closeConvMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeConvMenu();
});

// ---- connect a model provider (API key / OAuth) ----
// All credential handling lives in the opencode server; we only pass values
// through once and never store them. After any success we refresh the model
// dropdown so the newly connected provider's models appear.
let authBusy = false;

async function refreshAfterAuth() {
  authBusy = false;
  await loadModels();
  await renderAuthList();
}

function authError(parent) {
  const m = document.createElement("div");
  m.className = "auth-msg err";
  m.textContent = aui().fail;
  parent.appendChild(m);
}

// API-key method: a password field + Connect button.
function buildApiMethod(p, method) {
  const wrap = document.createElement("div");
  wrap.className = "auth-method";
  const input = document.createElement("input");
  input.className = "auth-input";
  input.type = "password";
  input.placeholder = method.label || aui().key;
  const btn = document.createElement("button");
  btn.className = "auth-btn";
  btn.textContent = aui().save;
  const run = async () => {
    const key = input.value.trim();
    if (!key || authBusy) return;
    authBusy = true;
    btn.disabled = true;
    btn.textContent = aui().saving;
    try {
      await window.api.authSetKey({ id: p.id, key });
      await refreshAfterAuth();
    } catch {
      authBusy = false;
      btn.disabled = false;
      btn.textContent = aui().save;
      authError(wrap);
    }
  };
  btn.addEventListener("click", run);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
  wrap.append(input, btn);
  return wrap;
}

// OAuth method: a Login button that opens the browser. "auto" flows complete on
// their own; "code" flows reveal a paste-the-code field.
function buildOauthMethod(p, method, idx) {
  const wrap = document.createElement("div");
  wrap.className = "auth-method-col";
  const btn = document.createElement("button");
  btn.className = "auth-btn";
  const label = method.label || aui().login;
  btn.textContent = label;
  wrap.appendChild(btn);

  btn.addEventListener("click", async () => {
    if (authBusy) return;
    authBusy = true;
    btn.disabled = true;
    btn.textContent = aui().opening;
    let res;
    try {
      res = await window.api.authOauthStart({ id: p.id, method: idx });
    } catch {
      authBusy = false;
      btn.disabled = false;
      btn.textContent = label;
      authError(wrap);
      return;
    }
    if (res.done) {
      await refreshAfterAuth();
      return;
    }
    // code flow: keep the browser open, collect the pasted authorization code
    if (res.instructions) {
      const ins = document.createElement("div");
      ins.className = "auth-instructions";
      ins.textContent = res.instructions;
      wrap.appendChild(ins);
    }
    const codeRow = document.createElement("div");
    codeRow.className = "auth-method";
    const input = document.createElement("input");
    input.className = "auth-input";
    input.placeholder = aui().code;
    const done = document.createElement("button");
    done.className = "auth-btn";
    done.textContent = aui().codeBtn;
    const finish = async () => {
      const code = input.value.trim();
      if (!code) return;
      done.disabled = true;
      done.textContent = aui().saving;
      try {
        await window.api.authOauthFinish({ id: p.id, method: idx, code });
        await refreshAfterAuth();
      } catch {
        done.disabled = false;
        done.textContent = aui().codeBtn;
        authError(codeRow);
      }
    };
    done.addEventListener("click", finish);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish();
    });
    codeRow.append(input, done);
    wrap.appendChild(codeRow);
    input.focus();
  });
  return wrap;
}

async function renderAuthList() {
  authBody.innerHTML = "";
  let providers = [];
  try {
    const res = await window.api.authMethods();
    providers = res.providers || [];
  } catch {
    authError(authBody);
    return;
  }
  if (!providers.length) {
    const empty = document.createElement("div");
    empty.className = "auth-empty";
    empty.textContent = aui().empty;
    authBody.appendChild(empty);
    return;
  }
  for (const p of providers) {
    const row = document.createElement("div");
    row.className = "auth-row";
    const head = document.createElement("div");
    head.className = "auth-rowhead";
    const name = document.createElement("div");
    name.className = "auth-name";
    name.textContent = p.name;
    head.appendChild(name);
    if (p.connected) {
      const badge = document.createElement("div");
      badge.className = "auth-badge";
      badge.textContent = "✓ " + aui().connected;
      head.appendChild(badge);
    }
    row.appendChild(head);
    p.methods.forEach((m, idx) => {
      if (m.type === "api") row.appendChild(buildApiMethod(p, m));
      else if (m.type === "oauth") row.appendChild(buildOauthMethod(p, m, idx));
    });
    authBody.appendChild(row);
  }
}

async function openAuthModal() {
  authModal.hidden = false;
  authTitle.textContent = aui().title;
  authBody.innerHTML = "";
  const loading = document.createElement("div");
  loading.className = "auth-empty";
  loading.textContent = "…";
  authBody.appendChild(loading);
  await renderAuthList();
}
function closeAuthModal() {
  authModal.hidden = true;
}
authClose.addEventListener("click", closeAuthModal);
authModal.addEventListener("click", (e) => {
  if (e.target === authModal) closeAuthModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !authModal.hidden) closeAuthModal();
});

// ---- custom model dropdown ----
let modelGroups = [];
let currentModelId = null;

function modelNameOf(id) {
  for (const g of modelGroups) for (const m of g.models) if (`${g.id}/${m.id}` === id) return m.name;
  return id;
}

function renderModelMenu() {
  modelMenu.innerHTML = "";
  for (const g of modelGroups) {
    const gh = document.createElement("div");
    gh.className = "group";
    gh.textContent = g.name;
    modelMenu.appendChild(gh);
    for (const m of g.models) {
      const id = `${g.id}/${m.id}`;
      const item = document.createElement("div");
      item.className = "item" + (id === currentModelId ? " selected" : "");
      const name = document.createElement("span");
      name.textContent = m.name;
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = id === currentModelId ? "✓" : "";
      item.append(name, check);
      item.addEventListener("click", () => chooseModel(id));
      modelMenu.appendChild(item);
    }
  }
  // entry point to the connect-provider modal (always available)
  const connect = document.createElement("div");
  connect.className = "item conv-new";
  connect.textContent = "＋ " + aui().connect;
  connect.addEventListener("click", () => {
    closeModelMenu();
    openAuthModal();
  });
  modelMenu.appendChild(connect);
}

function chooseModel(id) {
  currentModelId = id;
  window.api.setModel(id);
  modelNameEl.textContent = modelNameOf(id);
  closeModelMenu();
}

function openModelMenu() {
  renderModelMenu();
  modelMenu.hidden = false;
}
function closeModelMenu() {
  modelMenu.hidden = true;
}

modelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (modelMenu.hidden) openModelMenu();
  else closeModelMenu();
});
document.addEventListener("click", (e) => {
  if (!modelMenu.hidden && !modelMenu.contains(e.target) && !modelBtn.contains(e.target)) closeModelMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModelMenu();
});

async function loadModels() {
  try {
    const { current, groups } = await window.api.listModels();
    modelGroups = groups || [];
    currentModelId = current;
    // No authenticated provider yet → guide the user to connect one instead of
    // showing an empty dropdown.
    if (modelGroups.length === 0) {
      modelNameEl.textContent = aui().connect;
      openAuthModal();
    } else {
      modelNameEl.textContent = modelNameOf(current);
    }
  } catch (err) {
    showError(t.modelsError(err.message));
  }
}

// ---- collapse / expand the agent panel ----
function setCollapsed(collapsed) {
  appEl.classList.toggle("collapsed", collapsed);
  try {
    localStorage.setItem("panelCollapsed", collapsed ? "1" : "0");
  } catch {}
}
collapseEl.addEventListener("click", () => setCollapsed(true));
expandEl.addEventListener("click", () => setCollapsed(false));
setCollapsed(localStorage.getItem("panelCollapsed") === "1");

loadModels();
initActions();
inputEl.focus();
