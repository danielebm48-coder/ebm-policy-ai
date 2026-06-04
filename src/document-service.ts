import { supabaseClient, supabaseAdmin } from './supabase';
export { supabaseAdmin };
import { generateEmbedding } from './gemini';
import { Document, DocumentChunk } from './supabase-types';
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

type EditableDocumentType = 'policy' | 'manual' | 'procedure' | 'handbook' | 'other';
type DocumentStatus = 'active' | 'archived' | 'draft' | 'review';

/**
 * Parsea el contenido de un buffer (PDF, DOCX o TXT) a texto
 */
export async function parseDocumentContent(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'application/pdf') {
    const data = await pdf(buffer);
    return data.text;
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } else {
    // Asumir texto plano para otros tipos
    return buffer.toString('utf-8');
  }
}

/**
 * Dividir un texto en chunks con soporte para jerarquía Parent-Child
 * Intenta no romper palabras o líneas si es posible.
 */
export function splitTextIntoChunks(text: string, chunkSize: number = 600, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Intentar retroceder hasta el último espacio o salto de línea para no cortar palabras
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastSpace, lastNewline);

      if (breakPoint > start + (chunkSize * 0.7)) {
        end = breakPoint;
      }
    }

    chunks.push(text.substring(start, end).trim());
    if (end >= text.length) break;
    start = end - overlap;

    // Asegurarse de no entrar en un bucle infinito
    if (start >= end) start = end - 1;
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
 * Procesar chunks de un documento usando arquitectura Parent-Child
 */
export async function processDocumentChunks(documentId: string, text: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  try {
    // 1. Crear Chunks PADRE (Contexto: ~3500 chars / ~1000 tokens)
    const parentChunks = splitTextIntoChunks(text, 3500, 500);
    const parentInserts = parentChunks.map((t, i) => ({
      document_id: documentId,
      chunk_number: i,
      text: t
    }));

    const { data: savedParents, error: parentError } = await supabaseAdmin
      .from('document_parents')
      .insert(parentInserts)
      .select('id, chunk_number');

    if (parentError) {
      // Fallback: Si la tabla document_parents no existe aún, usar el método antiguo
      console.warn('document_parents table might not exist, falling back to simple chunking');
      return await processDocumentChunksLegacy(documentId, text);
    }

    const parentMap = new Map(savedParents.map(p => [p.chunk_number, p.id]));

    // 2. Crear Chunks HIJO (Vectores: ~800 chars / ~250 tokens)
    const childInserts = [];
    let overallChildIndex = 0;

    for (let i = 0; i < parentChunks.length; i++) {
      const parentText = parentChunks[i];
      const parentId = parentMap.get(i);
      
      const children = splitTextIntoChunks(parentText, 800, 150);
      
      for (const childText of children) {
        // Generar embedding para el HIJO
        let embedding: number[] | null = null;
        try {
          embedding = await generateEmbedding(childText);
        } catch (error) {
          console.warn(`Warning: Could not generate embedding for child chunk ${overallChildIndex}:`, error);
        }

        childInserts.push({
          document_id: documentId,
          parent_id: parentId,
          chunk_number: overallChildIndex++,
          text: childText,
          embedding: embedding,
          position_in_doc: {
            parent_chunk: i,
            child_in_parent: children.indexOf(childText)
          }
        });
      }
    }

    // Insertar hijos en lotes
    const batchSize = 10;
    for (let i = 0; i < childInserts.length; i += batchSize) {
      await supabaseAdmin.from('document_chunks').insert(childInserts.slice(i, i + batchSize));
    }

    console.log(`✅ Processed ${parentChunks.length} parents and ${childInserts.length} children for ${documentId}`);
  } catch (error) {
    console.error('Error in processDocumentChunks:', error);
    throw error;
  }
}

/**
 * Método legacy para compatibilidad si no se ha aplicado el SQL
 */
async function processDocumentChunksLegacy(documentId: string, text: string): Promise<void> {
  if (!supabaseAdmin) return;
  const chunks = splitTextIntoChunks(text, 1000, 200);
  const chunkInserts = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    let embedding = null;
    try { embedding = await generateEmbedding(chunkText); } catch (e) {}
    
    chunkInserts.push({
      document_id: documentId,
      chunk_number: i,
      text: chunkText,
      embedding: embedding
    });
  }

  const batchSize = 10;
  for (let i = 0; i < chunkInserts.length; i += batchSize) {
    await supabaseAdmin.from('document_chunks').insert(chunkInserts.slice(i, i + batchSize));
  }
}


export async function getDocumentText(documentId: string): Promise<string> {
  const chunks = await getDocumentChunks(documentId);
  return chunks.reduce((text, chunk) => {
    if (!text) return chunk.text;

    const maxOverlap = Math.min(150, text.length, chunk.text.length);
    for (let size = maxOverlap; size > 0; size--) {
      if (text.endsWith(chunk.text.slice(0, size))) {
        return text + chunk.text.slice(size);
      }
    }

    return `${text}\n\n${chunk.text}`;
  }, '');
}

export async function updateDocument(
  documentId: string,
  updates: {
    name: string;
    type: EditableDocumentType;
    category: string;
    text: string;
    updatedBy: string;
    description?: string;
  }
): Promise<Document> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('documents')
    .select('version')
    .eq('id', documentId)
    .single();

  if (existingError || !existing) {
    throw new Error(existingError?.message || 'Document not found');
  }

  const { data: document, error: docError } = await supabaseAdmin
    .from('documents')
    .update({
      name: updates.name,
      type: updates.type,
      category: updates.category,
      description: updates.description,
      version: (existing.version || 1) + 1,
      last_updated: new Date().toISOString(),
    })
    .eq('id', documentId)
    .select()
    .single();

  if (docError || !document) {
    throw new Error(docError?.message || 'Failed to update document');
  }

  const { error: deleteError } = await supabaseAdmin
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId);

  if (deleteError) {
    throw new Error(`Failed to replace chunks: ${deleteError.message}`);
  }

  await processDocumentChunks(documentId, updates.text);
  await logDocumentAccess(documentId, updates.updatedBy, 'update', `Updated document ${updates.name}`);

  return document as Document;
}

/**
 * Obtener todo el texto de todos los documentos permitidos para un rol
 */
export async function getAllAllowedDocumentsText(
  roleId: string,
  accessLevel: 'view' | 'search' | 'ask' = 'ask'
): Promise<{ text: string; documentNames: string[] }> {
  try {
    const db = supabaseAdmin || supabaseClient;
    
    // 1. Obtener IDs únicos de documentos permitidos por política
    const { data: policyData, error: policyError } = await db
      .from('document_access_policies')
      .select('document_id')
      .eq('role_id', roleId);

    if (policyError) throw policyError;

    let documentIds = [...new Set((policyData || []).map((d: any) => d.document_id))];

    // 2. Si no hay políticas específicas, intentar obtener documentos activos (fallback de seguridad)
    if (documentIds.length === 0) {
      const { data: activeDocs } = await db
        .from('documents')
        .select('id')
        .eq('status', 'active');
      documentIds = (activeDocs || []).map((d: any) => d.id);
    }

    if (documentIds.length === 0) {
      return { text: '', documentNames: [] };
    }

    // 3. Obtener metadatos de documentos activos
    const { data: documents, error: docError } = await db
      .from('documents')
      .select('id, name, last_updated')
      .in('id', documentIds)
      .eq('status', 'active');

    if (docError) throw docError;
    if (!documents || documents.length === 0) return { text: '', documentNames: [] };

    // DEDUPLICACIÓN POR NOMBRE: Solo tomar la versión más reciente de cada documento con el mismo nombre
    const uniqueDocsMap = new Map<string, any>();
    for (const doc of documents) {
      const existing = uniqueDocsMap.get(doc.name);
      if (!existing || new Date(doc.last_updated) > new Date(existing.last_updated)) {
        uniqueDocsMap.set(doc.name, doc);
      }
    }
    
    const uniqueDocuments = Array.from(uniqueDocsMap.values());
    const uniqueIds = uniqueDocuments.map(d => d.id);
    const documentNames = uniqueDocuments.map(d => d.name);

    // 4. Obtener chunks solo de los documentos únicos
    const { data: chunks, error: chunksError } = await db
      .from('document_chunks')
      .select('document_id, text')
      .in('document_id', uniqueIds)
      .order('chunk_number', { ascending: true });

    if (chunksError) throw chunksError;

    // 5. Agrupar texto
    const docTexts: string[] = [];

    for (const doc of uniqueDocuments) {
      const docChunks = (chunks || []).filter(c => c.document_id === doc.id);
      if (docChunks.length > 0) {
        const fullDocText = docChunks.map(c => c.text).join(' ');
        docTexts.push(`DOCUMENTO: ${doc.name}\nCONTENIDO:\n${fullDocText}\n---`);
      }
    }

    return {
      text: docTexts.join('\n\n'),
      documentNames: [] // Retornamos vacío para que el frontend no muestre la lista si así se prefiere,
                        // o podemos dejarlo y que el servicio de consulta decida.
    };
  } catch (error) {
    console.error('Error in getAllAllowedDocumentsText:', error);
    return { text: '', documentNames: [] };
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
    const db = supabaseAdmin || supabaseClient;
    const { data, error } = await db
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

    const { data: documents, error: docError } = await db
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
    const db = supabaseAdmin || supabaseClient;
    const { data, error } = await db
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
    const db = supabaseAdmin || supabaseClient;
    const { data, error } = await db
      .from('document_access_policies')
      .select('access_level')
      .eq('document_id', documentId)
      .eq('role_id', roleId)
      .single();

    if (error || !data) {
      const { data: rolePermissions, error: roleError } = await db
        .from('role_permissions')
        .select('can_ask_questions, can_search, can_view')
        .eq('role_id', roleId)
        .single();

      if (roleError || !rolePermissions) {
        return false;
      }

      if (requiredAccess === 'ask') return !!rolePermissions.can_ask_questions;
      if (requiredAccess === 'search') return !!rolePermissions.can_search;
      return !!rolePermissions.can_view;
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
