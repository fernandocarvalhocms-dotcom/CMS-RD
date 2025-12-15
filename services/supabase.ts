
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lkmgiinvoiqcdgbtoprz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrbWdpaW52b2lxY2RnYnRvcHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NTIzNjksImV4cCI6MjA4MTIyODM2OX0.odWC0T6YS4GuBs63jrJXjjUfbspjzl08AX9K_tpekTo';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});
