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
