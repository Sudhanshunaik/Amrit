# 🌊 Project Amrit: Ecosystem Dashboard

> **An Environmental Monitoring & Ecosystem Dashboard built to track, protect, and analyze traditional Goan Khazan "Manas" (Sluice gate) ecosystems.**

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-v5-purple.svg)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4.svg)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E.svg)](https://supabase.io/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-2.0_Flash-orange.svg)](https://deepmind.google/technologies/gemini/)

Project Amrit acts as a digital guardian for the intricate and ancient agricultural systems in Goa. These systems rely on precise water management via sluice gates, which are often subject to illegal tampering. This dashboard delivers real-time analysis of vital water statistics (salinity, tidal pressure) and instantly detects **sabotage** (the illicit removal of wooden planks to cause artificial flooding) using autonomous Voice and Vision AI agents.

---

## ✨ Core Features & Data Flows

### 👁️ The Vision Agent (Live Sabotage Detection)
An autonomous background security scanner that doesn't rely on human interaction.
* **Live Surveillance:** Taps into hardware (e.g., DroidCam streams) to capture the environment.
* **AI Processing:** Every 5 seconds, it extracts a frame and posts it to an n8n webhook. n8n orchestrates this by feeding the image to **Google Gemini 2.0 Flash** to evaluate structural integrity and check for breached sluice gates.
* **Instant Alert System:** If Gemini detects an anomaly, a JSON payload commands the frontend to trigger a high-priority, red-alert Lockdown UI overlay across all connected dashboards.

### 🎙️ Multimodal Voice & Chat Agents (Farmer Dictation)
Democratizing access to ecosystem data through native voice and global chat interactions.
* **Hands-Free Observations:** Local farmers can use a microphone to record voice observations in regional languages (like Konkani).
* **Automated Data Mapping:** Raw audio (`.webm`) is processed via n8n and AI to extract environmental metrics (e.g., acidity, temperature) and directly update dashboard widgets.
* **Global Chatbot:** A Floating Action Button (FAB) enables conversations focused on Khazan agriculture, subsidies, and hydro-dynamics.
* **Graceful Degradation:** A resilient frontend fallback mechanism ensures that if API timeouts occur, the UI gracefully falls back to mock data (e.g., localized Konkani weather advisory) without crashing.

### ⚡ Real-Time Data & Event-Driven Architecture
* **Supabase Integration:** Real-time data sync using WebSocket channels. When environmental metrics change in the database, the UI updates instantly without polling.
* **n8n Orchestration Layer:** Instead of tightly coupling AI API calls to the frontend, an event-driven neural network using n8n acts as the API router.

---

## 🏗️ Tech Stack

* **Frontend:** React 18, Vite, Tailwind CSS v4
* **UI/UX:** Google Stitch (for foundational design tokens and glass-morphic UI components)
* **Mobile Wrap:** Capacitor (for iOS & Android deployment)
* **Backend Automation:** n8n
* **Database:** Supabase (PostgreSQL)
* **Artificial Intelligence:** Google Gemini 2.0 / 3.0 Flash, Whisper (Transcription)

---

## 🚀 Running Locally

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd "stitch_amrit_ecosystem_dashboard (6)/frontend"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the frontend directory with your Supabase keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_key
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```

5. **n8n Setup:**
   Ensure your cloud n8n workflows are set to _Active_ so the Vite proxy properly forwards requests to `/webhook/`.

---

## 📌 Architectural Quirks & Notes

* **Monolithic DOM Injection:** The UI was rapidly prototyped using Google Stitch. To avoid complete rebuilds, `App.jsx` dynamically binds listeners to the raw HTML loaded into the DOM. Modifying class names directly in the template HTML may break existing query selectors.
* **Vite CORS Proxy:** To securely connect the browser and the n8n cloud instance without CORS preflight limits, Vite proxies all `/api/n8n` requests directly to the production server.
* **Hardware Availability:** If the Vision feed remains blank, ensure browser camera permissions are granted and the source (like DroidCam) is active (`window.amritIsLiveActive = true`).

---
*Built with ❤️ for the protection of Goan traditional farming ecosystems.*
