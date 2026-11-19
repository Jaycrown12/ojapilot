import { createClient } from "@supabase/supabase-js";

// Note: In client-side code, ONLY use NEXT_PUBLIC_ variables.
// Never expose SUPABASE_SERVICE_ROLE_KEY or AI API keys on the frontend.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
