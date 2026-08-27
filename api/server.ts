import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import bodyParser from 'body-parser';
import cors from 'cors';

import { 
  createSamplePolicies, 
  listPolicies, 
  findPolicyById, 
  createPolicy, 
  updatePolicy, 
  searchPolicies, 
  buildReferences 
} from '../src/services/policyService';
import { 
  createToken, 
  verifyToken,
  initAuth, 
  loginUser, 
  registerUser, 
  listPendingApprovals, 
  approveAdmin, 
  rejectAdmin 
} from '../src/services/authService';
import { answerQuestion } from '../src/services/iaService';
import { createQuery } from '../src/repositories/queryRepository';
import { addAuditEntry } from '../src/repositories/auditRepository';
import { initDb } from '../src/db';
import { supabaseAdmin, testSupabaseConnection } from '../src/supabase';
import { geminiConfig } from '../src/gemini';
import policiesRoutes from './policies-routes';

const app = express();

// Configuración de Puerto
const rawPort = process.env.PORT || '10000';
const parsedPort = parseInt(rawPort, 10);
const finalPort = isNaN(parsedPort) ? 10000 : parsedPort;

app.use(cors());
app.use(bodyParser.json());

// Simple request-id middleware for tracing
app.use((req: Request, _res: Response, next: NextFunction) => {
  const incoming = (req.headers['x-request-id'] as string) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  // store on res.locals for access in handlers
  (req as any).requestId = incoming;
  res.locals.requestId = incoming;
  next();
});

// Middleware para validar usuario autenticado
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
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

  req.user = { id: payload.userId, role: payload.role };
  next();
};

const requireDirector = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'directivo') {
    return res.status(403).json({ error: 'Solo los Directivos pueden realizar esta acción.' });
  }
  next();
};

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'school-policy-ai',
    time: new Date().toISOString(),
  });
});

// Health endpoint with internal checks for Supabase and Gemini configuration
app.get('/api/health/internal', async (_req, res) => {
  const now = new Date().toISOString();
  const result: any = {
    ok: true,
    service: 'school-policy-ai',
    time: now,
    checks: {
      supabase: {
        configured: !!supabaseAdmin,
        reachable: null,
        message: null,
      },
      gemini: {
        configured: geminiConfig.isConfigured,
        model: geminiConfig.model,
      },
    },
  };

  if (supabaseAdmin) {
    try {
      await testSupabaseConnection();
      result.checks.supabase.reachable = true;
    } catch (err: any) {
      result.ok = false;
      result.checks.supabase.reachable = false;
      result.checks.supabase.message = err instanceof Error ? err.message : String(err);
    }
  } else {
    result.ok = false;
    result.checks.supabase.reachable = false;
    result.checks.supabase.message = 'SUPABASE_SERVICE_ROLE_KEY not configured';
  }

  if (!geminiConfig.isConfigured) {
    result.ok = false;
    result.checks.gemini.message = 'GEMINI_API_KEY not configured';
  }

  res.status(result.ok ? 200 : 503).json(result);
});

app.use('/api/policies', policiesRoutes);

app.post('/api/auth/login', async (req, res) => {
  try {
    await initAuth();
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    
    if (!result) return res.status(401).json({ error: 'Credenciales invalidas' });
    if (result.error) return res.status(403).json({ error: result.error });

    const token = createToken(result.user!.id, result.user!.role, result.user!.email);
    res.json({ token, user: result.user });
  } catch (error) {
    console.error('[ERROR] Login failed:', error);
    res.status(500).json({
      error: 'No se pudo iniciar sesion',
      details: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, studentCode } = req.body;
    const result = await registerUser({ name, email, password, role, studentCode });
    
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const token = result.pendingApproval ? null : createToken(result.user!.id, result.user!.role, result.user!.email);
    res.status(201).json({ 
      token, 
      user: result.user, 
      pendingApproval: result.pendingApproval,
      message: result.pendingApproval 
        ? 'Registro exitoso. Tu cuenta requiere aprobación de un Directivo para activarse.' 
        : 'Registro exitoso.'
    });
  } catch (error) {
    console.error('[ERROR] Registration failed:', error);
    res.status(500).json({
      error: 'No se pudo completar el registro',
      details: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
});

app.get('/api/auth/approvals', requireAuth, requireDirector, async (_req, res) => {
  try {
    const approvals = await listPendingApprovals();
    res.json({ success: true, data: approvals });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener aprobaciones' });
  }
});

app.post('/api/auth/approvals/:id/approve', requireAuth, requireDirector, async (req: AuthRequest, res) => {
  try {
    await approveAdmin(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Usuario aprobado con éxito' });
  } catch (error) {
    res.status(500).json({ error: 'Error al aprobar usuario' });
  }
});

app.post('/api/auth/approvals/:id/reject', requireAuth, requireDirector, async (req: AuthRequest, res) => {
  try {
    await rejectAdmin(req.params.id, req.user!.id);
    res.json({ success: true, message: 'Solicitud rechazada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al rechazar solicitud' });
  }
});

app.post('/api/query', async (req, res) => {
  const { userId, role, question } = req.body;
  const matches = await searchPolicies(question);
  const references = buildReferences(matches);
  const answer = answerQuestion({ userId, role, question, requestedAt: new Date().toISOString() }, references);

  await createQuery({
    id: `query_${Math.random().toString(36).substring(2, 10)}`,
    userId,
    role,
    question,
    requestedAt: new Date().toISOString(),
  });

  await addAuditEntry({
    id: `audit_${Math.random().toString(36).substring(2, 10)}`,
    action: 'query',
    actorId: userId,
    details: `Consulta IA: ${question}`,
  });

  res.json({ answer, references });
});

// Servir archivos estáticos del Frontend en producción
const frontendPath = path.join(process.cwd(), 'dist/app');

if (process.env.NODE_ENV === 'production') {
  console.log(`[SERVER] Serving static files from: ${frontendPath}`);
  app.use(express.static(frontendPath));
  
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

async function start(): Promise<void> {
  // Inicializar base de datos
  try {
    await initDb();
    console.log('[SERVER] Database initialized');
  } catch (dbError) {
    console.warn('[SERVER] Database initialization failed (might already exist):', dbError instanceof Error ? dbError.message : dbError);
  }

  const server = app.listen(finalPort, '0.0.0.0', () => {
    const address = server.address();
    const actualPort = typeof address === 'string' ? address : address?.port;
    console.log(`[SERVER] Listening on 0.0.0.0:${actualPort}`);
    console.log(`[SERVER] Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

start().catch((error) => {
  console.error('[ERROR] Starting server:', error);
  process.exit(1);
});
