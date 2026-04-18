import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Server {
  id?: string;
  ip: string;
  region: string;
  added_at?: string;
  updated_at?: string;
}

export interface GameIpRange {
  id?: string;
  game_id: string;
  ip_range: string;
  created_at?: string;
}
