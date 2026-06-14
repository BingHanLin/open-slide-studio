"use strict";

const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendEl = document.getElementById("send");
const modelEl = document.getElementById("model");
const appEl = document.getElementById("app");
const collapseEl = document.getElementById("collapse");
const expandEl = document.getElementById("expand");
const frameEl = document.getElementById("frame");
const placeholderEl = document.getElementById("placeholder");
const statusEl = document.getElementById("statusbar");
const suggestionsEl = document.getElementById("suggestions");
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
    fileEdited: (l) => `スライドを更新:${l}`,
    error: "エラーが発生しました。もう一度お試しください",
    sendError: (m) => `エラー:${m}`,
    done: "完了 — プレビューをご覧ください 👉",
    modelsError: (m) => `モデルを読み込めません:${m}`,
  },
};

// Empty-state action chips → open-slide skills (invoked via /skill-name).
// `needs:"comments"` chips only appear when the inspector left pending comments.
const ACTIONS = [
  { skill: "create-slide", icon: "📊" },
  { skill: "apply-comments", icon: "💬", needs: "comments" },
  { skill: "create-theme", icon: "🎨" },
];
const ACTION_LABELS = {
  "zh-TW": { "create-slide": "做一份新簡報", "apply-comments": "套用我的註解", "create-theme": "建立主題風格" },
  "zh-CN": { "create-slide": "做一份新幻灯片", "apply-comments": "应用我的批注", "create-theme": "创建主题风格" },
  en: { "create-slide": "New deck", "apply-comments": "Apply my comments", "create-theme": "Create a theme" },
  ja: { "create-slide": "新しいスライド", "apply-comments": "コメントを反映", "create-theme": "テーマを作成" },
};

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
  modelEl.title = t.modelTitle;
  updatePlaceholder();
  sendEl.title = t.send;
  collapseEl.title = BTN_TITLES[locale][0];
  expandEl.title = BTN_TITLES[locale][1];
  if (placeholderEl.style.display !== "none") placeholderEl.textContent = t.previewLoading;
  // refresh action chips / active pill in the new language
  if (suggestionsEl.classList.contains("show")) renderSuggestions();
  if (activeSkill) pillLabelEl.textContent = actionLabel(activeSkill);
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
let activeBubble = null;
let activeActivity = null;
let streamed = false;

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

// ChatGPT-style auto-growing textarea.
function autoGrow() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
}
inputEl.addEventListener("input", autoGrow);

async function send() {
  const text = inputEl.value.trim();
  const skill = activeSkill;
  if (!text && !skill) return;
  inputEl.value = "";
  autoGrow();
  sendEl.disabled = true;

  // user bubble shows the friendly action label (if any) + text
  const shown = skill ? (text ? `${actionLabel(skill)}\n${text}` : actionLabel(skill)) : text;
  addMessage("user", shown);
  clearPill();
  updateSuggestions();

  // Assistant bubble fills in via chat:stream; activity line shows friendly
  // localized progress and is removed when the turn ends.
  activeBubble = addMessage("agent", "");
  activeActivity = addMessage("agent thinking", t.making);
  streamed = false;

  try {
    const reply = await window.api.sendMessage({ text, skill });
    if (!streamed) activeBubble.textContent = reply?.text || t.done;
  } catch (err) {
    activeBubble.textContent = t.sendError(err.message);
  } finally {
    if (activeActivity) activeActivity.remove();
    if (activeBubble && !activeBubble.textContent) activeBubble.remove();
    activeBubble = null;
    activeActivity = null;
    sendEl.disabled = false;
    inputEl.focus();
    scrollToEnd();
  }
}

sendEl.addEventListener("click", send);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
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

// Streaming assistant text — replace the bubble contents as it grows.
window.api.onStream(({ text }) => {
  if (!activeBubble) return;
  streamed = true;
  activeBubble.textContent = text;
  scrollToEnd();
});

// Friendly localized progress — update the transient activity line.
window.api.onActivity((payload) => {
  if (!activeActivity) return;
  let text = "";
  switch (payload.kind) {
    case "thinking": text = t.thinking; break;
    case "editing": text = t.editing; break;
    case "working": text = t.working; break;
    case "fileEdited": text = t.fileEdited(payload.label); break;
    case "error": text = t.error; break;
    default: return;
  }
  activeActivity.textContent = text;
  scrollToEnd();
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
let actionContext = { hasComments: false };

function actionLabel(skill) {
  const a = ACTIONS.find((x) => x.skill === skill);
  const lbl = (ACTION_LABELS[lang] || ACTION_LABELS.en)[skill] || skill;
  return a ? `${a.icon} ${lbl}` : lbl;
}

function renderSuggestions() {
  suggestionsEl.innerHTML = "";
  for (const a of ACTIONS) {
    if (a.needs === "comments" && !actionContext.hasComments) continue;
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

async function initActions() {
  try {
    actionContext = await window.api.getActionsContext();
  } catch {}
  updateSuggestions();
}

// ---- model dropdown ----
async function loadModels() {
  try {
    const { current, groups } = await window.api.listModels();
    modelEl.innerHTML = "";
    for (const g of groups) {
      const og = document.createElement("optgroup");
      og.label = g.name;
      for (const m of g.models) {
        const id = `${g.id}/${m.id}`;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = m.name;
        if (id === current) opt.selected = true;
        og.appendChild(opt);
      }
      modelEl.appendChild(og);
    }
  } catch (err) {
    showError(t.modelsError(err.message));
  }
}

modelEl.addEventListener("change", () => {
  window.api.setModel(modelEl.value);
});

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
