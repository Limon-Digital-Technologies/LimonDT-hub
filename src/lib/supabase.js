import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://bohmllowuxdzhrxalewn.supabase.co";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || "sb_publishable_UbVxmJIgPJ3k_NJj5zTLhA_xKkp_kaF";

export const supabaseConfigError = !supabaseUrl || !supabasePublishableKey;

export const supabase = supabaseConfigError
  ? null
  : createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
