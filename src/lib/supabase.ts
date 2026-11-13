/// <reference types="vite/client" />
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://seavpmrrhcdrbmejlmrq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYXZwbXJyaGNkcmJtZWpsbXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzc5MDksImV4cCI6MjA4ODc1MzkwOX0.3UaIGBEDyt9luwvpmwBrUnPCvbQBH8ISsjc5ra3yDrE';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const INVALID_REFRESH_TOKEN_EVENT = 'supabase:invalid-refresh-token';

export function isInvalidRefreshTokenError(error: unknown): boolean {
  if (!error) return false;
  const errObj = error as { message?: string; code?: string; error_code?: string };
  const msg = String(errObj.message || error || '').toLowerCase();
  const code = String(errObj.code || errObj.error_code || '').toLowerCase();
  return (
    code === 'refresh_token_not_found' ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found')
  );
}

export function clearSupabaseAuthStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && /^sb-.*-auth-token/.test(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch (e) {
    console.warn('Não foi possível limpar tokens locais do Supabase:', e);
  }
}

function sanitizeStoredSupabaseAuth(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const hasDemoSession = Boolean(window.localStorage.getItem('local_demo_session'));
    if (hasDemoSession) {
      clearSupabaseAuthStorage();
      return;
    }

    const keysToCheck: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && /^sb-[^-]+-auth-token$/.test(key)) {
        keysToCheck.push(key);
      }
    }

    for (const key of keysToCheck) {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        window.localStorage.removeItem(key);
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !parsed.access_token ||
          !parsed.refresh_token
        ) {
          window.localStorage.removeItem(key);
          window.localStorage.removeItem(`${key}-user`);
        }
      } catch {
        window.localStorage.removeItem(key);
        window.localStorage.removeItem(`${key}-user`);
      }
    }
  } catch (e) {
    console.warn('Falha ao validar sessão armazenada do Supabase:', e);
  }
}

const authSafeFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (
    urlStr.includes('/auth/v1/token') &&
    urlStr.includes('grant_type=refresh_token') &&
    !response.ok
  ) {
    try {
      const cloned = response.clone();
      const payload = await cloned.json();
      if (isInvalidRefreshTokenError(payload) || isInvalidRefreshTokenError(payload?.msg || payload?.error_description)) {
        clearSupabaseAuthStorage();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(INVALID_REFRESH_TOKEN_EVENT));
        }
      }
    } catch {
      // Ignore JSON parsing issues on error payload
    }
  }

  return response;
};

sanitizeStoredSupabaseAuth();

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is missing. Please configure them in your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        fetch: authSafeFetch,
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return supabaseInstance;
};

// Single shared instance
export const supabase = getSupabase();

export async function getSafeAuthUser(): Promise<User | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        clearSupabaseAuthStorage();
      }
      return null;
    }
    return data?.session?.user ?? null;
  } catch (err) {
    if (isInvalidRefreshTokenError(err)) {
      clearSupabaseAuthStorage();
    }
    return null;
  }
}

