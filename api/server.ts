import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// En producción, serviremos el frontend compilado desde el mismo servidor Express
// para evitar problemas de CORS y simplificar el despliegue.

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
const port = process.env.PORT || 4000;

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
    action: 'query',
    actorId: userId,
    details: `Consulta IA: ${question}`,
  });

  res.json({ answer, references });
});

// Servir archivos estáticos del Frontend en producción
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendPath = path.join(__dirname, '../app');

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(frontendPath));
  
  // Cualquier ruta que no sea API redirige al index.html de React (Single Page App)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

async function start(): Promise<void> {
  app.listen(port, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${port}`);
  });
}

start().catch((error) => {
  console.error('Error starting server:', error);
  process.exit(1);
});
