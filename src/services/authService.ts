import { getUserByEmail, ensureSampleUsers, UserWithPassword } from '../repositories/userRepository';
import { UserProfile, UserRole } from '../models';

export async function initAuth(): Promise<void> {
  await ensureSampleUsers();
}

export async function loginUser(email: string, password: string): Promise<UserProfile | null> {
  const user = await getUserByEmail(email);
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
