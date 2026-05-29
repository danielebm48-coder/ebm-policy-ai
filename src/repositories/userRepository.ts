import { pool } from '../db';
import { UserProfile, UserRole } from '../models';

export interface UserWithPassword extends UserProfile {
  password: string;
}

function mapRow(row: any): UserProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as UserRole,
    active: row.active,
    createdAt: row.created_at,
  };
}

export async function getUserByEmail(email: string): Promise<UserWithPassword | null> {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...mapRow(row),
    password: row.password,
  };
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  const row = result.rows[0];
  if (!row) return null;
  return mapRow(row);
}

export async function listUsers(): Promise<UserProfile[]> {
  const result = await pool.query('SELECT * FROM users ORDER BY role, name');
  return result.rows.map(mapRow);
}

export async function createUser(user: Omit<UserWithPassword, 'createdAt'>): Promise<UserProfile> {
  const createdAt = new Date().toISOString();
  await pool.query(
    `INSERT INTO users (id, name, email, role, active, password, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user.id, user.name, user.email.toLowerCase(), user.role, user.active, user.password, createdAt],
  );
  return (await getUserById(user.id))!;
}

export async function ensureSampleUsers(): Promise<void> {
  const sampleUsers = [
    { id: 'u_system', name: 'Sistema', email: 'system@colegio.edu', role: 'admin' as UserRole, active: true, password: 'system2026' },
    { id: 'u_dguzman_admin', name: 'D. Guzman', email: 'dguzman@ebm.edu.sv', role: 'admin' as UserRole, active: true, password: 'admin2026' },
    { id: 'u_directivo', name: 'Directora Ana', email: 'ana@colegio.edu', role: 'directivo' as UserRole, active: true, password: 'directivo2026' },
    { id: 'u_profesor', name: 'Profesor Luis', email: 'luis@colegio.edu', role: 'profesor' as UserRole, active: true, password: 'profesor2026' },
    { id: 'u_demo_profesor', name: 'Profesor Demo', email: 'demo@colegio.edu', role: 'profesor' as UserRole, active: true, password: 'demo2026' },
    { id: 'u_profesor_demo', name: 'Profesor Demo Web', email: 'profesor.demo@colegio.edu', role: 'profesor' as UserRole, active: true, password: 'profesor2026' },
    { id: 'u_alumno', name: 'Alumno Mario', email: 'mario@colegio.edu', role: 'alumno' as UserRole, active: true, password: 'alumno2026' },
    { id: 'u_padre', name: 'Padre Carmen', email: 'carmen@colegio.edu', role: 'padre' as UserRole, active: true, password: 'padre2026' },
  ];

  for (const user of sampleUsers) {
    await pool.query(
      `INSERT INTO users (id, name, email, role, active, password, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         active = EXCLUDED.active,
         password = EXCLUDED.password`,
      [user.id, user.name, user.email.toLowerCase(), user.role, user.active, user.password, new Date().toISOString()],
    );
  }
}
