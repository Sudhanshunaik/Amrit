/**
 * dataService.js
 * 
 * Fetches live data from Supabase tables and provides real-time subscriptions.
 * Falls back to static defaults if the tables haven't been created yet.
 */

import { supabase } from '../supabaseClient';

// ── Default / fallback data (matches the static Stitch HTML) ──────────────

const DEFAULTS = {
  weather: {
    temperature: 24,
    tide_status: 'High Tide',
    humidity: 88,
    wind_speed: 12,
    evaporation_score: 14.2,
  },
  vision: {
    stream_id: 'ESTUARY_04',
    status: 'CRITICAL_ALERT',
    anomaly_type: 'Sluice Gate Sabotage Detected',
    confidence: 98.4,
    location: 'North Creek Entry',
    description: 'Anomaly detected near mechanical actuator. Emergency protocols staged.',
  },
  brine: {
    phase: 'Preparatory',
    evaporation_rate: 14.2,
    humidity: 88,
    soil_salinity: 6.2,
    salinity_status: 'STABLE',
    ai_insight: 'Optimal conditions for salt harvesting expected within 48 hours. Monitoring estuary salinity levels.',
  },
  profile: {
    name: 'Dr. Amritrao Dessai',
    role: 'Lead Estuary Guardian',
    experience_years: 24,
    managed_hectares: 12,
    node_id: 'ESTUARY_04',
    location: 'Chorao Island, Goa',
    ecosystem_health: 94,
    yield_status: 'High',
  },
  subsidies: [{
    scheme_name: 'Amrit Kaal Agriculture Grant',
    description: 'Under the Amrit Kaal framework, the government offers significant financial aid for coastal ecological preservation.',
    coverage_percent: 75,
    category: 'Salt-Pan Subsidy',
    status: 'ACTIVE',
  }],
};

// ── Fetch helpers ─────────────────────────────────────────────────────────

async function safeFetch(table, single = true) {
  try {
    const query = supabase.from(table).select('*').order('updated_at', { ascending: false }).limit(1);
    const { data, error } = single
      ? await query.maybeSingle()
      : await supabase.from(table).select('*');
    if (error) {
      console.warn(`[Amrit DB] Could not fetch from "${table}":`, error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn(`[Amrit DB] Fetch error for "${table}":`, err);
    return null;
  }
}

export async function fetchWeatherData() {
  const row = await safeFetch('weather_data');
  return row || DEFAULTS.weather;
}

export async function fetchVisionAlerts() {
  const row = await safeFetch('vision_alerts');
  return row || DEFAULTS.vision;
}

export async function fetchBrineAnalytics() {
  const row = await safeFetch('brine_analytics');
  return row || DEFAULTS.brine;
}

export async function fetchFarmerProfile() {
  const row = await safeFetch('farmer_profiles');
  return row || DEFAULTS.profile;
}

export async function fetchSubsidies() {
  const rows = await safeFetch('subsidies', false);
  return (rows && rows.length > 0) ? rows : DEFAULTS.subsidies;
}

// ── Fetch all data in parallel ────────────────────────────────────────────

export async function fetchAllData() {
  const [weather, vision, brine, profile, subsidies] = await Promise.all([
    fetchWeatherData(),
    fetchVisionAlerts(),
    fetchBrineAnalytics(),
    fetchFarmerProfile(),
    fetchSubsidies(),
  ]);
  return { weather, vision, brine, profile, subsidies };
}

// ── Real-time subscriptions ───────────────────────────────────────────────

export function subscribeToWeather(callback) {
  return supabase
    .channel('weather-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weather_data' },
      (payload) => callback(payload.new)
    )
    .subscribe();
}

export function subscribeToVisionAlerts(callback) {
  return supabase
    .channel('vision-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vision_alerts' },
      (payload) => callback(payload.new)
    )
    .subscribe();
}

export function subscribeToBrine(callback) {
  return supabase
    .channel('brine-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'brine_analytics' },
      (payload) => callback(payload.new)
    )
    .subscribe();
}

export function subscribeToEvaporationLogs(callback) {
  return supabase
    .channel('evaporation-logs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'evaporation_logs' },
      (payload) => callback(payload.new)
    )
    .subscribe();
}

export async function fetchLatestEvaporationScore() {
  const row = await safeFetch('evaporation_logs');
  return row?.score ?? 14.2;
}

// ── Connection test ───────────────────────────────────────────────────────

export async function testConnection() {
  try {
    const { data, error } = await supabase.from('weather_data').select('id').limit(1);
    if (error) {
      return { connected: false, tablesExist: false, error: error.message };
    }
    return { connected: true, tablesExist: true, rowCount: data?.length || 0 };
  } catch (err) {
    return { connected: false, tablesExist: false, error: err.message };
  }
}
