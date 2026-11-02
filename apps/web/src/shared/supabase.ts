import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "./auth/supabase";

export function getSupabase() {
  return isSupabaseConfigured ? getSupabaseBrowserClient() : null;
}
