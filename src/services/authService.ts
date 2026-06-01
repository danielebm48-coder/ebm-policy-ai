import { getUserByEmail, ensureSampleUsers, UserWithPassword, createUser, verifyStudentCode, useStudentCode } from '../repositories/userRepository';
import { UserProfile, UserRole } from '../models';

const fallbackUsers: UserWithPassword[] = [
  {
    id: 'u_dguzman_admin',
    name: 'D. Guzman',
    email: 'dguzman@ebm.edu.sv',
    role: 'admin',
    active: true,
    password: 'admin2026',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'u_enadeh_admin',
    name: 'E. Nadeh',
    email: 'enadeh@ebm.edu.sv',
    role: 'admin',
    active: true,
    password: 'admin2026',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'u_profesor_demo',
    name: 'Profesor Demo Web',
    email: 'profesor.demo@colegio.edu',
    role: 'profesor',
    active: true,
    password: 'profesor2026',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'u_profesor',
    name: 'Profesor Luis',
    email: 'luis@colegio.edu',
    role: 'profesor',
    active: true,
    password: 'profesor2026',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'u_directivo',
    name: 'Directora Ana',
    email: 'ana@colegio.edu',
    role: 'directivo',
    active: true,
    password: 'directivo2026',
    createdAt: new Date(0).toISOString(),
  },
];

export async function initAuth(): Promise<void> {
  try {
    await ensureSampleUsers();
  } catch (error) {
    console.warn('Auth seed failed, continuing with fallback users:', error);
  }
}

export async function loginUser(email: string, password: string): Promise<UserProfile | null> {
  let user: UserWithPassword | null = null;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    user = await getUserByEmail(normalizedEmail);
  } catch (error) {
    console.warn('Database login lookup failed, trying fallback users:', error);
  }

  if (!user) {
    user = fallbackUsers.find((candidate) => candidate.email === normalizedEmail) || null;
  }

  if (!user || !user.active || user.password !== password) return null;
  const { password: _, ...profile } = user;
  return profile;
}

export async function registerUser(userData: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  studentCode?: string;
}): Promise<{ user?: UserProfile; error?: string }> {
  const normalizedEmail = userData.email.trim().toLowerCase();
  
  // 1. Validaciones por Rol
  if (['profesor', 'admin', 'directivo'].includes(userData.role)) {
    if (!normalizedEmail.endsWith('@ebm.edu.sv')) {
      return { error: 'Este rol requiere un correo institucional @ebm.edu.sv' };
    }
  }

  if (userData.role === 'alumno') {
    if (!userData.studentCode) {
      return { error: 'El código de alumno es obligatorio para este rol.' };
    }
    const codeCheck = await verifyStudentCode(userData.studentCode);
    if (!codeCheck.valid) {
      return { error: 'El código de alumno no es válido.' };
    }
    if (codeCheck.used) {
      return { error: 'Este código de alumno ya ha sido utilizado.' };
    }
  }

  // 2. Verificar si el usuario ya existe
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return { error: 'El correo electrónico ya está registrado.' };
  }

  // 3. Crear el usuario
  try {
    const newUser = await createUser({
      id: `u_${Math.random().toString(36).substring(2, 10)}`,
      name: userData.name,
      email: normalizedEmail,
      role: userData.role,
      active: true,
      password: userData.password,
    });

    // 4. Si es alumno, marcar código como usado
    if (userData.role === 'alumno' && userData.studentCode) {
      await useStudentCode(userData.studentCode, normalizedEmail);
    }

    return { user: newUser };
  } catch (error) {
    console.error('Registration error:', error);
    return { error: 'Error al procesar el registro.' };
  }
}

export function createToken(userId: string, role: UserRole): string {
  return Buffer.from(`${userId}:${role}:${new Date().getTime()}`).toString('base64');
}

export function verifyToken(token: string): { userId: string; role: UserRole } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [userId, role] = decoded.split(':');
    if (!userId || !role) return null;
    return { userId, role: role as UserRole };
  } catch {
    return null;
  }
}
