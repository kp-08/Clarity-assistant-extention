# Clarity Assistant — Smart Screen Assistant 🔍✨

[![Python](https://img.shields.io/badge/python-3.13-blue)](https://www.python.org/)
[![Cerebras](https://img.shields.io/badge/Cerebras-green.svg)](https://cloud.cerebras.ai)
[![Status](https://img.shields.io/badge/status-Prototype-orange)]()


> Turn any selected text on the web into instant clarity: explain, rephrase, extract actions, or brainstorm next steps — without sending your API keys to third parties.

---

## Table of contents

* [Elevator pitch](#elevator-pitch)
* [Why this project ](#why-this-project)
* [Features](#features)
* [Tech & architecture overview](#tech--architecture-overview)
* [Quick start — run locally (developer-friendly)](#quick-start--run-locally-developer-friendly)
* [Deployment & production notes (Cerebras Cloud + Meta Llama 4 Maverick)](#deployment--production-notes-cerebras-cloud--meta-llama-4-maverick)
* [Roadmap & future features](#roadmap--future-features)
* [Troubleshooting & FAQs](#troubleshooting--faqs)
* [Credits](#Credits)

---

## Elevator pitch

Clarity Assistant is a browser extension + local backend that extracts meaning and *next actions* from any selected text on the web. It helps users move from reading to doing by offering four instant actions: **Explain**, **Rephrase**, **Action list**, and **Brainstorm** — all powered by fast hosted LLMs while keeping API keys and sensitive data server-side.

---

## Why this project 

* **Problem:** People waste time extracting core meaning and next steps from dense text (papers, docs, email, terms & conditions).
* **Solution:** One-tap selection toolbar that returns clear, context-aware outputs and suggested follow-ups — ideal for students, product teams, and researchers.
* **What makes it stand out:**

  * **Local-first privacy** — keys never live on the client.
  * **Low-latency inference** — designed to use high-throughput inference clouds (Cerebras Cloud) and powerful multimodal models (Meta Llama 4 Maverick) for crisp, fast responses.
  * **Polished UX ** — minimal friction demo flow and measurable win conditions (latency, privacy, usefulness).

---

## Features

* **Selection toolbar (inline):** Explain | Rephrase | Action list | Brainstorm.
* **Context-aware analysis:** captures page title, surrounding paragraph, and URL to improve relevance.
* **Follow-up suggestions:** intelligent follow-ups to deepen exploration.
* **Pin & save results:** local history (IndexedDB/localStorage) to revisit earlier analyses.
* **Local-first backend:** server-side proxy keeps API keys safe; easily swap model providers.
* **Fallback summarizer:** secondary summarizer when model calls fail.
* **Extensible provider layer:** drop-in adapters for Cerebras, HuggingFace, OpenRouter, or on-prem endpoints.

---

## Tech & architecture overview

**High-level components**

1. **Chrome Extension (MV3)** — content scripts render the inline selection toolbar and capture selected text.
2. **Extension UI** — popup + small modal for reviewing/pinning results and browsing history.
3. **Local backend (server)** — receives selection payloads from the extension and proxies requests to model providers (keeps API keys server-side).
4. **Model provider adapter** — modular adapter layer that can call Cerebras Cloud, Hugging Face, or other providers.
5. **Local storage** — history, pins, and user settings stored client-side in IndexedDB.

```
[Browser (Extension)] <---> [Local Backend (FastAPI / Express)] <---> [Model Provider (Cerebras / Llama4 / HF)]
                                  |
                                  +--> [Local DB (history)]
```

**Where logic lives**

* *Client/Extension:* UI rendering, selection heuristics, UX interactions.
* *Backend:* request routing, provider credential storage, response post-processing (safety trimming, token limits).
* *Provider:* inference (Cerebras Cloud is recommended for the lowest latency; Llama 4 Maverick for multimodal reasoning).

**Repo structure (high-level)**

```
/clarity-assistant       # Browser extension (content scripts, UI)
/backend                 # Local-first backend (API proxy + provider adapters)                 # images, demo GIFs
/README.md               
```

---

## Quick start — run locally (developer-friendly)

> These steps assume a UNIX-like terminal. Replace `python` with `python3` on some systems.

### 1) Clone

```bash
git clone https://github.com/kp-08/Clarity-assistant-extention.git
cd Clarity-assistant-extention
```

### 2) Backend (local server / proxy)

> The project uses a local-first backend to store API keys and to avoid shipping secrets inside the extension.

```bash
cd backend
# create & activate venv (optional but recommended)
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
# install requirements (create requirements.txt if missing)
pip install -r requirements.txt
# set the provider API key (example: Cerebras Cloud)
create .env file with refrence of .env.example
# start the server (adjust command to your backend: main.py, app.py, or uvicorn)
python app.py
```

### 3) Load the extension locally (Chrome)

1. Open `chrome://extensions/` → Toggle **Developer mode** → **Load unpacked** → choose the `clarity-assistant` folder.
2. Open any web page, select some text, and try the inline toolbar.

### 4) Troubleshooting quick checks

* Check that backend is running at `http://localhost:8000` and CORS (if used) allows extension origin.
* Open browser DevTools → Console (content script errors) and Network (XHR to backend).

---

## Deployment & production notes (Cerebras Cloud + Meta Llama 4 Maverick)

This project is designed to support **fast, low-latency inference** by using high-throughput inference clouds. Two recommended components:

### Why Cerebras Cloud?

* Cerebras Cloud offers extremely fast inference and an easy REST/SDK interface for hosting open models and private models. Use it when you need the lowest possible latency for a public demo or live hackathon run.
* Quickstart (example) shows how to set `CEREBRAS_API_KEY` and call their Python SDK. Place keys in the backend and never in the extension client.

**Example (Python)**

```python
# install: pip install --upgrade cerebras_cloud_sdk
import os
from cerebras.cloud.sdk import Cerebras
client = Cerebras(api_key=os.environ.get("CEREBRAS_API_KEY"))
resp = client.chat.completions.create(
    messages=[{"role":"user","content":"Summarize this text"}],
    model="llama-4-scout-17b-16e-instruct"  # or a Maverick model id (provider-specific)
)
print(resp)
```

> Keep API keys server-side; use short-lived tokens if possible for production.

### Why Meta Llama 4 Maverick?

* Llama 4 Maverick is Meta’s natively-multimodal Mixture-of-Experts model offering strong text+image reasoning and long-context capabilities — ideal for richer analyses in a demo where images or complex instructions are involved.
* Model IDs and availability vary by provider — check provider docs (Cerebras / Hugging Face / Oracle / Cloud offering) and use the adapter layer in `backend/` to swap providers without changing client code.

**Provider adapter design**

* `backend/adapters/cerebras_adapter.py` — talks to Cerebras API (keeps API keys secure).
* `backend/adapters/hf_adapter.py` — optional Hugging Face / OpenRouter fallback.

**Scaling & cost**

* For hackathon demo: provision a small Cerebras endpoint for a few minutes of active demonstration to minimize cost and maximize speed.
* For extended demos consider batching and caching common prompts.

---

##

---

## Roadmap & future features

* Better heuristics for detecting composition contexts (Gmail compose vs Google Doc vs Notion).
* Selection mini-toolbar (floating bubble near a selection).
* Dark-mode & accessibility improvements.
* Personalization (user voice, tone) and multi-lingual rephrasing.
* On-device lightweight models for offline fallback.
* Database connectivity to revisit the searches

---

## Troubleshooting & FAQs

**Q: The toolbar doesn’t show up on some sites.**
A: Sites with highly-protected CSP or cross-origin restrictions may block content scripts — try the page in a new tab or test on `example.com`.

**Q: I see 401 from provider.**
A: Ensure backend has the correct API key in environment variables and that your provider account is active.

**Q: How do I swap model providers?**
A: Update the `PROVIDER` setting in your backend `.env` and add credentials for the chosen provider. The adapter layer will handle differences.

---

## Contributing

* Create an issue for features/bugs.
* Fork → branch named `feature/<short-desc>` → PR with description and demo GIF.
* Keep UX polished: each PR should include at least one screenshot or short GIF for UI changes.

---

## Credits

* **Credits:** Built with ❤️ by the Clarity Assistant team. Uses open models and public SDKs where applicable.

---

## Appendix — Useful env vars & example endpoints

```
# Backend env
CEREBRAS_API_KEY=...
PROVIDER=cerebras
BACKEND_PORT=8000

# Example backend endpoints
POST /api/analyze    # payload: {text, url, title, action}
GET  /api/history

# Example response format
{
  "summary": "...",
  "actions": ["..."],
  "notes": "..."
}
```

---

If you want, I can:

* Turn this into a `README.md` and open a PR, or
* Generate demo GIF placeholder assets and a short `presentation.md` for the judges.

Good luck at the hackathon — you nailed the hard UX bits. 🚀

