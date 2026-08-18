import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// 1. Cargar variables reales para Gemini desde .env.development
const envPath = path.join(process.cwd(), '.env.development');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// 2. Configurar valores mock para Supabase antes de cargar módulos
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ptvifyvuygdbivfztvek.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'dummy_anon_key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_service_role_key';

// 3. Importar los módulos correspondientes
import { supabaseAdmin } from './supabase';
import { processUserQuery } from './query-service';

// Estructura para simular la base de datos local
let mockQueries: any[] = [];
let queryHistory: any[] = [];

// Definir los fragmentos de normativas simulados
const mockChunks = [
  {
    id: 'chunk_eval_1',
    document_id: 'doc_eval',
    text: `En la Escuela Bilingüe Maquilishuat, el sistema de evaluación varía de acuerdo con el nivel académico. 
Para el nivel de Primaria (de 1ro a 6to grado), la evaluación es de carácter puramente cualitativo, reportando el desempeño de los alumnos mediante escalas de logro: Excelente (E), Muy Bueno (MB), Satisfactorio (S) y Necesita Mejorar (NM). No existe una nota numérica de aprobación en Primaria.
Para el nivel de Secundaria y Bachillerato (de 7mo a 11mo grado), las evaluaciones son cuantitativas. Se utiliza una escala numérica que va desde 1.0 hasta 10.0. La nota mínima para aprobar cualquier materia en este nivel es de 6.0.`,
    similarity: 0.9
  }
];

const mockDocuments = [
  { id: 'doc_eval', name: 'Políticas de Evaluación Escolar' }
];

// 4. Mockear supabaseAdmin
if (supabaseAdmin) {
  supabaseAdmin.from = (table: string): any => {
    const chainObj: any = {};
    
    chainObj.select = (columns?: string) => chainObj;
    chainObj.eq = (field: string, value: any) => chainObj;
    chainObj.in = (field: string, values: any[]) => chainObj;
    chainObj.or = (filter: string) => chainObj;
    chainObj.order = (field: string, options?: any) => chainObj;
    chainObj.limit = (lim: number) => chainObj;
    chainObj.textSearch = (column: string, query: string, options?: any) => chainObj;
    
    // Permitir comportamiento Thenable para soportar "await" directamente en la cadena
    chainObj.then = (onfulfilled?: (value: any) => any) => {
      let data: any = [];
      if (table === 'ai_queries') {
        data = queryHistory;
      } else if (table === 'documents') {
        data = mockDocuments;
      } else if (table === 'document_chunks') {
        data = mockChunks;
      }
      return Promise.resolve({ data, error: null }).then(onfulfilled);
    };

    chainObj.insert = (values: any[]) => {
      const item = { ...values[0], requested_at: new Date().toISOString() };
      mockQueries.push(item);
      return Promise.resolve({ data: [item], error: null });
    };

    chainObj.update = (values: any) => {
      return {
        eq: (field: string, value: any) => {
          const queryIndex = mockQueries.findIndex(q => q.id === value);
          if (queryIndex !== -1) {
            mockQueries[queryIndex] = { ...mockQueries[queryIndex], ...values, status: 'completed' };
            queryHistory.unshift({
              question: mockQueries[queryIndex].question,
              answer: mockQueries[queryIndex].answer
            });
          }
          return Promise.resolve({ data: null, error: null });
        }
      };
    };

    return chainObj;
  };

  supabaseAdmin.rpc = (fn: string, args?: any): any => {
    if (fn === 'match_documents') {
      return Promise.resolve({ data: mockChunks, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };
}

async function runTests() {
  console.log('🧪 Iniciando Pruebas del Protocolo de Entrevista Dinámica...\n');
  const userId = 'user_test_123';
  const userRole = 'padre';

  // --- PRUEBA 1: Pregunta ambigua (Falta indicar el grado/nivel) ---
  console.log('----------------------------------------------------');
  console.log('TEST 1: Pregunta sobre nota mínima de aprobación sin especificar grado');
  const q1 = '¿Cuál es la nota mínima de aprobación de los exámenes?';
  console.log(`Pregunta: "${q1}"`);
  
  const result1 = await processUserQuery(userId, userRole, q1);
  
  console.log('\nRespuesta del Bot:');
  console.log(result1.answer);
  console.log('Fuentes citadas:', result1.sourceDocuments);
  
  const isClarifying = result1.answer.includes('grado') || result1.answer.includes('nivel');
  if (isClarifying) {
    console.log('\n✅ TEST 1 PASADO: El bot interceptó con éxito la consulta y pidió aclaración.');
  } else {
    console.error('\n❌ TEST 1 FALLÓ: El bot no pidió aclaraciones.');
  }

  console.log('\n⏳ Esperando 25 segundos para evitar límites de cuota de Gemini (Free Tier)...');
  await new Promise(resolve => setTimeout(resolve, 25000));

  // --- PRUEBA 2: El usuario responde aclarando que es de Secundaria ---
  console.log('\n----------------------------------------------------');
  console.log('TEST 2: El usuario responde indicando que es para Secundaria');
  const q2 = 'Es para secundaria';
  console.log(`Pregunta: "${q2}"`);
  
  const result2 = await processUserQuery(userId, userRole, q2);
  
  console.log('\nRespuesta del Bot:');
  console.log(result2.answer);
  console.log('Fuentes citadas:', result2.sourceDocuments);

  const hasAnswer = result2.answer.includes('6.0') || result2.answer.includes('6');
  if (hasAnswer) {
    console.log('\n✅ TEST 2 PASADO: El bot usó el historial, comprendió el nivel y respondió 6.0.');
  } else {
    console.error('\n❌ TEST 2 FALLÓ: El bot no dio la respuesta correcta para Secundaria.');
  }
}

runTests().catch(err => {
  console.error('Error corriendo pruebas:', err);
});
