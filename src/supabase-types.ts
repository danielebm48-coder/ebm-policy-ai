// Tipos para las tablas de Supabase

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  password: string;
  created_at: string;
}

export interface Policy {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  effective_date: string;
  version: number;
  tags: Record<string, any>;
  content: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface PolicyVersion {
  version_id: string;
  policy_id: string;
  title: string;
  summary: string;
  status: string;
  effective_date: string;
  version: number;
  tags: Record<string, any>;
  content: string;
  created_by: string;
  created_at: string;
}

export interface Query {
  id: string;
  user_id: string;
  role: string;
  question: string;
  requested_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor_id: string;
  details: string;
  created_at: string;
}

// ===================================================================
// TIPOS PARA REPOSITORIO DE POLÍTICAS CON IA
// ===================================================================

export interface Role {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export type DocumentType = 'policy' | 'manual' | 'procedure' | 'handbook' | 'other';
export type DocumentStatus = 'active' | 'archived' | 'draft';
export type AccessLevel = 'view' | 'search' | 'ask' | 'none';

export interface Document {
  id: string;
  name: string;
  type: DocumentType;
  category: string;
  description?: string;
  storage_path: string;
  file_size?: number;
  file_type?: string;
  uploaded_by: string;
  upload_date: string;
  last_updated: string;
  status: DocumentStatus;
  version: number;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  chunk_number: number;
  text: string;
  embedding?: number[];
  position_in_doc?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  can_view: boolean;
  can_search: boolean;
  can_ask_questions: boolean;
  can_upload: boolean;
  can_manage: boolean;
  rate_limit_per_hour: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentAccessPolicy {
  id: string;
  document_id: string;
  role_id: string;
  access_level: AccessLevel;
  created_at: string;
  updated_at: string;
}

export type AIQueryStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface AIQuery {
  id: string;
  user_id: string;
  user_role: string;
  question: string;
  answer?: string;
  source_documents?: string[];
  source_chunks?: string[];
  model_used?: string;
  tokens_used?: Record<string, any>;
  helpful_rating?: number;
  feedback?: string;
  status: AIQueryStatus;
  error_message?: string;
  requested_at: string;
  completed_at?: string;
}

export interface DocumentAuditLog {
  id: string;
  document_id: string;
  user_id: string;
  action: 'upload' | 'update' | 'delete' | 'archive' | 'view' | 'query';
  details?: string;
  ip_address?: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'created_at'>;
        Update: Partial<User>;
      };
      policies: {
        Row: Policy;
        Insert: Omit<Policy, 'created_at' | 'updated_at'>;
        Update: Partial<Policy>;
      };
      policy_versions: {
        Row: PolicyVersion;
        Insert: Omit<PolicyVersion, 'created_at'>;
        Update: Partial<PolicyVersion>;
      };
      queries: {
        Row: Query;
        Insert: Omit<Query, 'requested_at'>;
        Update: Partial<Query>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, 'created_at'>;
        Update: Partial<AuditLog>;
      };
      roles: {
        Row: Role;
        Insert: Omit<Role, 'created_at'>;
        Update: Partial<Role>;
      };
      documents: {
        Row: Document;
        Insert: Omit<Document, 'id' | 'created_at' | 'upload_date' | 'last_updated'>;
        Update: Partial<Document>;
      };
      document_chunks: {
        Row: DocumentChunk;
        Insert: Omit<DocumentChunk, 'id' | 'created_at'>;
        Update: Partial<DocumentChunk>;
      };
      role_permissions: {
        Row: RolePermission;
        Insert: Omit<RolePermission, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<RolePermission>;
      };
      document_access_policies: {
        Row: DocumentAccessPolicy;
        Insert: Omit<DocumentAccessPolicy, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<DocumentAccessPolicy>;
      };
      ai_queries: {
        Row: AIQuery;
        Insert: Omit<AIQuery, 'id' | 'requested_at'>;
        Update: Partial<AIQuery>;
      };
      document_audit_logs: {
        Row: DocumentAuditLog;
        Insert: Omit<DocumentAuditLog, 'id' | 'created_at'>;
        Update: Partial<DocumentAuditLog>;
      };
    };
  };
}
