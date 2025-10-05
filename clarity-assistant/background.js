// background.js - routes to local backend and handles actions
const BACKEND_URL = "http://localhost:5000/api/explain";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// safeFollowupText: convert various followup shapes to readable text
function safeFollowupText(f) {
  if (!f && f !== 0) return '';                // null/undefined -> empty
  if (typeof f === 'string') return f;
  if (typeof f === 'number') return String(f);
  if (Array.isArray(f)) return f.map(safeFollowupText).filter(Boolean).join(' | ');
  if (typeof f === 'object') {
    // try common keys
    if (f.text) return String(f.text);
    if (f.question) return String(f.question);
    if (f.title) return String(f.title);
    if (f.prompt) return String(f.prompt);
    // fallback: if the object has a toString that isn't [object Object]
    try {
      if (typeof f.toString === 'function') {
        const s = f.toString();
        if (s && s !== '[object Object]') return s;
      }
    } catch (e) {}
    // last resort: JSON stringify (limited length)
    try {
      return JSON.stringify(f).slice(0, 800);
    } catch (e) {
      return String(f);
    }
  }
  return String(f);
}


function makeKey(text, mode) {
  return `explain:${(text||"").trim().slice(0,200)}:mode:${mode||"auto"}`;
}

function detectType(text){
  const t = (text||"").trim();
  if (/\b(class|def|function|console\.log|printf|#include|var\s)/i.test(t) || /\{\s*\n/.test(t)) return "code";
  if (/\b(agreement|lease|warranty|hereby|party|obligation|indemnif)/i.test(t)) return "legal";
  if (/\b(abstract|et al\.|study|methodology|conclusion|results)\b/i.test(t)) return "academic";
  return "general";
}

async function callBackend(payload) {
  try {
    const resp = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return { error: "non-json-response", trace: text, status: resp.status };
    }
  } catch (err) {
    console.error("callBackend network error:", err);
    return { error: "network_error", trace: String(err) };
  }
}

async function getCache(key) {
  return new Promise((res) => {
    chrome.storage.local.get([key], (obj) => {
      if (!obj || !obj[key]) return res(null);
      const entry = obj[key];
      if (Date.now() - entry.ts > CACHE_TTL_MS) {
        chrome.storage.local.remove([key], () => {});
        return res(null);
      }
      return res(entry.value);
    });
  });
}

async function setCache(key, value) {
  const o = {}; o[key] = { ts: Date.now(), value }; chrome.storage.local.set(o);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "EXPLAIN_REQUEST") {
        const text = message.text || "";
        const ctx = message.context || {};
        const action = message.action || "explain";
        const mode = message.mode || detectType(text);
        const key = makeKey(text, mode + ":" + action);
        const cached = await getCache(key);
        if (cached) { sendResponse({ ok: true, fromCache: true, ...cached }); return; }

        let payload = { text, mode, context: ctx };
        if (action === "rephrase") {
          payload.followup = "Rephrase the TEXT for a layperson in 2 short sentences. Do not repeat the original text.";
          payload.action = "rephrase";
        } else if (action === "action_list") {
          payload.followup = "Provide a prioritized list of 5 concrete next actions the user can take based on the TEXT. Return as JSON with key 'action_list'.";
          payload.action = "action_list";
        } else if (action === "brainstorm") {
          payload.followup = "Brainstorm 5 short ideas the user could try next based on the TEXT. Return as JSON with key 'ideas'.";
          payload.action = "brainstorm";
        } else {
          payload.action = "analyze";
        }

        const result = await callBackend(payload);
        if (result && typeof result === 'object' && Array.isArray(result.followups)) {
          // normalize followups to strings
          result.followups = result.followups
          .map(f => safeFollowupText(f))
          .map(s => (s || "").trim())
          .filter(Boolean);
        }

        // optional: ensure actions array titles are strings (defensive)
        if (result && Array.isArray(result.actions)) {
          result.actions = result.actions.map(a => {
            if (!a) return null;
            if (typeof a === 'string') return { title: a, importance: 3 };
            if (typeof a === 'object') return { title: (a.title || a.name || a.cmd || "Action"), importance: a.importance || 3, description: a.description || '' };
            return null;
          }).filter(Boolean);
        }

        if (result && !result.error) {
          result.original_text = text;
          result.original_url = ctx.url || '';
          result.original_title = ctx.title || '';
          await setCache(key, result);
          sendResponse({ ok: true, ...result });
        } else {
          sendResponse({ ok: false, error: result && result.error || "unknown_error", trace: result && result.trace });
        }
        return;
      }

      if (message?.type === "ACTION_INVOKE") {
        const idx = message.idx || 0;
        const actions = message.actions || [];
        const original = message.original_text || "";
        const action_cmd = message.action_cmd || (actions[idx] && actions[idx].cmd) || '';
        let payload = null;
        if (typeof action_cmd === 'string' && action_cmd.startsWith('rephrase:')) {
          const audience = action_cmd.split(':')[1] || 'layperson';
          payload = { text: original, mode: message.mode || detectType(original), followup: `Rephrase the following text for a ${audience} audience in 2-3 short sentences.` };
        } else if (typeof action_cmd === 'string' && action_cmd.startsWith('action_list')) {
          payload = { text: original, mode: message.mode || detectType(original), followup: 'Provide a prioritized list of 5 concrete next actions the user can take based on the TEXT. Return as plain text, each item on a new line.' };
        } else if (typeof action_cmd === 'string' && action_cmd.startsWith('brainstorm:')) {
          const n = Number((action_cmd.split(':')[1]) || 5);
          payload = { text: original, mode: message.mode || detectType(original), followup: `Brainstorm ${n} short ideas the user could try next based on the TEXT.` };
        } else {
          const a = actions[idx] || {};
          const hint = a.cmd || a.title || a.description || `Elaborate on: ${a.title || 'next steps'}`;
          payload = { text: original, mode: message.mode || detectType(original), followup: `Please perform the following: ${hint}` };
        }
        const result = await callBackend(payload);

        let fa = null;
        if (!result) {
          fa = null;
        } else if (typeof result === 'string') {
          fa = result;
        } else if (Array.isArray(result.followups) && result.followups.length) {
          fa = result.followups.map(f => safeFollowupText(f)).join('\\n');
        } else if (result.followup && typeof result.followup === 'string') {
          fa = result.followup;
        } else if (result.rephrase && typeof result.rephrase === 'string') {
          fa = result.rephrase;
        } else if (result.action_list && Array.isArray(result.action_list)) {
          fa = result.action_list.map(safeFollowupText).join('\\n');
        } else if (result.ideas && Array.isArray(result.ideas)) {
          fa = result.ideas.map(safeFollowupText).join('\\n');
        } else {
          // fall back to pick readable fields or stringify
          const candidate = result.answer || result.text || result.summary || result.explanation;
          fa = (candidate && typeof candidate === 'string') ? candidate : safeFollowupText(result);
        }

        sendResponse({ ok: true, followup_answer: fa, message: fa });

        return;
      }
    } catch (err) {
      console.error("background unexpected error:", err);
      sendResponse({ ok: false, error: "background_exception", trace: String(err) });
      return;
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "clarity_explain", title: "Explain with Clarity", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "clarity_explain" && info.selectionText) {
    try {
      const payload = { text: info.selectionText, mode: detectType(info.selectionText) };
      const resp = await callBackend(payload);
      resp.original_text = info.selectionText;
      chrome.tabs.sendMessage(tab.id, { type: "EXPLAIN_RESULT", ok: true, ...resp });
    } catch (e) {
      chrome.tabs.sendMessage(tab.id, { type: "EXPLAIN_RESULT", ok: false, error: e.message });
    }
  }
});