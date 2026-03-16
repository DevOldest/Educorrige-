/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseInstance: any = null;

export const getSupabase = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL or Anon Key is missing. Please configure them in your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).');
  }
  
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  
  return supabaseInstance;
};

// For backward compatibility while we migrate or as a convenience
export const supabase = (!supabaseUrl || !supabaseAnonKey) 
  ? null 
  : createClient(supabaseUrl, supabaseAnonKey);
