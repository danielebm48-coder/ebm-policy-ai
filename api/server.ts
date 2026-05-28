import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Importaciones del servidor original
import bodyParser from 'body-parser';
import cors from 'cors';
import { createSamplePolicies, listPolicies, findPolicyById, createPolicy, updatePolicy, searchPolicies, buildReferences } from '../src/services/policyService';
import { createToken, loginUser } from '../src/services/authService';
import { answerQuestion } from '../src/services/iaService';
import { createQuery } from '../src/repositories/queryRepository';
import { addAuditEntry } from '../src/repositories/auditRepository';
import policiesRoutes from './policies-routes';

const app = express();

// Configuración de Puerto para Render
const rawPort = process.env.PORT || '10000';
const parsedPort = parseInt(rawPort, 10);
const finalPort = isNaN(parsedPort) ? 10000 : parsedPort;

app.use(cors());
app.use(bodyParser.json());

// API Routes
app.use('/api/policies', policiesRoutes);

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await loginUser(email, password);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = createToken(user.id, user.role);
  res.json({ token, user });
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
