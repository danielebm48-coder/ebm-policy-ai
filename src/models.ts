export type UserRole = 'profesor' | 'alumno' | 'padre' | 'directivo' | 'admin';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export type PolicyStatus = 'draft' | 'published' | 'archived' | 'under-review';
export type PolicyCategory = 'convivencia' | 'procedimientos' | 'seguridad' | 'academico' | 'comunicacion' | 'otros';

export interface PolicyDocument {
  id: string;
  title: string;
  summary: string;
  category: PolicyCategory;
  status: PolicyStatus;
  effectiveDate: string;
  version: number;
  tags: string[];
  content: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyVersion {
  versionId: string;
  policyId: string;
  title: string;
  content: string;
  summary: string;
  status: PolicyStatus;
  effectiveDate: string;
  tags: string[];
  createdBy: string;
  createdAt: string;
}

export interface PolicyQuery {
  userId: string;
  role: UserRole;
  question: string;
  requestedAt: string;
}

export interface PolicyReference {
  policyId: string;
  title: string;
  excerpt: string;
}

export interface PolicyAnswer {
  answer: string;
  references: PolicyReference[];
  policyIds: string[];
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: 'create' | 'update' | 'publish' | 'query' | 'login';
  actorId: string;
  details: string;
  createdAt: string;
}
