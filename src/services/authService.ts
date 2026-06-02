import { 
  getUserByEmail, 
  ensureSampleUsers, 
  UserWithPassword, 
  createUser, 
  verifyStudentCode, 
  useStudentCode,
  createPendingApproval,
  getPendingApprovals,
  updateApprovalStatus,
  setUserActiveStatus
} from '../repositories/userRepository';
import { UserProfile, UserRole } from '../models';
import { pool } from '../db';

const fallbackUsers: UserWithPassword[] = [
  {
    id: 'u_dguzman_admin',
    name: 'D. Guzman',
    email: 'dguzman@ebm.edu.sv',
    role: 'directivo',
    active: true,
    password: 'admin2026',
    createdAt: new Date(0).toISOString(),
  },
  {
    id: 'u_enadeh_admin',
    name: 'E. Nadeh',
    email: 'enadeh@ebm.edu.sv',
    role: 'directivo',
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

export async function loginUser(email: string, password: string): Promise<{ user?: UserProfile; error?: string } | null> {
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

  if (!user || user.password !== password) return null;
  
  if (!user.active) {
    return { error: 'Tu cuenta está pendiente de aprobación por un Directivo. Por favor, espera a que validen tu acceso.' };
  }

  const { password: _, ...profile } = user;
  return { user: profile };
}

export async function registerUser(userData: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  studentCode?: string;
}): Promise<{ user?: UserProfile; error?: string; pendingApproval?: boolean }> {
  const normalizedEmail = userData.email.trim().toLowerCase();
  
  // 1. Validaciones por Rol
  const authorizedDirectors = ['dguzman@ebm.edu.sv', 'enadeh@ebm.edu.sv', 'juriarte@ebm.edu.sv'];
  if (userData.role === 'directivo') {
    if (!authorizedDirectors.includes(normalizedEmail)) {
      return { error: 'Este correo no está autorizado como Directivo.' };
    }
  }

  if (userData.role === 'admin') {
    if (!normalizedEmail.endsWith('@ebm.edu.sv')) {
      return { error: 'Los administradores deben usar correo @ebm.edu.sv' };
    }
  }

  if (userData.role === 'profesor') {
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

  // 3. Determinar si requiere aprobación
  // Los administradores nuevos se crean inactivos y requieren aprobación
  const requiresApproval = userData.role === 'admin';
  const isActive = !requiresApproval;

  // 4. Crear el usuario
  try {
    const userId = `u_${Math.random().toString(36).substring(2, 10)}`;
    const newUser = await createUser({
      id: userId,
      name: userData.name,
      email: normalizedEmail,
      role: userData.role,
      active: isActive,
      password: userData.password,
    });

    try {
      // 5. Si es alumno, marcar código como usado
      if (userData.role === 'alumno' && userData.studentCode) {
        await useStudentCode(userData.studentCode, normalizedEmail);
      }

      // 6. Si requiere aprobación, crear registro de solicitud
      if (requiresApproval) {
        await createPendingApproval(userId, userData.role);
        return { user: newUser, pendingApproval: true };
      }

      return { user: newUser };
    } catch (innerError) {
      // Si falla algo despues de crear el usuario (ej: falla la solicitud de aprobacion)
      // Borramos el usuario para que no quede "en el limbo" y pueda reintentar.
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      throw innerError;
    }
  } catch (error) {
    console.error('Registration error:', error);
    return { error: 'Error al procesar el registro.' };
  }
}

export async function listPendingApprovals(): Promise<any[]> {
  return await getPendingApprovals();
}

export async function approveAdmin(approvalId: string, directorId: string): Promise<void> {
  const userId = await updateApprovalStatus(approvalId, 'approved', directorId);
  if (userId) {
    await setUserActiveStatus(userId, true);
  }
}

export async function rejectAdmin(approvalId: string, directorId: string): Promise<void> {
  await updateApprovalStatus(approvalId, 'rejected', directorId);
  // El usuario permanece inactivo
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
