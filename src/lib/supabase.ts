/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://seavpmrrhcdrbmejlmrq.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlYXZwbXJyaGNkcmJtZWpsbXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzc5MDksImV4cCI6MjA4ODc1MzkwOX0.3UaIGBEDyt9luwvpmwBrUnPCvbQBH8ISsjc5ra3yDrE';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

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
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
