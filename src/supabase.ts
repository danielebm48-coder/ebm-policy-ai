import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './config/env';

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

// Cliente público (para operaciones del lado del cliente)
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Cliente con privilegios de administrador (solo para el servidor)
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

export async function testSupabaseConnection(): Promise<void> {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      console.error('Supabase connection error:', error);
    } else {
      console.log('✅ Supabase connected successfully');
    }
  } catch (error) {
    console.error('Failed to test Supabase connection:', error);
  }
}
