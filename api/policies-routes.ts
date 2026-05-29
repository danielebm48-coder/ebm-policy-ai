import express, { Request, Response, NextFunction } from 'express';
import { supabaseClient, supabaseAdmin } from '../src/supabase';
import { createDocument, logDocumentAccess, getDocumentsByRolePermission } from '../src/document-service';
import { processUserQuery, rateQueryResponse, getUserQueryHistory, getQueryStatistics } from '../src/query-service';
import { Document, AIQuery } from '../src/supabase-types';

const router = express.Router();

// Middleware para validar usuario autenticado
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    email: string;
  };
}

const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  // TODO: Implementar autenticación real con JWT/Supabase Auth
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  req.user = {
    id: userId,
    role: userRole,
    email: req.headers['x-user-email'] as string || '',
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

// ===================================================================
// RUTAS DE CONSULTAS IA (RAG)
// ===================================================================

/**
 * POST /api/policies/ask - Hacer una pregunta al repositorio
 */
router.post('/ask', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { question } = req.body;
    const user = req.user!;
    const ipAddress = req.ip;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: 'Question is required' });
    }

    await ensureSupabaseUser(user);

    // Procesar consulta
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

/**
 * POST /api/policies/ask/:queryId/rate - Calificar una respuesta
 */
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

/**
 * GET /api/policies/history - Obtener historial de consultas del usuario
 */
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

/**
 * GET /api/policies/debug/knowledge - Diagnostico de la base de conocimiento
 */
router.get('/debug/knowledge', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const [documents, chunks, accessPolicies, roles] = await Promise.all([
      supabaseClient.from('documents').select('id, name, status', { count: 'exact' }).limit(10),
      supabaseClient.from('document_chunks').select('id, document_id', { count: 'exact' }).limit(10),
      supabaseClient.from('document_access_policies').select('document_id, role_id, access_level', { count: 'exact' }).limit(10),
      supabaseClient.from('role_permissions').select('role_id, can_ask_questions', { count: 'exact' }).limit(10),
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

/**
 * GET /api/policies/documents - Obtener documentos accesibles por el usuario
 */
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

/**
 * POST /api/policies/documents - Crear/subir un nuevo documento
 */
router.post('/documents', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { name, type, category, text, description } = req.body;

    // Verificar permisos de upload
    const { data: permissions, error: permError } = await supabaseClient
      .from('role_permissions')
      .select('can_upload')
      .eq('role_id', user.role)
      .single();

    if (permError || !permissions?.can_upload) {
      return res.status(403).json({ error: 'You do not have permission to upload documents' });
    }

    // Validar campos requeridos
    if (!name || !type || !category || !text) {
      return res.status(400).json({
        error: 'Missing required fields: name, type, category, text',
      });
    }

    // Crear documento
    const document = await createDocument(name, type, category, text, user.id, description);

    if (supabaseAdmin) {
      const roleIds = ['admin', 'directivo', 'profesor', 'alumno', 'padre'];
      const accessRows = roleIds.map((roleId) => ({
        document_id: document.id,
        role_id: roleId,
        access_level: 'ask',
      }));

      const { error: accessError } = await supabaseAdmin
        .from('document_access_policies')
        .upsert(accessRows, { onConflict: 'document_id,role_id' });

      if (accessError) {
        console.warn('Failed to set document access policies:', accessError);
      }
    }

    // Registrar auditoría
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

/**
 * GET /api/policies/documents/:documentId - Obtener detalles de un documento
 */
router.get('/documents/:documentId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    const { documentId } = req.params;

    const { data: document, error } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Registrar acceso
    await logDocumentAccess(documentId, user.id, 'view', 'Document viewed', req.ip);

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      error: 'Failed to fetch document',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ===================================================================
// RUTAS DE ADMINISTRACIÓN
// ===================================================================

/**
 * GET /api/policies/admin/statistics - Obtener estadísticas de consultas
 */
router.get('/admin/statistics', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    // Verificar permisos de admin
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

/**
 * GET /api/policies/admin/unanswered - Consultas sin respuesta documental
 */
router.get('/admin/unanswered', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    if (user.role !== 'admin' && user.role !== 'directivo') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const { data, error } = await supabaseClient
      .from('ai_queries')
      .select('id, user_id, user_role, question, requested_at, completed_at, status')
      .eq('error_message', 'NO_DOCUMENT_MATCH')
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

/**
 * POST /api/policies/admin/permissions - Configurar permisos de rol
 */
router.post('/admin/permissions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;

    // Verificar permisos de admin
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

    // Registrar auditoría
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

export default router;
