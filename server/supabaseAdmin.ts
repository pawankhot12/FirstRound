import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase admin client using the Service Role key.
 * IMPORTANT: This file must ONLY be imported by server-side code (server.ts, server/*.ts).
 * It must NEVER be imported by any file under src/ (React/Vite client bundle).
 *
 * Credentials are read exclusively from Node.js process.env.
 * SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL must be set in .env.local.
 */
export const getSupabaseAdmin = (): SupabaseClient => {
  const url = process.env.VITE_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceKey) {
    throw new Error('Supabase admin credentials are not configured. Ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  }
  // Service role client bypasses RLS — never expose to the browser.
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
};
