# 🌊 Project Amrit: Ecosystem Dashboard

Project Amrit is an Environmental Monitoring & Ecosystem Dashboard built to track, protect, and analyze traditional **Goan Khazan "Manas" (Sluice gate) ecosystems**. 

Created as a comprehensive hackathon project, the primary goal of Amrit is to deliver real-time analysis of vital water statistics (salinity, tidal pressure) and instantly detect **sabotage** (the illicit removal of wooden planks to cause artificial flooding) using autonomous Voice and Vision AI agents.

## 🎯 Vision & Purpose
The Khazan ecosystems in Goa are intricate, ancient agricultural systems heavily reliant on precise water management via sluice gates. Unfortunately, these gates are often subject to illegal tampering to manipulate fish catches or flood lands. 

Project Amrit acts as a digital guardian:
1. **Live Sabotage Detection:** Continuously monitoring camera feeds to identify if planks are actively being removed.
2. **Farmer Inclusivity:** Allowing local farmers to dictate their observations naturally in regional languages (like Konkani), which are then translated and mapped directly to dashboard statistics.
3. **Instant Alerts:** Pushing immediate updates to all connected dashboards to notify communities of security breaches.

---

## 🏗️ Architecture & Tech Stack

Project Amrit utilizes a modern, hyper-integrated tech stack spanning from local hardware to cloud AI networks.

### Frontend & Mobile
*   **React 18 & Vite:** Lightning-fast frontend tooling and component rendering.
*   **Tailwind CSS v4:** Utility-first styling for the entire dashboard setup.
* **Capacitor:** Implemented to wrap the web dashboard into native iOS and Android applications securely.
*   **Google Stitch UI:** The core aesthetic and initial HTML prototype was generated via Google Stitch, which was subsequently monolithic-injected into `App.jsx` for rapid iteration.

### Backend, Database, & Workflows
*   **n8n (Workflow Automation):** Acts as the primary backend logic controller and API router, avoiding the need for a custom Node.js server.
*   **Supabase (PostgreSQL):** Handles structural data storage (farmer profiles, weather data, historical sabotage alerts) with real-time WebSocket capabilities.

### Artificial Intelligence
*   **Google Gemini 3.1 Pro:** Drives the core analytical logic. It takes raw visual frames and determines anomalies, and structures raw agricultural speech into defined JSON schemas.
*   **Whisper:** Expected transcription engine for converting multi-lingual voice recordings to text.

---

## ⚙️ Core Features & Data Flows

### 1. The Vision Agent (Live Surveillance)
The Vision Agent autonomously monitors connected hardware (e.g., DroidCam streams).
*   Every 5 seconds, an invisible `<canvas>` element extracts a Base64 `.jpeg` frame from the active video feed.
*   The frame is pushed to a dedicated n8n webhook (`/api/n8n/webhook/vision-frame`).
*   n8n routes the frame to Google Gemini with the prompt: *"Are planks actively being removed? Reply strictly TRUE or FALSE."*
*   If the agent returns `TRUE`, the frontend dynamically injects an `amrit-anomaly-active` CSS class, immediately turning the UI red and displaying a **"SECURITY BREACHED"** warning.

### 2. The Voice Agent (Farmer Dictation)
Local farmers can interact hands-free with the dashboard.
*   The user taps the microphone button, initiating the `MediaRecorder API` to record an audio stream.
*   The raw `.webm` buffer is sent to n8n (`/api/n8n/webhook/free-voice-agent`).
*   AI agents transcribe the audio (incorporating regional Konkani contexts) and extract structured environmental metrics (e.g., acidity, temperature).
*   The response payload automatically maps the extracted data to specific UI nodes on the dashboard without manual data entry.

### 3. Vite CORS Proxy
To eliminate cross-origin restrictions between the browser and the n8n cloud instance, Vite inherently proxies all `/api/n8n` requests directly to the production tracking server. This secures API keys and allows smooth browser-to-webhook communication.

---

## 🛠️ Project Structure

*   **/frontend**: Contains the entire React application, Capacitor configurations, and Vite logic.
    *   `src/App.jsx`: The monolith controller that manages DOM injections, camera state, voice recording, and AI polling loops.
    *   `src/db/dataService.js`: Supabase interaction wrapper handling database pulls and active subscriptions.
*   **/stitch_amrit_ecosystem_dashboard**: The historical, raw HTML artifacts and mockups originally exported from Google Stitch.
*   **/android & /ios**: Native Capacitor generation targets (git-tracked).

---

## 🚀 Running Locally

1. **Prerequisites:** Ensure you have Node.js and npm installed.
2. **Setup:**
   ```bash
   cd frontend
   npm install
   ```
3. **Environment Setup:** Make sure Supabase keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are present in `.env`.
4. **Development Server:**
   ```bash
   npm run dev
   ```
5. **n8n Connectivity:** Ensure your cloud n8n workflows are set to _Active_ (not just testing mode) so that standard Webhook nodes trigger properly when the Vite proxy calls `/webhook/`.

## 📌 Known Architectural Quirks
*   **DOM Injection Pipeline:** Since `App.jsx` dynamically binds listeners to raw HTML loaded into the DOM, modifying class names directly in the template HTML may break existing query selectors.
*   **Hardware Availability:** If the Vision feed remains blank, verify that the browser has been granted camera permissions and that the designated feed (like DroidCam) is active and transmitting.

---
*Built with ❤️ for the protection of Goan traditional farming ecosystems.*
