import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !/^https:\/\//i.test(supabaseUrl)) {
  throw new Error(
    "Invalid or missing VITE_SUPABASE_URL. Set it to your Supabase project URL, for example https://xyzcompany.supabase.co"
  );
}

if (!supabasePublishableKey) {
  throw new Error("Missing VITE_SUPABASE_PUBLISHABLE_KEY. Set it to your Supabase anon/publishable key.");
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);