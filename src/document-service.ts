import { supabaseClient, supabaseAdmin } from './supabase';
export { supabaseAdmin };
import { generateEmbedding } from './gemini';
import { Document, DocumentChunk } from './supabase-types';

/**
 * Dividir un texto en chunks
 */
export function splitTextIntoChunks(text: string, chunkSize: number = 500, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    if (end === text.length) break;
    start = end - overlap;
  }

  return chunks;
}

/**
 * Guardar un documento en Supabase Storage
 */
export async function uploadDocumentFile(
  file: Buffer,
  fileName: string,
  documentId: string
): Promise<string> {
  const storagePath = `documents/${documentId}/${fileName}`;

  const { data, error } = await supabaseClient.storage
    .from('policies')
    .upload(storagePath, file, {
      contentType: 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload file: ${error.message}`);
  }

  return data.path;
}

/**
 * Crear documento en la base de datos y procesarlo
 */
export async function createDocument(
  name: string,
  type: 'policy' | 'manual' | 'procedure' | 'handbook' | 'other',
  category: string,
  text: string,
  uploadedBy: string,
  description?: string
): Promise<Document> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  const documentId = `doc_${Date.now()}`;

  try {
    // Crear registro de documento
    const { data: documentData, error: docError } = await supabaseAdmin
      .from('documents')
      .insert([
        {
          id: documentId,
          name,
          type,
          category,
          description,
          storage_path: `documents/${documentId}`,
          uploaded_by: uploadedBy,
          status: 'active',
        },
      ])
      .select()
      .single();

    if (docError) {
      throw new Error(`Failed to create document: ${docError.message}`);
    }

    // Procesar chunks
    await processDocumentChunks(documentId, text);

    return documentData as Document;
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
}

/**
 * Procesar chunks de un documento y generar embeddings
 */
export async function processDocumentChunks(documentId: string, text: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  try {
    const chunks = splitTextIntoChunks(text);
    const chunkInserts = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];

      // Generar embedding
      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(chunkText);
      } catch (error) {
        console.warn(`Warning: Could not generate embedding for chunk ${i}:`, error);
      }

      chunkInserts.push({
        document_id: documentId,
        chunk_number: i,
        text: chunkText,
        embedding: embedding,
        position_in_doc: {
          chunk: i,
          total_chunks: chunks.length,
        },
      });
    }

    // Insertar chunks en lotes
    const batchSize = 10;
    for (let i = 0; i < chunkInserts.length; i += batchSize) {
      const batch = chunkInserts.slice(i, i + batchSize);

      const { error } = await supabaseAdmin
        .from('document_chunks')
        .insert(batch);

      if (error) {
        throw new Error(`Failed to insert chunks: ${error.message}`);
      }
    }

    console.log(`✅ Processed ${chunks.length} chunks for document ${documentId}`);
  } catch (error) {
    console.error('Error processing document chunks:', error);
    throw error;
  }
}

/**
 * Buscar documentos por permiso de rol
 */
export async function getDocumentsByRolePermission(
  roleId: string,
  accessLevel: 'view' | 'search' | 'ask' = 'view'
): Promise<Document[]> {
  try {
    const { data, error } = await supabaseClient
      .from('document_access_policies')
      .select('document_id')
      .eq('role_id', roleId);

    if (error) {
      throw new Error(`Failed to fetch permissions: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    const documentIds = data.map((d: any) => d.document_id);

    const { data: documents, error: docError } = await supabaseClient
      .from('documents')
      .select('*')
      .in('id', documentIds)
      .eq('status', 'active');

    if (docError) {
      throw new Error(`Failed to fetch documents: ${docError.message}`);
    }

    return documents as Document[];
  } catch (error) {
    console.error('Error fetching documents by role:', error);
    throw error;
  }
}

/**
 * Obtener chunks de documento específico
 */
export async function getDocumentChunks(documentId: string): Promise<DocumentChunk[]> {
  try {
    const { data, error } = await supabaseClient
      .from('document_chunks')
      .select('*')
      .eq('document_id', documentId)
      .order('chunk_number', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch chunks: ${error.message}`);
    }

    return data as DocumentChunk[];
  } catch (error) {
    console.error('Error fetching document chunks:', error);
    throw error;
  }
}

/**
 * Registrar acceso/auditoría a documento
 */
export async function logDocumentAccess(
  documentId: string,
  userId: string,
  action: 'upload' | 'update' | 'delete' | 'archive' | 'view' | 'query',
  details?: string,
  ipAddress?: string
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  try {
    const { error } = await supabaseAdmin
      .from('document_audit_logs')
      .insert([
        {
          document_id: documentId,
          user_id: userId,
          action,
          details,
          ip_address: ipAddress,
        },
      ]);

    if (error) {
      console.warn('Failed to log document access:', error);
    }
  } catch (error) {
    console.warn('Error logging document access:', error);
  }
}

/**
 * Verificar permisos de acceso a documento
 */
export async function checkDocumentAccess(
  documentId: string,
  roleId: string,
  requiredAccess: 'view' | 'search' | 'ask' = 'view'
): Promise<boolean> {
  try {
    const { data, error } = await supabaseClient
      .from('document_access_policies')
      .select('access_level')
      .eq('document_id', documentId)
      .eq('role_id', roleId)
      .single();

    if (error || !data) {
      return false;
    }

    const accessLevels = ['view', 'search', 'ask'];
    const userAccessIndex = accessLevels.indexOf(data.access_level);
    const requiredIndex = accessLevels.indexOf(requiredAccess);

    return userAccessIndex >= requiredIndex;
  } catch (error) {
    console.error('Error checking document access:', error);
    return false;
  }
}
