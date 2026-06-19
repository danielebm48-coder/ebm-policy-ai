import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });
import { supabaseAdmin } from './supabase';

async function testEnsureUser() {
  console.log('Testing ensureSupabaseUser logic...');
  if (!supabaseAdmin) {
    console.error('supabaseAdmin is null');
    return;
  }
  const user = {
    id: 'u_alumno',
    role: 'alumno',
    email: 'mario@colegio.edu'
  };
  const roleNames: Record<string, string> = {
    admin: 'Administrador',
    directivo: 'Directivo/Rectoria',
    profesor: 'Profesor',
    alumno: 'Estudiante',
    padre: 'Padre/Apoderado',
  };
  const fallbackNames: Record<string, string> = {
    admin: 'Sistema',
    directivo: 'Directora Ana',
    profesor: 'Profesor Luis',
    alumno: 'Alumno Mario',
    padre: 'Padre Carmen',
  };
  const now = new Date().toISOString();

  console.log('Upserting role...');
  const { error: roleError } = await supabaseAdmin
    .from('roles')
    .upsert(
      {
        id: user.role,
        name: roleNames[user.role] || user.role,
        description: `Rol ${user.role}`,
        created_at: now,
      },
      { onConflict: 'id' }
    );
  if (roleError) {
    console.error('Role Error:', roleError);
  } else {
    console.log('Role upserted successfully');
  }

  console.log('Upserting user...');
  const { error: userError } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        id: user.id,
        name: fallbackNames[user.role] || user.email || user.id,
        email: user.email || `${user.id}@colegio.edu`,
        role: user.role,
        active: true,
        password: 'render-managed',
        created_at: now,
      },
      { onConflict: 'id' }
    );
  if (userError) {
    console.error('User Error:', userError);
  } else {
    console.log('User upserted successfully');
  }
}

testEnsureUser();
