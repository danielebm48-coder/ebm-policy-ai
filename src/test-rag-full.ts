import { processUserQuery } from './query-service';
import { loadEnv } from './config/env';

loadEnv();

async function testRAG() {
  const userId = 'u_alumno';
  const role = 'alumno';
  const question = '¿Qué dice el manual sobre la puntualidad?';

  console.log(`Preguntando: "${question}" como ${role}...`);

  try {
    const result = await processUserQuery(userId, role, question);
    console.log('\n--- RESPUESTA ---');
    console.log(result.answer);
    console.log('\n--- FUENTES ---');
    console.log(result.sourceDocuments);
  } catch (error) {
    console.error('Error en RAG:', error);
  }
}

testRAG();
