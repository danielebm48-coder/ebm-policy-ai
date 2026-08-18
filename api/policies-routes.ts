import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { verifyToken } from '../src/services/authService';
import { supabaseClient, supabaseAdmin } from '../src/supabase';
import { createDocument, getDocumentText, logDocumentAccess, getDocumentsByRolePermission, updateDocument, parseDocumentContent, deleteDocument } from '../src/document-service';
import { normalizeText } from '../src/utils/encoding';
import { processUserQuery, rateQueryResponse, getUserQueryHistory, getQueryStatistics, getIARecommendations, getStakeholderInsights, resetSystemStats, markQueryAsProcessed, clearAllSystemData } from '../src/query-service';
import { Document, AIQuery } from '../src/supabase-types';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware para validar usuario autenticado
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = {
    id: payload.userId,
    role: payload.role,
    email: payload.email,
  };

  next();
};

const roleNames: Record<string, string> = {
  admin: 'Administrador',
  directivo: 'Directivo/Rectoria',
  profesor: 'Profesor',
  alumno: 'Estudiante',
  padre: 'Padre/Apoderado',
};

function normalizeUploadedFileName(fileName: string): string {
  return normalizeText(fileName);
}

const fallbackNames: Record<string, string> = {
  admin: 'Sistema',
  directivo: 'Directora Ana',
  profesor: 'Profesor Luis',
  alumno: 'Alumno Mario',
  padre: 'Padre Carmen',
};

async function ensureSupabaseUser(user: AuthRequest['user']): Promise<void> {
  if (!user || !supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  const now = new Date().toISOString();

  const { error: roleError } = await supabaseAdmin
    .from('roles')
    .upsert(
      {
        id: user.role,
        name: roleNames[user.role] || user.role,
        description: `Rol ${user.role}`,
        created_at: now,
      },
      { onConflict: 'id' }
    );

  if (roleError) {
    throw new Error(`Failed to ensure role: ${roleError.message}`);
  }

  const { error: userError } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        id: user.id,
        name: fallbackNames[user.role] || user.email || user.id,
        email: user.email || `${user.id}@colegio.edu`,
        role: user.role,
        active: true,
        password: 'render-managed',
        created_at: now,
      },
      { onConflict: 'id' }
    );

  if (userError) {
    throw new Error(`Failed to ensure user: ${userError.message}`);
  }
}

// Helper para actualizar permisos
async function updateDocumentPermissions(documentId: string, permissions: string[]) {
  if (!supabaseAdmin) throw new Error('Admin client not configured');

  const roleIds = ['admin', 'directivo', 'profesor', 'alumno', 'padre'];
  const accessRows = roleIds.map((roleId) => ({
    document_id: documentId,
    role_id: roleId,
    access_level: permissions.includes(roleId) ? 'ask' : 'none',
  }));

  const { error } = await supabaseAdmin
    .from('document_access_policies')
    .upsert(accessRows, { onConflict: 'document_id,role_id' });

  if (error) throw new Error(`Failed to update permissions: ${error.message}`);
}

// ===================================================================
// RUTAS DE CONSULTAS IA (RAG)
// ===================================================================

router.post('/ask', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { question } = req.body;
    const user = req.user!;
    const ipAddress = req.ip;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    await ensureSupabaseUser(user);

    const result = await processUserQuery(user.id, user.role, question, ipAddress);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error in /ask:', error);
    res.status(500).json({
      error: 'Failed to process question',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/ask/:queryId/rate', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { queryId } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    await rateQueryResponse(queryId, rating, feedback);

    res.json({ success: true, message: 'Rating recorded' });
  } catch (error) {
    console.error('Error rating response:', error);
    res.status(500).json({
      error: 'Failed to rate response',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const limit = parseInt(req.query.limit as string) || 20;

    const queries = await getUserQueryHistory(user.id, limit);

    res.json({
      success: true,
      data: queries,
    });
  } catch (error) {
    console.error('Error fetching query history:', error);
    res.status(500).json({
      error: 'Failed to fetch query history',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/debug/knowledge', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const db = supabaseAdmin || supabaseClient;
    const [documents, chunks, accessPolicies, roles] = await Promise.all([
      db.from('documents').select('id, name, status', { count: 'exact' }).limit(10),
      db.from('document_chunks').select('id, document_id', { count: 'exact' }).limit(10),
      db.from('document_access_policies').select('document_id, role_id, access_level', { count: 'exact' }).limit(10),
      db.from('role_permissions').select('role_id, can_ask_questions', { count: 'exact' }).limit(10),
    ]);

    res.json({
      success: true,
      data: {
        documents: {
          count: documents.count || 0,
          sample: documents.data || [],
          error: documents.error?.message,
        },
        chunks: {
          count: chunks.count || 0,
          sample: chunks.data || [],
          error: chunks.error?.message,
        },
        accessPolicies: {
          count: accessPolicies.count || 0,
          sample: accessPolicies.data || [],
          error: accessPolicies.error?.message,
        },
        rolePermissions: {
          count: roles.count || 0,
          sample: roles.data || [],
          error: roles.error?.message,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to inspect knowledge base',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================================================================
// RUTAS DE DOCUMENTOS
// ===================================================================

router.get('/documents', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const documents = await getDocumentsByRolePermission(user.role, 'view');
    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      error: 'Failed to fetch documents',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/documents', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, type, category, text, description, permissions: reqPermissions } = req.body;

    const db = supabaseAdmin || supabaseClient;
    const { data: permissions, error: permError } = await db
      .from('role_permissions')
      .select('can_upload')
      .eq('role_id', user.role)
      .single();

    if (permError || !permissions?.can_upload) {
      return res.status(403).json({ error: 'You do not have permission to upload documents' });
    }

    if (!name || !type || !category || !text) {
      return res.status(400).json({
        error: 'Missing required fields: name, type, category, text',
      });
    }

    const document = await createDocument(name, type, category, text, user.id, description);

    if (reqPermissions && Array.isArray(reqPermissions)) {
      await updateDocumentPermissions(document.id, reqPermissions);
    } else if (supabaseAdmin) {
      const roleIds = ['admin', 'directivo', 'profesor', 'alumno', 'padre'];
      const accessRows = roleIds.map((roleId) => ({
        document_id: document.id,
        role_id: roleId,
        access_level: 'ask',
      }));

      await supabaseAdmin
        .from('document_access_policies')
        .upsert(accessRows, { onConflict: 'document_id,role_id' });
    }

    await logDocumentAccess(document.id, user.id, 'upload', `Uploaded by ${user.email}`, req.ip);

    res.status(201).json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({
      error: 'Failed to create document',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/documents/:documentId/download', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { documentId } = req.params;

    const visibleDocuments = await getDocumentsByRolePermission(user.role, 'view');
    if (!visibleDocuments.some((document) => document.id === documentId)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const db = supabaseAdmin || supabaseClient;
    const { data: document, error } = await db
      .from('documents')
      .select('name')
      .eq('id', documentId)
      .single();

    if (error || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const text = await getDocumentText(documentId);
    const safeName = String(document.name || documentId)
      .replace(/[^a-z0-9ñÑáéíóúÁÉÍÓÚüÜ_-]+/gi, '-')
      .replace(/^-|-$/g, '');

    await logDocumentAccess(documentId, user.id, 'view', 'Document downloaded', req.ip);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName || documentId}.txt"`);
    res.send(text);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({
      error: 'Failed to download document',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/documents/:documentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { documentId } = req.params;

    const db = supabaseAdmin || supabaseClient;
    const { data: document, error } = await db
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const text = await getDocumentText(documentId);

    await logDocumentAccess(documentId, user.id, 'view', 'Document viewed', req.ip);

    res.json({
      success: true,
      data: {
        ...document,
        text,
      },
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      error: 'Failed to fetch document',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.patch('/documents/:documentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { documentId } = req.params;
    const { name, type, category, text, description, permissions: reqPermissions } = req.body;

    const db = supabaseAdmin || supabaseClient;
    const { data: permissions, error: permError } = await db
      .from('role_permissions')
      .select('can_upload, can_manage')
      .eq('role_id', user.role)
      .single();

    if (permError || (!permissions?.can_upload && !permissions?.can_manage)) {
      return res.status(403).json({ error: 'You do not have permission to update documents' });
    }

    if (!name || !type || !category || !text) {
      return res.status(400).json({
        error: 'Missing required fields: name, type, category, text',
      });
    }

    const document = await updateDocument(documentId, {
      name: String(name).trim(),
      type,
      category: String(category).trim(),
      description: description ? String(description).trim() : undefined,
      text: String(text).trim(),
      updatedBy: user.id,
    });

    if (reqPermissions && Array.isArray(reqPermissions)) {
      await updateDocumentPermissions(documentId, reqPermissions);
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({
      error: 'Failed to update document',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================================================================
// RUTAS DE ADMINISTRACIÓN
// ===================================================================

router.get('/admin/statistics', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { startDate, endDate } = req.query;
    const stats = await getQueryStatistics(startDate as string, endDate as string);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/admin/unanswered', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const db = supabaseAdmin || supabaseClient;
    const { data, error } = await db
      .from('ai_queries')
      .select('id, user_id, user_role, question, requested_at, completed_at, status')
      .eq('error_message', 'NO_DOCUMENT_MATCH')
      .or('is_processed.is.false,is_processed.is.null')
      .order('requested_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message);
    }

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Error fetching unanswered queries:', error);
    res.status(500).json({
      error: 'Failed to fetch unanswered queries',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/admin/permissions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { documentId, roleId, accessLevel } = req.body;
    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Admin client not configured' });
    }

    const { error } = await supabaseAdmin
      .from('document_access_policies')
      .upsert(
        {
          document_id: documentId,
          role_id: roleId,
          access_level: accessLevel,
        },
        { onConflict: 'document_id,role_id' }
      );

    if (error) {
      return res.status(400).json({ error: `Failed to set permissions: ${error.message}` });
    }

    await logDocumentAccess(documentId, user.id, 'update', `Set ${roleId} permissions to ${accessLevel}`, req.ip);

    res.json({
      success: true,
      message: `Permissions set for role ${roleId}`,
    });
  } catch (error) {
    console.error('Error setting permissions:', error);
    res.status(500).json({
      error: 'Failed to set permissions',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/admin/recommendations', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const recommendations = await getIARecommendations();
    res.json({ success: true, data: recommendations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch recommendations', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/admin/stats/reset', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'directivo') {
      return res.status(403).json({ error: 'Solo los directores pueden reiniciar estadísticas globales' });
    }

    const { type } = req.body;
    await resetSystemStats(type || 'all');

    res.json({ success: true, message: `Estadísticas de tipo ${type || 'all'} reiniciadas` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset stats', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/admin/queries/:queryId/process', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { queryId } = req.params;

    await markQueryAsProcessed(queryId, user.id);

    res.json({ success: true, message: 'Consulta marcada como procesada' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process query', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.get('/admin/processed-suggestions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const db = supabaseAdmin || supabaseClient;
    const { data, error } = await db
      .from('ai_queries')
      .select('id, question, processed_at, processed_by')
      .eq('is_processed', true)
      .order('processed_at', { ascending: false });

    if (error) throw error;

    res.json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch processed suggestions', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});


router.delete('/documents/:documentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { documentId } = req.params;

    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    await deleteDocument(documentId);
    await logDocumentAccess(documentId, user.id, 'delete', 'Document permanently deleted', req.ip);
    
    res.json({ success: true, message: 'Document and all its fragments deleted permanently' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete document', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.patch('/documents/:documentId/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { documentId } = req.params;
    const { status } = req.body;

    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!['active', 'archived', 'draft', 'review'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (!supabaseAdmin) throw new Error('Admin client not configured');

    const { error } = await supabaseAdmin
      .from('documents')
      .update({ status, last_updated: new Date().toISOString() })
      .eq('id', documentId);

    if (error) throw error;

    await logDocumentAccess(documentId, user.id, 'update', `Status changed to ${status}`, req.ip);
    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update status', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.post('/documents/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const file = req.file;
    const { type, category, description, permissions: reqPermissionsRaw } = req.body;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!type || !category) return res.status(400).json({ error: 'Type and category are required' });

    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const text = await parseDocumentContent(file.buffer, file.mimetype);
    const originalName = normalizeUploadedFileName(file.originalname);
    const name = originalName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' ');

    const document = await createDocument(name, type, category, text, user.id, description);

    let reqPermissions: string[] | undefined;
    if (reqPermissionsRaw) {
      try {
        reqPermissions = typeof reqPermissionsRaw === 'string' ? JSON.parse(reqPermissionsRaw) : reqPermissionsRaw;
      } catch (e) {
        console.warn('Failed to parse permissions from upload:', e);
      }
    }

    if (reqPermissions && Array.isArray(reqPermissions)) {
      await updateDocumentPermissions(document.id, reqPermissions);
    } else if (supabaseAdmin) {
      const roleIds = ['admin', 'directivo', 'profesor', 'alumno', 'padre'];
      const accessRows = roleIds.map((roleId) => ({
        document_id: document.id,
        role_id: roleId,
        access_level: 'ask',
      }));
      await supabaseAdmin.from('document_access_policies').upsert(accessRows, { onConflict: 'document_id,role_id' });
    }

    await logDocumentAccess(document.id, user.id, 'upload', `Uploaded file ${file.originalname}`, req.ip);

    res.status(201).json({ success: true, data: document });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload document', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// ===================================================================
// DEBUGGING ENDPOINTS
// ===================================================================

router.get('/debug/documents-detailed', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const db = supabaseAdmin || supabaseClient;
    
    // Obtener todos los documentos
    const { data: documents, error: docsError } = await db
      .from('documents')
      .select('id, name, status, type, category, created_at')
      .order('created_at', { ascending: false });

    if (docsError) {
      throw docsError;
    }

    // Para cada documento, obtener el número de chunks
    const documentDetails = [];
    for (const doc of documents || []) {
      const { count: chunkCount, error: countError } = await db
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', doc.id);

      const { data: policies } = await db
        .from('document_access_policies')
        .select('role_id, access_level')
        .eq('document_id', doc.id);

      documentDetails.push({
        ...doc,
        chunks_count: countError ? 0 : chunkCount || 0,
        access_policies: policies || [],
      });
    }

    // Información general
    const { data: allChunks, error: chunksError } = await db
      .from('document_chunks')
      .select('id', { count: 'exact', head: true });

    const { data: allPolicies, error: policiesError } = await db
      .from('document_access_policies')
      .select('id', { count: 'exact', head: true });

    res.json({
      success: true,
      summary: {
        total_documents: documents?.length || 0,
        total_chunks: chunksError ? 0 : (allChunks?.length || 0),
        total_policies: policiesError ? 0 : (allPolicies?.length || 0),
      },
      documents: documentDetails,
      notes: [
        'This endpoint shows all documents and their chunk counts',
        'Look for Calendar document and verify it has chunks',
        'Check that document_access_policies exist for each document',
      ],
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch detailed document info',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/admin/system/reset-all', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    if (user.role !== 'directivo') {
      return res.status(403).json({ error: 'Accion restringida a Directores' });
    }

    await clearAllSystemData();
    res.json({ success: true, message: 'Sistema reiniciado: historial de consultas y auditoria eliminados.' });
  } catch (error) {
    console.error('Error resetting system data:', error);
    res.status(500).json({ error: 'Failed to reset system data', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

export default router;
