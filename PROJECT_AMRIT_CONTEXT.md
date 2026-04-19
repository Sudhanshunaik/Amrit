# 🌊 PROJECT AMRIT: Full Architecture & Context Guide

This document is specifically formatted to provide absolute context to any AI IDE (Cursor, GitHub Copilot, ChatGPT, Claude) working on this repository. 

## 1. Project Overview & Persona
- **Project Name:** Project Amrit
- **Domain:** Environmental Monitoring & Ecosystem Dashboard.
- **Specific Focus:** Monitoring traditional **Goan Khazan "Manas"** (Sluice gate) ecosystems.
- **Goal:** Real-time analysis of salinity, tidal pressure, and sabotage (illicit removal of wooden planks to cause flooding) using autonomous Voice and Vision AI agents.
- **UI Architecture:** The original UI was generated using Google Stitch. To avoid rebuilding the massive HTML layout, the React application uses a monolithic injection script inside `App.jsx` to dynamically attach AI listeners, buttons, and state logic on top of the static Stitch markup.

## 2. Tech Stack
- **Frontend Framework:** React 18, Vite
- **Styling:** TailwindCSS v4 (note: standard PostCSS configuration is bypassed, using Tailwind 4 Vite plugin).
- **Backend/Routing:** n8n (No-code automation platform) acts as the API backend.
- **AI Models:** Google Gemini 2.0/3.0 Flash (Vision/Text logic), Whisper (Audio transcription).
- **Database:** Supabase (PostgreSQL).

## 3. Core Features & Data Flows

### A. The Vision Agent (Live Sabotage Detection)
- **File Location:** `frontend/src/App.jsx`
- **Objective:** Detect if illegal tampering (plank removal) is occurring at the sluice gate.
- **How it works (Frontend):** 
  - Features a custom **Camera Selector** that discovers connected hardware (specifically targeting `DroidCam` for hackathon demos).
  - Renders the video into a hidden `<canvas>`, extracts a Base64 `.jpeg`, and pushes it to n8n via a polling loop every 5 seconds.
  - If n8n returns `TRUE`, the frontend dynamically injects a red pulsing `amrit-anomaly-active` CSS class, overriding the UI to display **"SECURITY BREACHED"**.
- **How it works (n8n Webhook):**
  - **Endpoint:** `POST /api/n8n/webhook/vision-frame`
  - Parses the Base64, cleans the header, converts to binary for Gemini.
  - Gemini Prompt: *"Are planks actively being removed? Reply strictly TRUE or FALSE."*
  - **Critical Setup:** Webhook `responseMode` MUST be set to `lastNode` so the exact text output of Gemini flows directly back to the `await fetch()` in React.

### B. The Voice Agent (Farmer Dictation)
- **File Location:** `frontend/src/App.jsx`
- **Objective:** Allow local farmers to press a microphone button, speak observations (e.g., "The water is highly acidic today and temperature feels high"), and have those stats update on the dashboard.
- **How it works:**
  - Uses `MediaRecorder API` to record audio chunks.
  - Converts the `.webm` audio buffer to Base64 and posts to `POST /api/n8n/webhook/free-voice-agent`.
  - Expects a JSON response mapping the NLP data back to specific UI dashboard IDs (e.g., updating `<p id="water-acidity">`).

### C. The Vite Proxy (CORS Bypass)
- **File Location:** `frontend/vite.config.js`
- **Architecture:** The Vite development server inherently proxies all `/api/n8n` requests directly to `https://sudhanshunaik647.app.n8n.cloud` with `changeOrigin: true`. This circumvents all CORS restrictions and allows the browser to securely talk to the n8n cloud workflows without preflight limits.

### D. Supabase Integration
- Tracks `sabotage_alerts` triggered by either the Voice or Vision agents.

## 4. Known Gotchas & Architectural Quirks
1. **DOM Injection Pipeline:** Because the base UI is a monolithic imported string, `App.jsx` runs rigorous `document.querySelector` sweeps to find raw HTML elements. Modifying class names directly in the HTML will break the Javascript event listeners.
2. **Video Element z-index:** If the live camera feed appears blank, ensure `window.amritIsLiveActive = true` is respected, because the anomaly script (`activateAnomaly()`) attempts to overwrite the camera feed with a mock `vision-feed.mp4` otherwise.
3. **Webhook Testing:** Hitting "Test Workflow" in n8n spins up a different URL (`/webhook-test/`). The Vite config maps directly to `/webhook/` (Production). Any new node adjustments in n8n require the workflow to be set to **Active** to receive the dashboard payloads.

## 5. Next Steps for Development (To-Do)
- Map the parsed Voice Agent JSON payload directly into the top row statistical widgets.
- Finalize Supabase WebSocket real-time subscription so if another dashboard updates the security status, this local dashboard mirrors it.
