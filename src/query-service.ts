import { supabaseClient, supabaseAdmin } from './supabase';
import { generateEmbedding, generateResponse } from './gemini';
import { logDocumentAccess, getAllAllowedDocumentsText } from './document-service';
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
 * CAPA 1: Enrutamiento de Intenciones (Intent Routing)
 */
async function routeIntent(question: string): Promise<'CONVERSATIONAL' | 'KNOWLEDGE_QUERY'> {
  const systemPrompt = `Clasifica la intención de la siguiente pregunta de un usuario de una escuela. 
Responde ÚNICAMENTE con una de estas dos palabras:
- CONVERSATIONAL: Si es un saludo, despedida, agradecimiento o charla trivial.
- KNOWLEDGE_QUERY: Si es una pregunta sobre reglamentos, políticas, fechas, calendarios o procedimientos de la escuela.

Pregunta: "${question}"`;

  try {
    const result = await generateResponse(question, [], systemPrompt);
    const answer = result.answer.toUpperCase();
    if (answer.includes('KNOWLEDGE_QUERY')) return 'KNOWLEDGE_QUERY';
    return 'CONVERSATIONAL';
  } catch (error) {
    console.error('[Intent Routing Error]:', error);
    return 'KNOWLEDGE_QUERY'; // Fallback seguro
  }
}

/**
 * CAPA 2: Búsqueda Híbrida (Vectorial + Full-Text Search)
 */
async function hybridSearch(question: string, limit: number = 20): Promise<ChunkWithSimilarity[]> {
  try {
    const questionEmbedding = await generateEmbedding(question);
    const db = supabaseAdmin || supabaseClient;
    
    // Llamada a la nueva función RPC de búsqueda híbrida
    const { data, error } = await db.rpc('match_documents_hybrid', {
      query_embedding: questionEmbedding,
      query_text: question,
      match_count: limit,
      match_threshold: 0.2,
      full_text_weight: 0.4,
      vector_weight: 0.6
    });

    if (error) {
      console.warn('[Hybrid Search RPC Error]:', error.message);
      // Fallback a búsqueda vectorial simple si la RPC no existe
      return await findSimilarChunks(question, limit);
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      document_id: c.document_id,
      parent_id: c.parent_id,
      text: c.text,
      similarity: c.combined_score || 0
    }));
  } catch (error) {
    console.error('[Hybrid Search Error]:', error);
    return [];
  }
}

/**
 * CAPA 4: Re-ranking (Filtro de Relevancia Semántica)
 */
async function rerankChunks(question: string, chunks: any[]): Promise<any[]> {
  if (chunks.length <= 5) return chunks;

  const contextForRerank = chunks.map((c, i) => `[ID:${i}] ${c.text.substring(0, 300)}...`).join('\n\n');
  const systemPrompt = `Eres un experto en recuperación de información. Tu tarea es identificar los fragmentos más relevantes para responder a la pregunta del usuario.
Pregunta: "${question}"

Fragmentos candidatos:
${contextForRerank}

Responde ÚNICAMENTE con los IDs de los 5 fragmentos más útiles, separados por comas, en orden de relevancia (ej: 4,12,2,0,8). No expliques nada.`;

  try {
    const result = await generateResponse(question, [], systemPrompt);
    const ids = result.answer.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    
    const topChunks = ids
      .map(id => chunks[id])
      .filter(c => !!c)
      .slice(0, 5);

    return topChunks.length > 0 ? topChunks : chunks.slice(0, 5);
  } catch (error) {
    console.error('[Re-ranking Error]:', error);
    return chunks.slice(0, 5); // Fallback
  }
}

/**
 * PROCESAMIENTO DE CONSULTA (Advanced RAG Pipeline)
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

    // 1. CAPA 1: INTENT ROUTING
    const intent = await routeIntent(question);
    if (intent === 'CONVERSATIONAL') {
      const result = await generateResponse(question, [], "Eres el Asistente de EBM. Responde amablemente a este saludo o charla trivial.");
      await supabaseAdmin.from('ai_queries').update({
        answer: result.answer,
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', queryId);
      return { queryId, question, answer: result.answer, sourceDocuments: [], tokensUsed: result.tokensUsed };
    }

    // 2. CAPA 2: HYBRID SEARCH
    console.log(`[Advanced RAG] Searching knowledge base for: "${question}"`);
    const candidates = await hybridSearch(question, 20);

    if (candidates.length === 0) {
      const fallbackMsg = "Lo siento, no he encontrado información específica en la normativa. ¿Deseas consultar con administración?";
      await supabaseAdmin.from('ai_queries').update({ answer: fallbackMsg, status: 'completed' }).eq('id', queryId);
      return { queryId, question, answer: fallbackMsg, sourceDocuments: [], tokensUsed: { input: 0, output: 0 } };
    }

    // 3. CAPA 3: RE-RANKING
    const topCandidates = await rerankChunks(question, candidates);

    // 4. CAPA 4: PARENT-CHILD CONTEXT RETRIEVAL
    const parentIds = [...new Set(topCandidates.map(c => c.parent_id).filter(id => !!id))];
    let contextChunks: { text: string; document_id: string }[] = [];

    if (parentIds.length > 0) {
      // Recuperar los bloques PADRE para mayor contexto
      const { data: parents } = await supabaseAdmin
        .from('document_parents')
        .select('id, document_id, text')
        .in('id', parentIds);
      
      if (parents && parents.length > 0) {
        contextChunks = parents.map((p: any) => ({
          text: p.text,
          document_id: p.document_id
        }));
      }
    } else {
      // Fallback a los textos de los chunks hijos si no hay padres
      contextChunks = topCandidates.map((c: any) => ({
        text: c.text,
        document_id: c.document_id
      }));
    }

    // 5. OBTENER NOMBRES DE DOCUMENTOS
    const docIds = [...new Set(contextChunks.map(c => c.document_id))];
    const { data: docInfo } = await supabaseAdmin.from('documents').select('id, name').in('id', docIds);
    const docMap = new Map((docInfo || []).map(d => [d.id, d.name]));

    const contextText = contextChunks.map(c => {
      const docName = docMap.get(c.document_id) || 'Documento';
      return `[DOCUMENTO: ${docName}]\n${c.text}`;
    }).join('\n\n---\n\n');

    // 6. GENERAR RESPUESTA FINAL
    const systemPrompt = `Eres el Asistente Inteligente de la Escuela Bilingüe Maquilishuat (EBM). 
Tu misión es dar respuestas COMPLETAS, ÁGILES y PRECISAS basadas en los documentos.

REGLAS:
1. Usa exclusivamente el contexto proporcionado.
2. Si la respuesta está en el CALENDARIO, sé muy detallado con fechas.
3. Si no sabes la respuesta, admítelo.
4. Tono amable y profesional.`;

    const result = await generateResponse(question, [contextText], systemPrompt);

    // 7. FINALIZAR
    const documentNames = Array.from(docMap.values());
    await supabaseAdmin.from('ai_queries').update({
      answer: result.answer,
      source_documents: documentNames,
      model_used: 'gemini-3.5-flash-advanced-rag',
      tokens_used: result.tokensUsed,
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', queryId);

    // Auditoría
    for (const docId of docIds) {
      await logDocumentAccess(docId, userId, 'query', `Query: ${question}`, ipAddress);
    }

    return { queryId, question, answer: result.answer, sourceDocuments: documentNames, tokensUsed: result.tokensUsed };

  } catch (error: any) {
    console.error('[processUserQuery Error]:', error);
    const errorMsg = "Tengo dificultades técnicas. Intenta de nuevo pronto.";
    if (supabaseAdmin) {
      await supabaseAdmin.from('ai_queries').update({ status: 'error', error_message: error.message }).eq('id', queryId);
    }
    return { queryId, question, answer: errorMsg, sourceDocuments: [], tokensUsed: { input: 0, output: 0 } };
  }
}


/**
 * Calificar la utilidad de una respuesta
 */
export async function rateQueryResponse(
  queryId: string,
  rating: number,
  feedback?: string
): Promise<void> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  await supabaseAdmin.from('ai_queries').update({ 
    helpful_rating: rating, 
    feedback, 
    updated_at: new Date().toISOString() 
  }).eq('id', queryId);
}

/**
 * Obtener historial de consultas del usuario
 */
export async function getUserQueryHistory(
  userId: string,
  limit: number = 20
): Promise<AIQuery[]> {
  const db = supabaseAdmin || supabaseClient;
  const { data } = await db
    .from('ai_queries')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(limit);
  return (data || []) as AIQuery[];
}

/**
 * Reiniciar estadísticas (actualizando la fecha de corte)
 */
export async function resetSystemStats(type: 'all' | 'unanswered'): Promise<void> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  
  const { data: config } = await supabaseAdmin
    .from('system_settings')
    .select('value')
    .eq('key', 'stats_config')
    .single();
  
  const newValue = { ...(config?.value || {}) };
  const now = new Date().toISOString();
  
  if (type === 'all') newValue.last_reset_at = now;
  if (type === 'unanswered') newValue.unanswered_reset_at = now;
  
  await supabaseAdmin
    .from('system_settings')
    .upsert({ key: 'stats_config', value: newValue, updated_at: now });
}

/**
 * Marcar una sugerencia/pregunta como procesada
 */
export async function markQueryAsProcessed(queryId: string, userId: string): Promise<void> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  await supabaseAdmin
    .from('ai_queries')
    .update({ 
      is_processed: true, 
      processed_at: new Date().toISOString(),
      processed_by: userId 
    })
    .eq('id', queryId);
}

/**
 * Obtener estadísticas de consultas mejoradas
 */
export async function getQueryStatistics(startDate?: string, endDate?: string) {
  try {
    const db = supabaseAdmin || supabaseClient;
    
    // Obtener configuración de reinicio
    const { data: config } = await db
      .from('system_settings')
      .select('value')
      .eq('key', 'stats_config')
      .single();
    
    const lastReset = config?.value?.last_reset_at || '2020-01-01T00:00:00Z';
    const unansweredReset = config?.value?.unanswered_reset_at || '2020-01-01T00:00:00Z';

    let query = db.from('ai_queries').select('*').gte('requested_at', lastReset);

    if (startDate) query = query.gte('requested_at', startDate);
    if (endDate) query = query.lte('requested_at', endDate);

    const { data, error } = await query;
    if (error) throw error;

    // Calcular más consultados (desde la vista o logs)
    const { data: mostConsulted } = await db
      .from('document_consultation_stats')
      .select('*')
      .order('consultation_count', { ascending: false })
      .limit(5);

    const stats = {
      total: data?.length || 0,
      errors: data?.filter((q: any) => q.status === 'error').length || 0,
      average_rating: data?.filter((q: any) => q.helpful_rating).reduce((acc: number, q: any) => acc + q.helpful_rating, 0) / (data?.filter((q: any) => q.helpful_rating).length || 1) || 0,
      by_role: {} as Record<string, number>,
      unanswered: data?.filter((q: any) => q.error_message === 'NO_DOCUMENT_MATCH' && q.requested_at >= unansweredReset && !q.is_processed).length || 0,
      processed_count: data?.filter((q: any) => q.is_processed).length || 0,
      most_consulted: (mostConsulted || []).map(d => ({
        id: d.id,
        name: d.name,
        count: d.consultation_count
      }))
    };

    data?.forEach((q: any) => {
      stats.by_role[q.user_role] = (stats.by_role[q.user_role] || 0) + 1;
    });

    return stats;
  } catch (error) {
    console.error('Error fetching query statistics:', error);
    throw error;
  }
}


/**
 * Analizar interacciones para proporcionar insights
 */
export async function getStakeholderInsights(): Promise<any> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  try {
    const { data: queries } = await supabaseAdmin
      .from('ai_queries')
      .select('user_role, question, requested_at')
      .order('requested_at', { ascending: false })
      .limit(50);

    if (!queries || queries.length === 0) return { message: 'No hay datos suficientes.' };

    const analysisPrompt = `Analiza estas preocupaciones de la comunidad escolar:\n${queries.map(q => `- [${q.user_role}]: ${q.question}`).join('\n')}\n\nProporciona un resumen ejecutivo de temas principales y sugerencias.`;
    const result = await generateResponse(analysisPrompt, [], 'Eres un experto en gestión escolar.');
    return { strategicAnalysis: result.answer };
  } catch (error) {
    console.error('Error in stakeholder insights:', error);
    throw error;
  }
}

/**
 * Generar recomendaciones basadas en consultas sin respuesta
 */
export async function getIARecommendations(): Promise<any> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  try {
    const { data: unanswered } = await supabaseAdmin
      .from('ai_queries')
      .select('question')
      .eq('error_message', 'NO_DOCUMENT_MATCH')
      .limit(30);

    if (!unanswered || unanswered.length === 0) return { recommendations: 'No hay suficientes datos.' };

    const prompt = `Analiza estas preguntas sin respuesta:\n${unanswered.map(q => `- ${q.question}`).join('\n')}\n\nSugiere 3 temas prioritarios para nuevas políticas.`;
    const result = await generateResponse(prompt, [], 'Eres un experto en normativa escolar.');
    return { recommendations: result.answer };
  } catch (error) {
    console.error('Error in IA recommendations:', error);
    throw error;
  }
}
