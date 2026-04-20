# Project Amrit: Technical Specification & Architecture Blueprint

## 1. Project Overview
* **Project Name:** Project Amrit
* **Context:** An AI-native, B2G agritech platform designed to protect Goa's 3,500-year-old Khazan wetlands and assist aging *mittkaars* (salt makers) in accessing the ₹1 Lakh Amrit Kaal Agriculture Policy grants.
* **Architecture Strategy:** "Zero-Cost Bootstrapper Stack" — Maximizing government ROI by utilizing free-tier AI APIs, local workflow orchestration, and native device hardware.
* **Visual Style:** "Modern Goan Heritage" Accessible Light Mode. High contrast, large typography, and Azulejo tile geometric watermarks designed specifically for users with declining vision and digital literacy.
* **Localization:** Goan Konkani (Devanagari script) with phonetic rendering via native Android Marathi TTS engines.

## 2. The Core Stack
* **Frontend:** React / HTML5 generated via Google Stitch, wrapped for mobile via Capacitor.
* **IDE & Agentic Orchestration:** Google Antigravity (using Gemini 3.1 Pro worker agents).
* **Backend Logic & API Routing:** n8n (running locally for zero-latency hackathon demos).
* **Database (Real-time):** Supabase (Free Tier - replacing Firestore).
* **AI Engine:** Google AI Studio (Gemini 1.5 Flash for Vision & Voice RAG).

---

## 3. Screen Inventory & Agentic Mapping

### 3.1 Ecosystem Guardian Dashboard (Mobile)
* **Primary Data Points:** * `tide_status`: High/Low tide cycles.
  * `weather_widget`: Hyper-local temperature, cloud cover, and wind speed.
  * `evaporation_score`: Calculated brine readiness (0-100 scale).
* **Backend Requirements:** n8n webhook pulling from OpenWeather One Call API 3.0, updating the UI payload.

### 3.2 Vision Agent (Sluice Gate Sentinel)
* **Primary Features:** Anti-sabotage monitoring of wooden *manas* (sluice gates).
* **Engineering Hack (Zero-Cost Streaming):** To bypass Live API token limits and accommodate weak rural 2G internet, the frontend utilizes an automated "Frame-Grabber" script.
* **Data Model:**
```json
{
  "node_id": "ESTUARY_DONGORIM",
  "status": "CRITICAL_ALERT",
  "anomaly_type": "Plank Removal Detected",
  "timestamp": "2026-04-18T10:14:00Z"
}