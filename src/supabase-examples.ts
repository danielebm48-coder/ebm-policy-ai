import { supabaseClient, supabaseAdmin } from './supabase';

/**
 * Ejemplo: Obtener usuarios desde Supabase
 */
export async function getUsers() {
  const { data, error } = await supabaseClient
    .from('users')
    .select('*');

  if (error) {
    console.error('Error fetching users:', error);
    return [];
  }
  return data;
}

/**
 * Ejemplo: Crear un nuevo usuario (requiere admin)
 */
export async function createUser(user: { id: string; name: string; email: string; role: string }) {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .insert([user])
    .select();

  if (error) {
    console.error('Error creating user:', error);
    throw error;
  }
  return data[0];
}

/**
 * Ejemplo: Obtener políticas con filtros
 */
export async function getPolicies(filters?: { status?: string; category?: string }) {
  let query = supabaseClient.from('policies').select('*');

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching policies:', error);
    return [];
  }
  return data;
}

/**
 * Ejemplo: Actualizar una política
 */
export async function updatePolicy(policyId: string, updates: Record<string, any>) {
  const { data, error } = await supabaseClient
    .from('policies')
    .update(updates)
    .eq('id', policyId)
    .select();

  if (error) {
    console.error('Error updating policy:', error);
    throw error;
  }
  return data[0];
}

/**
 * Ejemplo: Registrar un audit log
 */
export async function logAudit(action: string, actorId: string, details: string) {
  const { error } = await supabaseClient
    .from('audit_logs')
    .insert([
      {
        id: `audit_${Date.now()}`,
        action,
        actor_id: actorId,
        details,
        created_at: new Date().toISOString(),
      },
    ]);

  if (error) {
    console.error('Error logging audit:', error);
    throw error;
  }
}

/**
 * Ejemplo: Usar autenticación de Supabase
 */
export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error('Error signing up:', error);
    throw error;
  }
  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('Error signing in:', error);
    throw error;
  }
  return data;
}
