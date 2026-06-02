import { supabaseClient, supabaseAdmin } from './supabase';
import { generateEmbedding, generateResponse } from './gemini';
import { getDocumentChunks, logDocumentAccess, checkDocumentAccess } from './document-service';
import { AIQuery } from './supabase-types';

interface QueryResult {
  queryId: string;
  question: string;
  answer: string;
  sourceDocuments: string[];
  tokensUsed: { input: number; output: number };
}

interface ChunkWithSimilarity {
  id: string;
  document_id: string;
  text: string;
  similarity: number;
}

/**
 * TOKENIZACIÓN Y LIMPIEZA
 */
function tokenizeQuestion(question: string): string[] {
  const stopWords = new Set(['que', 'como', 'cuando', 'donde', 'cual', 'sobre', 'para', 'por', 'con', 'los', 'las', 'del', 'de', 'la', 'el', 'en', 'y', 'o', 'a']);
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

/**
 * BÚSQUEDA SEMÁNTICA (VECTORIAL)
 */
async function findSimilarChunks(question: string, limit: number = 10): Promise<ChunkWithSimilarity[]> {
  try {
    const questionEmbedding = await generateEmbedding(question);
    const db = supabaseAdmin || supabaseClient;
    
    // Llamada a la función RPC de Supabase (pgvector)
    const { data, error } = await db.rpc('match_documents', {
      query_embedding: questionEmbedding,
      match_count: limit,
      match_threshold: 0.2,
    });

    if (error) throw error;
    return (data || []).map((c: any) => ({
      id: c.id,
      document_id: c.document_id,
      text: c.text,
      similarity: c.similarity || 0.5
    }));
  } catch (error) {
    console.error('[Vector Search Error]:', error);
    return [];
  }
}

/**
 * BÚSQUEDA POR PALABRAS CLAVE (KEYWORD)
 */
async function findKeywordChunks(question: string, roleId: string, limit: number = 5): Promise<ChunkWithSimilarity[]> {
  const tokens = tokenizeQuestion(question);
  if (tokens.length === 0) return [];

  const db = supabaseAdmin || supabaseClient;
  
  // Buscar documentos que coincidan con los tokens en el nombre o descripción
  const { data: docs } = await db
    .from('documents')
    .select('id, name')
    .eq('status', 'active');

  if (!docs) return [];

  const relevantDocIds = docs
    .filter(doc => tokens.some(token => doc.name.toLowerCase().includes(token)))
    .map(doc => doc.id);

  if (relevantDocIds.length === 0) return [];

  const { data: chunks } = await db
    .from('document_chunks')
    .select('id, document_id, text')
    .in('document_id', relevantDocIds)
    .limit(limit);

  return (chunks || []).map((c: any) => ({
    id: c.id,
    document_id: c.document_id,
    text: c.text,
    similarity: 0.8 // Alta relevancia por coincidencia de nombre
  }));
}

/**
 * PROCESAMIENTO DE CONSULTA
 */
export async function processUserQuery(
  userId: string,
  userRole: string,
  question: string,
  ipAddress?: string
): Promise<QueryResult> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  const queryId = `query_${Date.now()}`;

  try {
    await supabaseAdmin.from('ai_queries').insert([{ id: queryId, user_id: userId, user_role: userRole, question, status: 'processing' }]);

    console.log(`[Smart RAG] Processing query: "${question}" for role: ${userRole}`);

    // 1. BÚSQUEDA HÍBRIDA (Vectorial + Keywords)
    const [vectorChunks, keywordChunks] = await Promise.all([
      findSimilarChunks(question, 10),
      findKeywordChunks(question, userRole, 5)
    ]);

    // 2. COMBINAR Y FILTRAR
    const allChunks = [...vectorChunks, ...keywordChunks];
    const uniqueChunks = Array.from(new Map(allChunks.map(c => [c.id, c])).values())
      .slice(0, 15); // Máximo 15 fragmentos (~5k tokens)

    // 3. OBTENER NOMBRES DE DOCUMENTOS PARA CONTEXTO
    const docIds = [...new Set(uniqueChunks.map(c => c.document_id))];
    const { data: docInfo } = await supabaseAdmin.from('documents').select('id, name').in('id', docIds);
    const docMap = new Map((docInfo || []).map(d => [d.id, d.name]));

    const contextText = uniqueChunks.map(c => {
      const docName = docMap.get(c.document_id) || 'Documento';
      return `[DOCUMENTO: ${docName}]\n${c.text}`;
    }).join('\n\n---\n\n');

    // 4. GENERAR RESPUESTA
    let answer = '';
    let tokensUsed = { input: 0, output: 0 };

    if (uniqueChunks.length > 0) {
      const systemPrompt = `Eres el Asistente Inteligente de la Escuela Bilingüe Maquilishuat (EBM). 
Tu misión es dar respuestas ÁGILES, RACIONALES y AMIGABLES basadas exclusivamente en los fragmentos de documentos proporcionados.

REGLAS DE ORO:
1. CONCISIÓN: No te extiendas innecesariamente. Ve al punto.
2. RACIONALIDAD: Si te preguntan por un protocolo (ej. drogas, conducta), explica los pasos de forma lógica.
3. TONO: Profesional pero cercano.
4. CALENDARIO: Si hay fechas en los fragmentos, dales prioridad.
5. NO REPETIR: No listes todos los documentos al final. Solo responde la pregunta.
6. SI NO SABES: Si los fragmentos no contienen la respuesta, di que no se encuentra en la normativa actual.`;

      const result = await generateResponse(question, [contextText], systemPrompt);
      answer = result.answer;
      tokensUsed = result.tokensUsed;
    } else {
      answer = "Lo siento, no he encontrado información específica en la normativa que responda a tu pregunta. ¿Te gustaría que lo consulte con el área administrativa?";
    }

    // 5. FINALIZAR
    await supabaseAdmin.from('ai_queries').update({
      answer,
      source_documents: Array.from(docMap.values()),
      model_used: 'gemini-1.5-flash-smart-rag',
      tokens_used: tokensUsed,
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', queryId);

    return { queryId, question, answer, sourceDocuments: [], tokensUsed };

  } catch (error: any) {
    console.error('[processUserQuery Error]:', error);
    let errorMsg = "Lo siento, tengo dificultades técnicas. Por favor, intenta de nuevo en un momento.";
    if (error.message?.includes('LIMITE_EXCEDIDO')) errorMsg = "He alcanzado mi límite de procesamiento. Por favor, espera 30 segundos.";
    if (error.message?.includes('CONTENIDO_BLOQUEADO')) errorMsg = "No puedo responder a esa pregunta por motivos de seguridad. Por favor, reformúlala.";

    if (supabaseAdmin) await supabaseAdmin.from('ai_queries').update({ status: 'error', error_message: error.message }).eq('id', queryId);
    return { queryId, question, answer: errorMsg, sourceDocuments: [], tokensUsed: { input: 0, output: 0 } };
  }
}

// (Otras funciones como rateQueryResponse se mantienen igual)
export async function rateQueryResponse(queryId: string, rating: number, feedback?: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  await supabaseAdmin.from('ai_queries').update({ helpful_rating: rating, feedback, updated_at: new Date().toISOString() }).eq('id', queryId);
}

export async function getUserQueryHistory(userId: string, limit: number = 20): Promise<AIQuery[]> {
  const db = supabaseAdmin || supabaseClient;
  const { data } = await db.from('ai_queries').select('*').eq('user_id', userId).order('requested_at', { ascending: false }).limit(limit);
  return (data || []) as AIQuery[];
}

export async function getQueryStatistics(startDate?: string, endDate?: string) {
  const db = supabaseAdmin || supabaseClient;
  let q = db.from('ai_queries').select('*');
  if (startDate) q = q.gte('requested_at', startDate);
  if (endDate) q = q.lte('requested_at', endDate);
  const { data } = await q;
  // Simplificado para ahorrar espacio
  return { total: data?.length || 0 };
}
