import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | null = null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase 설정이 없습니다. apps/web/.env.local에 공개 환경변수를 설정하세요.",
    );
  }

  if (!browserClient) {
    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error("Supabase 공개 환경변수를 확인할 수 없습니다.");
    }
    browserClient = createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
  }

  return browserClient;
}
