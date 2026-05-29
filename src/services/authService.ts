import { getUserByEmail, ensureSampleUsers, UserWithPassword } from '../repositories/userRepository';
import { UserProfile, UserRole } from '../models';

const fallbackUsers: UserWithPassword[] = [
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
  await ensureSampleUsers();
}

export async function loginUser(email: string, password: string): Promise<UserProfile | null> {
  let user: UserWithPassword | null = null;

  try {
    user = await getUserByEmail(email);
  } catch (error) {
    console.warn('Database login lookup failed, trying fallback users:', error);
  }

  if (!user) {
    user = fallbackUsers.find((candidate) => candidate.email === email.toLowerCase()) || null;
  }

  if (!user || user.password !== password) return null;
  const { password: _, ...profile } = user;
  return profile;
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
