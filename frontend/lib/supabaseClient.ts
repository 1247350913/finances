import { createClient } from "@supabase/supabase-js";

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const rawSupabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const requestedAuthMode = import.meta.env.VITE_AUTH_MODE;

export const isSupabaseConfigured =
  typeof rawSupabaseUrl === "string" &&
  /^https?:\/\//i.test(rawSupabaseUrl) &&
  typeof rawSupabasePublishableKey === "string" &&
  rawSupabasePublishableKey.trim().length > 0;

if (!isSupabaseConfigured && requestedAuthMode !== "custom" && typeof window !== "undefined") {
  // Keep app booting during custom-auth migration even when Supabase env vars are absent.
  console.warn("Supabase env vars are not configured; set VITE_AUTH_MODE=custom or provide Supabase env vars.");
}

const supabaseUrl = isSupabaseConfigured
  ? rawSupabaseUrl
  : "http://127.0.0.1:54321";
const supabasePublishableKey = isSupabaseConfigured
  ? rawSupabasePublishableKey
  : "public-anon-key";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);