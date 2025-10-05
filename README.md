# Clarity Assistant — Smart Screen Assistant 🔍✨

[![Python](https://img.shields.io/badge/python-3.13-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-Prototype-orange)]()

> **Clarity Assistant** extracts meaning and next actions from any selected text on the web.  
> Inline toolbar → Explain | Rephrase | Action list | Brainstorm. Local-first backend keeps API keys safe.

<p align="center">
  <!-- Replace docs/demo.gif with your actual gif path -->
  <img src="docs/demo.gif" alt="Demo" width="720" />
</p>

---

## Table of contents
- [Why Clarity Assistant?](#why-clarity-assistant)
- [Features](#features)
- [Quick start (local)](#quick-start-local)
- [How it works (architecture)](#how-it-works-architecture)
- [Usage examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License & Credits](#license--credits)
- [Contact](#contact)

---

## Why Clarity Assistant?
Long, dense, or technical text is everywhere — research papers, contracts, documentation. Clarity Assistant helps users instantly:
- Understand the core idea (concise summary).
- Generate concrete next steps (action lists).
- Rephrase for different audiences.
- Brainstorm ideas from context.

It’s useful for students, product teams, lawyers, and anyone who needs to turn reading into action.

---

## Features
- ✅ Selection toolbar: **Explain | Rephrase | Action list | Brainstorm**  
- ✅ Context-aware analysis (captures page title & surrounding text)  
- ✅ Follow-up suggestions (questions to deepen exploration)  
- ✅ Pin & save results locally (history)  
- ✅ Local-first backend (Cerebras by default) — API keys kept server-side  
- ✅ Fallback summarizer when model output fails  
- ✅ Extensible: drop-in support for other model providers

---

## Quick start (local)
**Requirements**
- Python 3.10+ (3.13 recommended)
- Chrome (for MV3 extension testing)

1. Clone the repo:
```bash
git clone https://github.com/<your-username>/clarity-assistant.git
cd clarity-assistant
