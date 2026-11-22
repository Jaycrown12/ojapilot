import { createClient } from "@supabase/supabase-js";

/**
 * Public client-side Supabase configuration.
 * NOTE: In client-side code, ONLY use NEXT_PUBLIC_ variables.
 * Never expose SUPABASE_SERVICE_ROLE_KEY or Gemini API keys here.
 */
export const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
export const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

// Verifies that legitimate Supabase credentials have been injected by Next.js
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes("placeholder") &&
  !supabaseUrl.includes("your-project-id") &&
  !supabaseAnonKey.includes("placeholder")
);

// Fallback to safe dummy URL if unconfigured so module initialization doesn't throw at import time
const effectiveUrl = isSupabaseConfigured ? supabaseUrl : "https://placeholder-project.supabase.co";
const effectiveKey = isSupabaseConfigured ? supabaseAnonKey : "placeholder-anon-key";

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Helper to validate configuration before performing auth or database calls.
 * Throws a clear, beginner-friendly error instead of an opaque "Failed to fetch".
 */
export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      `Supabase is not configured in the browser environment. ` +
      `NEXT_PUBLIC_SUPABASE_URL is currently "${supabaseUrl || "undefined"}". ` +
      `If you recently created or updated "frontend/.env.local", please restart your Next.js dev server (Ctrl+C, then "npm run dev").`
    );
  }
}
