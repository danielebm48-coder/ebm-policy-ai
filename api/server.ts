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
import policiesRoutes from './policies-routes';

const app = express();

// Configuración de Puerto
const rawPort = process.env.PORT || '10000';
const parsedPort = parseInt(rawPort, 10);
const finalPort = isNaN(parsedPort) ? 10000 : parsedPort;

app.use(cors());
app.use(bodyParser.json());

// Middleware para validar usuario autenticado
interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.headers['x-user-id'] as string;
  const userRole = req.headers['x-user-role'] as string;

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  req.user = { id: userId, role: userRole };
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

app.use('/api/policies', policiesRoutes);

app.post('/api/auth/login', async (req, res) => {
  try {
    await initAuth();
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    
    if (!result) return res.status(401).json({ error: 'Credenciales invalidas' });
    if (result.error) return res.status(403).json({ error: result.error });

    const token = createToken(result.user!.id, result.user!.role);
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

    const token = result.pendingApproval ? null : createToken(result.user!.id, result.user!.role);
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
