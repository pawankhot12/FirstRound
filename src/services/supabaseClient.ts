import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read Supabase environment variables safely across browser (import.meta.env) and Node environments
const getEnvVar = (key: string): string => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] || '';
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  return '';
};

export const getSupabaseUrl = (): string => getEnvVar('VITE_SUPABASE_URL');
export const getSupabaseAnonKey = (): string => getEnvVar('VITE_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = (): boolean => {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return (
    Boolean(url) &&
    Boolean(key) &&
    !url.includes('YOUR_SUPABASE') &&
    !url.includes('placeholder') &&
    !key.includes('placeholder')
  );
};

// Create Supabase client with graceful fallback for unconfigured/placeholder state
const dummyUrl = 'https://unconfigured-project.supabase.co';
const dummyKey = 'unconfigured-key';

const supaStart = typeof performance !== 'undefined' ? performance.now() : Date.now();

export const supabase: SupabaseClient = createClient(
  getSupabaseUrl() || dummyUrl,
  getSupabaseAnonKey() || dummyKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

if (typeof performance !== 'undefined') {
  console.log('Supabase client initialization:', performance.now() - supaStart);
}

// --- Auth Helper Services ---

/**
 * Sign in with Email and Password using Supabase Auth
 */
export const signInWithEmail = async (email: string, password: string) => {
  const start = performance.now();
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase Auth] Supabase environment variables are not configured.');
    return { data: null, error: new Error('Supabase Auth is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') };
  }
  const result = await supabase.auth.signInWithPassword({ email, password });
  console.log('signInWithPassword:', performance.now() - start);
  return result;
};

/**
 * Sign up with Email and Password using Supabase Auth
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  metadata?: { name?: string; college?: string; targetCompany?: string; targetRole?: string }
) => {
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase Auth] Supabase environment variables are not configured.');
    return { data: null, error: new Error('Supabase Auth is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') };
  }
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata || {},
    },
  });
};

/**
 * Sign in with Google OAuth using Supabase Auth
 */
export const signInWithGoogle = async (redirectTo?: string) => {
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase Auth] Supabase environment variables are not configured.');
    return { data: null, error: new Error('Supabase Auth is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') };
  }
  const redirectUrl = redirectTo || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
    },
  });
};

/**
 * Sign out current session
 */
export const signOutSupabase = async () => {
  if (!isSupabaseConfigured()) return { error: null };
  return await supabase.auth.signOut();
};

/**
 * Fetch current user session
 */
export const getSupabaseSession = async () => {
  if (!isSupabaseConfigured()) return { data: { session: null }, error: null };
  return await supabase.auth.getSession();
};

/**
 * Send password reset email using Supabase Auth
 */
export const resetPasswordForEmail = async (email: string, redirectTo?: string) => {
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase Auth] Supabase environment variables are not configured.');
    return { data: null, error: new Error('Supabase Auth is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') };
  }
  const redirectUrl = redirectTo || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });
};
