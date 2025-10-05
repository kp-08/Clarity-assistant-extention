// content.js - Reset: selection toolbar with Explain, Rephrase, Action List, Brainstorm
let toolbarEl = null;

document.addEventListener('mouseup', async (e) => {
  const sel = window.getSelection().toString().trim();
  if (!sel) { removeToolbar(); return; }
  chrome.storage.sync.get({ sendToBackend: false }, (items) => {
    if (!items.sendToBackend) {
      showConsentNotice(e.clientX, e.clientY);
      return;
    }
    const ctx = { url: location.href, title: document.title, surrounding: getSurroundingText() };
    showToolbarAt(e.clientX + 8, e.clientY + 8, sel, ctx);
  });
});

function getSurroundingText() {
  try {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    if (!node) node = document.body;
    const text = node.innerText || node.textContent || '';
    return text.trim().slice(0, 800);
  } catch (e) {
    return '';
  }
}

function showConsentNotice(x,y){
  removeToolbar();
  toolbarEl = document.createElement('div');
  toolbarEl.style = 'position:fixed;left:'+x+'px;top:'+y+'px;z-index:2147483647;padding:8px;border-radius:6px;background:#fff;color:#111;box-shadow:0 4px 14px rgba(0,0,0,.2);font-family:Arial;font-size:13px;max-width:360px;';
  toolbarEl.innerHTML = `
    <div style="margin-bottom:8px">Enable sending text in <b>Clarity Assistant</b> options to use <b>Explain</b>.</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="clarity-enable-btn" style="padding:6px 10px;border-radius:6px;cursor:pointer">Enable</button>
      <button id="clarity-options-btn" style="padding:6px 10px;border-radius:6px;cursor:pointer;background:#f3f3f3">Options</button>
      <span id="clarity-status" style="margin-left:8px;color:#666;font-size:12px"></span>
    </div>
  `;
  document.body.appendChild(toolbarEl);

  const enableBtn = toolbarEl.querySelector('#clarity-enable-btn');
  const optionsBtn = toolbarEl.querySelector('#clarity-options-btn');
  const statusSpan = toolbarEl.querySelector('#clarity-status');

  chrome.storage.sync.get({ sendToBackend: false }, (items) => {
    statusSpan.textContent = items.sendToBackend ? "Enabled" : "Not enabled";
    if (items.sendToBackend) {
      enableBtn.textContent = "Enabled";
      enableBtn.disabled = true;
    }
  });

  enableBtn.addEventListener('click', () => {
    chrome.storage.sync.set({ sendToBackend: true }, () => {
      statusSpan.textContent = "Enabled";
      enableBtn.textContent = "Enabled";
      enableBtn.disabled = true;
      const t = document.createElement('div'); t.textContent = "Clarity enabled"; t.style='position:fixed;right:18px;top:18px;background:#fff;padding:8px;border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:2147483648;';
      document.body.appendChild(t); setTimeout(()=>t.remove(),2000);
    });
  });

  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'), '_blank');
    }
  });

  setTimeout(()=>removeToolbar(),12000);
}

function showToolbarAt(x,y,selectedText, context){
  removeToolbar();
  toolbarEl = document.createElement('div');
  toolbarEl.style = `position:fixed;left:${x}px;top:${y}px;z-index:2147483647;padding:6px;border-radius:8px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:Arial;font-size:13px;display:flex;gap:6px;`;
  const actions = [
    { id: 'explain', label: 'Explain' },
    { id: 'rephrase', label: 'Rephrase' },
    { id: 'action_list', label: 'Action list' },
    { id: 'brainstorm', label: 'Brainstorm' }
  ];
  actions.forEach(a=>{
    const btn = document.createElement('button');
    btn.textContent = a.label;
    btn.style = 'padding:6px 10px;border-radius:6px;';
    btn.onclick = () => { callExplainAPI(selectedText, context, a.id); removeToolbar(); };
    toolbarEl.appendChild(btn);
  });
  document.body.appendChild(toolbarEl);
}

function removeToolbar(){ if(toolbarEl){ toolbarEl.remove(); toolbarEl = null; } }

async function callExplainAPI(text, context, action='explain'){
  try{
    showTempToast("Asking Clarity Assistant...");
    chrome.runtime.sendMessage({ type: "EXPLAIN_REQUEST", text, context, action }, (resp) => {
      if (chrome.runtime.lastError) {
        console.error("sendMessage error:", chrome.runtime.lastError.message);
        showResultPopup("Extension background is unavailable: " + chrome.runtime.lastError.message);
        return;
      }
      if (!resp) {
        showResultPopup("No response from background");
        return;
      }
      if (resp.ok) {
        renderStructuredResult(resp);
      } else {
        showResultPopup("Error: " + (resp.error || "Unknown") + (resp.trace ? (" - " + resp.trace) : ""));
      }
    });
  }catch(err){
    showResultPopup("Error calling explain API: " + err.message);
  }
}

function renderStructuredResult(resp){
  const latencyHtml = resp.latency_ms ? `<div style="font-size:12px;color:#94a3b8">latency: ${resp.latency_ms} ms</div>` : "";
  const confidence = (typeof resp.confidence === 'number') ? Math.round(resp.confidence*100) + "%" : "";
  const header = `<div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:15px">Clarity Assistant</strong><div style="font-size:12px;color:#94a3b8">${confidence} ${latencyHtml}</div></div>`;

  const summary = `<div style="margin-top:10px;font-size:14px;color:#0b1220">${escapeHtml(resp.summary || resp.rephrase || resp.explanation || '')}</div>`;
  const implication = resp.implication ? `<div style="margin-top:8px;color:#334155"><em>Why it matters:</em> ${escapeHtml(resp.implication)}</div>` : "";
  let actionsHtml = "";
  let actionsList = Array.isArray(resp.actions) ? resp.actions.slice() : [];
  if (!actionsList.length) {
    actionsList = [
      { title: "Rephrase for layperson", importance: 3, cmd: "rephrase:layperson" },
      { title: "Generate action list", importance: 4, cmd: "action_list" },
      { title: "Brainstorm 5 ideas", importance: 2, cmd: "brainstorm:5" }
    ];
  }
  if (actionsList.length){
    actionsHtml = '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px">';
    actionsList.slice(0,5).forEach((a,idx)=>{
      const importance = (a && a.importance) || 3;
      const bg = importance >=4 ? '#1f6feb' : (importance===3? '#4b5563' : '#6b7280');
      const title = (a && (a.title || a.name)) || ('Action '+(idx+1));
      actionsHtml += `<button class="clarity-action-chip" data-idx="${idx}" style="background:${bg};color:#fff;border:none;padding:6px 10px;border-radius:999px;cursor:pointer">${escapeHtml(title)}</button>`;
    });
    actionsHtml += '</div>';
  }

  const followupsHtml = (Array.isArray(resp.followups) && resp.followups.length) ?
    `<div style="margin-top:10px"><strong>Follow-ups</strong><ul>${resp.followups.slice(0,4).map(f=>'<li style="color:#334155">'+escapeHtml(f)+'</li>').join('')}</ul></div>` : "";

  const entitiesHtml = (Array.isArray(resp.entities) && resp.entities.length) ?
    `<div style="margin-top:10px"><strong>Entities</strong><div style="color:#334155">${resp.entities.map(ent=>escapeHtml(ent.text+' ('+ent.label+')')).join(', ')}</div></div>` : "";

  const bodyHtml = header + summary + implication + actionsHtml + followupsHtml + entitiesHtml;
  showResultPopup(bodyHtml, resp, actionsList);
}

function showResultPopup(html, resp=null, actionsList=null){
  const existing = document.getElementById("clarity-assistant-popup");
  if (existing) existing.remove();

  const p = document.createElement('div');
  p.id = "clarity-assistant-popup";
  p.style = `
    position:fixed;
    right:18px;
    bottom:18px;
    z-index:2147483647;
    background: #ffffff;
    color: #0b1220;
    padding:14px;
    border-radius:12px;
    box-shadow:0 10px 30px rgba(2,6,23,0.06);
    max-width:520px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    font-size:14px;
    line-height:1.45;
  `;

  // header with close and pin
  const headerHtml = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="font-size:15px">Clarity Assistant</strong>
      <div style="display:flex;align-items:center;gap:8px">
        <button id="clarity-pin" title="Keep popup open" style="background:#e2e8f0;border:none;padding:6px 8px;border-radius:6px;cursor:pointer">Pin</button>
        <button id="clarity-close" title="Close" style="background:transparent;border:none;font-size:16px;cursor:pointer">✕</button>
      </div>
    </div>
  `;

  p.innerHTML = headerHtml + `<div id="clarity-popup-content">${html}</div>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button id="clarity-copy" style="padding:6px 10px;border-radius:8px;background:#0f172a;color:#fff;border:none;cursor:pointer">Copy</button>
      <button id="clarity-save" style="padding:6px 10px;border-radius:8px;background:#e2e8f0;color:#0b1220;border:none;cursor:pointer">Save</button>
    </div>
  `;
  document.body.appendChild(p);

  // click outside to close (non-intrusive)
  function outsideClickHandler(ev){
    if (!p.contains(ev.target) && !p._pinned) {
      removePopup();
    }
  }
  document.addEventListener('mousedown', outsideClickHandler);

  // remove popup helper
  function removePopup(){
    if (p && p.parentNode) p.parentNode.removeChild(p);
    document.removeEventListener('mousedown', outsideClickHandler);
  }

  // pin toggle
  const pinBtn = p.querySelector('#clarity-pin');
  pinBtn.addEventListener('click', () => {
    p._pinned = !p._pinned;
    pinBtn.textContent = p._pinned ? "Pinned" : "Pin";
    pinBtn.style.background = p._pinned ? "#1f6feb" : "#e2e8f0";
    pinBtn.style.color = p._pinned ? "#fff" : "#0b1220";
  });

  // close button
  p.querySelector("#clarity-close").onclick = () => removePopup();

  p.querySelector("#clarity-copy").onclick = () => {
    const text = p.querySelector("#clarity-popup-content").innerText;
    navigator.clipboard.writeText(text).then(()=> {
      p.querySelector("#clarity-copy").innerText = "Copied";
      setTimeout(()=> p.querySelector("#clarity-copy").innerText = "Copy", 1200);
    });
  };
  p.querySelector("#clarity-save").onclick = () => {
    const entry = { ts: Date.now(), text: p.querySelector("#clarity-popup-content").innerText, meta: resp && {type: resp.type, url: (resp.original_url||''), title:(resp.original_title||'')} };
    const hist = JSON.parse(localStorage.getItem("clarity_history_v1") || "[]");
    hist.unshift(entry);
    localStorage.setItem("clarity_history_v1", JSON.stringify(hist.slice(0,50)));
    p.querySelector("#clarity-save").innerText = "Saved";
    setTimeout(()=> p.querySelector("#clarity-save").innerText = "Save", 1200);
  };

  // action chips wiring (unchanged)
  const chips = p.querySelectorAll(".clarity-action-chip");
  chips.forEach(ch => ch.addEventListener('click', (ev) => {
    const idx = Number(ch.dataset.idx || 0);
    const action = (actionsList && actionsList[idx]) || null;
    if (!action) return;
    chrome.runtime.sendMessage({ type: "ACTION_INVOKE", idx, original_text: resp && resp.original_text, actions: actionsList, action_cmd: action.cmd }, (r) => {
      if (!r) return;
      const fa = r.followup_answer || r.message || r.error || null;
      if (fa) {
        const followupDiv = document.createElement('div');
        followupDiv.style = "margin-top:10px;color:#0b1220;background:#f1f5f9;padding:8px;border-radius:8px";
        followupDiv.textContent = fa;
        p.querySelector("#clarity-popup-content").appendChild(followupDiv);
      }
    });
  }));

  // auto-close timer (30s) unless pinned
  let closeTimeout = setTimeout(()=> { if (!p._pinned) removePopup(); }, 30000);
  // if pinned, keep; if user unpins later, start timer again
  pinBtn.addEventListener('click', () => {
    if (!p._pinned) {
      // just unpinned — restart timer
      clearTimeout(closeTimeout);
      closeTimeout = setTimeout(()=> { if (!p._pinned) removePopup(); }, 30000);
    } else {
      // pinned — cancel timeout
      clearTimeout(closeTimeout);
    }
  });
}


function showTempToast(msg){
  const t = document.createElement('div');
  t.style = 'position:fixed;right:18px;top:18px;z-index:2147483647;background:#fff;padding:8px;border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.12);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}

function escapeHtml(s){ return (''+s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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


// receive messages from background (context menu flow)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "EXPLAIN_RESULT") {
    if (msg.ok) {
      renderStructuredResult(msg);
    } else {
      showResultPopup("Error: " + (msg.error || "unknown"));
    }
  }
});