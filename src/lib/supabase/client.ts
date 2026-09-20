import { createBrowserClient } from "@supabase/ssr";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/env";

export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseKey());
}
