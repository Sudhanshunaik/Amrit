-- =========================================================
-- Project Amrit: Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =========================================================

-- 1. Weather / Dashboard data
CREATE TABLE IF NOT EXISTS weather_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id TEXT NOT NULL DEFAULT 'ESTUARY_04',
  temperature NUMERIC NOT NULL DEFAULT 24,
  tide_status TEXT NOT NULL DEFAULT 'High Tide',
  humidity NUMERIC NOT NULL DEFAULT 88,
  wind_speed NUMERIC NOT NULL DEFAULT 12,
  cloud_cover TEXT DEFAULT 'Partly Cloudy',
  evaporation_score NUMERIC DEFAULT 14.2,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Vision Agent alerts
CREATE TABLE IF NOT EXISTS vision_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id TEXT NOT NULL DEFAULT 'ESTUARY_04',
  stream_id TEXT NOT NULL DEFAULT 'ESTUARY_04',
  status TEXT NOT NULL DEFAULT 'CRITICAL_ALERT',
  anomaly_type TEXT NOT NULL DEFAULT 'Sluice Gate Sabotage Detected',
  confidence NUMERIC DEFAULT 98.4,
  location TEXT DEFAULT 'North Creek Entry',
  description TEXT DEFAULT 'Anomaly detected near mechanical actuator. Emergency protocols staged.',
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- 3. Data Agent / Brine Analytics
CREATE TABLE IF NOT EXISTS brine_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id TEXT NOT NULL DEFAULT 'ESTUARY_04',
  phase TEXT NOT NULL DEFAULT 'Preparatory',
  evaporation_rate NUMERIC DEFAULT 14.2,
  humidity NUMERIC DEFAULT 88,
  soil_salinity NUMERIC DEFAULT 6.2,
  salinity_status TEXT DEFAULT 'STABLE',
  ai_insight TEXT DEFAULT 'Optimal conditions for salt harvesting expected within 48 hours. Monitoring estuary salinity levels.',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Farmer profile
CREATE TABLE IF NOT EXISTS farmer_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Dr. Amritrao Dessai',
  role TEXT DEFAULT 'Lead Estuary Guardian',
  experience_years INTEGER DEFAULT 24,
  managed_hectares NUMERIC DEFAULT 12,
  node_id TEXT DEFAULT 'ESTUARY_04',
  location TEXT DEFAULT 'Chorao Island, Goa',
  ecosystem_health NUMERIC DEFAULT 94,
  yield_status TEXT DEFAULT 'High',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Subsidy / Voice agent data
CREATE TABLE IF NOT EXISTS subsidies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scheme_name TEXT NOT NULL DEFAULT 'Amrit Kaal Agriculture Grant',
  description TEXT DEFAULT 'Financial aid for coastal ecological preservation under the Amrit Kaal framework.',
  coverage_percent NUMERIC DEFAULT 75,
  category TEXT DEFAULT 'Salt-Pan Subsidy',
  eligibility TEXT DEFAULT 'Saline land restoration',
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================
-- Seed data (initial rows matching the Stitch mock UI)
-- =========================================================

INSERT INTO weather_data (node_id, temperature, tide_status, humidity, wind_speed, cloud_cover, evaporation_score)
VALUES ('ESTUARY_04', 24, 'High Tide', 88, 12, 'Partly Cloudy', 14.2);

INSERT INTO vision_alerts (node_id, stream_id, status, anomaly_type, confidence, location, description)
VALUES ('ESTUARY_04', 'ESTUARY_04', 'CRITICAL_ALERT', 'Sluice Gate Sabotage Detected', 98.4, 'North Creek Entry', 'Anomaly detected near mechanical actuator. Emergency protocols staged.');

INSERT INTO brine_analytics (node_id, phase, evaporation_rate, humidity, soil_salinity, salinity_status, ai_insight)
VALUES ('ESTUARY_04', 'Preparatory', 14.2, 88, 6.2, 'STABLE', 'Optimal conditions for salt harvesting expected within 48 hours. Monitoring estuary salinity levels.');

INSERT INTO farmer_profiles (name, role, experience_years, managed_hectares, node_id, location, ecosystem_health, yield_status)
VALUES ('Dr. Amritrao Dessai', 'Lead Estuary Guardian', 24, 12, 'ESTUARY_04', 'Chorao Island, Goa', 94, 'High');

INSERT INTO subsidies (scheme_name, description, coverage_percent, category, eligibility, status)
VALUES ('Amrit Kaal Agriculture Grant', 'Under the Amrit Kaal framework, the government offers significant financial aid for coastal ecological preservation. For your specific query on saline lands, you qualify for the Local Salt-Pan Subsidy which covers up to 75% of restoration costs.', 75, 'Salt-Pan Subsidy', 'Saline land restoration', 'ACTIVE');

-- Enable Row-Level Security (open read for anon, restrict writes)
ALTER TABLE weather_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE vision_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE brine_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE farmer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidies ENABLE ROW LEVEL SECURITY;

-- Allow anonymous reads on all tables
CREATE POLICY "Allow anonymous read" ON weather_data FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON vision_alerts FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON brine_analytics FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON farmer_profiles FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON subsidies FOR SELECT USING (true);

-- Allow anonymous inserts/updates (for demo purposes)
CREATE POLICY "Allow anonymous write" ON weather_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous write" ON vision_alerts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous write" ON brine_analytics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous write" ON farmer_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous write" ON subsidies FOR ALL USING (true) WITH CHECK (true);

-- 6. Evaporation Logs (for real-time Evaporation Gauge updates)
CREATE TABLE IF NOT EXISTS evaporation_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  node_id TEXT NOT NULL DEFAULT 'ESTUARY_04',
  score NUMERIC NOT NULL DEFAULT 14.2,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO evaporation_logs (node_id, score)
VALUES ('ESTUARY_04', 14.2);

ALTER TABLE evaporation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read" ON evaporation_logs FOR SELECT USING (true);
CREATE POLICY "Allow anonymous write" ON evaporation_logs FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime on key tables
ALTER PUBLICATION supabase_realtime ADD TABLE weather_data;
ALTER PUBLICATION supabase_realtime ADD TABLE vision_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE brine_analytics;
ALTER PUBLICATION supabase_realtime ADD TABLE evaporation_logs;
