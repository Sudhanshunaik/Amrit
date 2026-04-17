import { createClient } from '@supabase/supabase-js';

const supabaseUrlRaw = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrlRaw || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables! Check your .env file.");
}

// Format URL correctly if it only contains the Project ID (e.g., "xpwcxzqabwardrnyrksg")
const supabaseUrl = supabaseUrlRaw.startsWith('http') 
  ? supabaseUrlRaw 
  : `https://${supabaseUrlRaw}.supabase.co`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
