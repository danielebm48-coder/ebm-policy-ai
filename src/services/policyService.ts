import { PolicyDocument, PolicyReference } from '../models';
import {
  createPolicy as persistPolicy,
  updatePolicy as persistPolicyUpdate,
  getPolicyById,
  listPolicies as loadPolicies,
  searchPolicies as loadPoliciesSearch,
} from '../repositories/policyRepository';
import { addAuditEntry } from '../repositories/auditRepository';

export async function createPolicy(payload: Omit<PolicyDocument, 'id' | 'createdAt' | 'updatedAt' | 'version'>): Promise<PolicyDocument> {
  const policy = await persistPolicy(payload);
  await addAuditEntry({
    action: 'create',
    actorId: policy.createdBy,
    details: `Política creada: ${policy.title}`,
  });
  return policy;
}

export async function updatePolicy(policyId: string, updates: Partial<Omit<PolicyDocument, 'id' | 'createdAt'>>): Promise<PolicyDocument | null> {
  const policy = await persistPolicyUpdate(policyId, updates);
  if (!policy) return null;
  await addAuditEntry({
    action: 'update',
    actorId: policy.updatedBy,
    details: `Política actualizada: ${policy.title}`,
  });
  return policy;
}

export async function findPolicyById(policyId: string): Promise<PolicyDocument | null> {
  return getPolicyById(policyId);
}

export async function listPolicies(role?: string): Promise<PolicyDocument[]> {
  return loadPolicies(role);
}

export async function searchPolicies(query: string): Promise<PolicyDocument[]> {
  return loadPoliciesSearch(query);
}

export function buildReferences(matches: PolicyDocument[]): PolicyReference[] {
  return matches.slice(0, 3).map((policy) => ({
    policyId: policy.id,
    title: policy.title,
    excerpt: policy.summary || policy.content.slice(0, 160),
  }));
}

export async function createSamplePolicies(): Promise<void> {
  const existing = await listPolicies();
  if (existing.length > 0) return;

  await createPolicy({
    title: 'Código de Convivencia Escolar',
    summary: 'Normas de respeto, puntualidad y uso de instalaciones para toda la comunidad escolar.',
    category: 'convivencia',
    status: 'published',
    effectiveDate: '2026-08-01',
    tags: ['respeto', 'puntualidad', 'conducta'],
    content: 'Los estudiantes deben llegar puntuales, respetar a sus compañeros y cuidar las instalaciones escolares.',
    createdBy: 'u_system',
    updatedBy: 'u_system',
  });

  await createPolicy({
    title: 'Procedimiento de Atención a Padres',
    summary: 'Guía para atender solicitudes de padres y coordinar entrevistas con el personal directivo.',
    category: 'procedimientos',
    status: 'published',
    effectiveDate: '2026-07-15',
    tags: ['padres', 'entrevistas', 'comunicacion'],
    content: 'Las citas con el director deben solicitarse con al menos 48 horas de anticipación y registrarse en el sistema.',
    createdBy: 'u_system',
    updatedBy: 'u_system',
  });
}
