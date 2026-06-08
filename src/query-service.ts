import { supabaseClient, supabaseAdmin } from './supabase';
import { generateEmbedding, generateResponse } from './gemini';
import { logDocumentAccess } from './document-service';
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
  parent_id?: string;
  text: string;
  similarity: number;
}

/**
 * CAPA 1: Identificación de documentos por nombre (Estilo PDFgear)
 */
async function identifyTargetDocuments(question: string): Promise<string[]> {
  const db = supabaseAdmin || supabaseClient;
  const tokens = question.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  if (tokens.length === 0) return [];

  const { data: docs } = await db.from('documents').select('id, name').eq('status', 'active');
  if (!docs) return [];

  return docs
    .filter(doc => {
      const docName = doc.name.toLowerCase();
      return tokens.some(t => docName.includes(t));
    })
    .map(doc => doc.id);
}

/**
 * CAPA 2: Búsqueda Híbrida Simplificada
 */
async function hybridSearch(question: string, limit: number = 20): Promise<ChunkWithSimilarity[]> {
  const db = supabaseAdmin || supabaseClient;
  const cleanQuestion = question.replace(/[^\w\s]/gi, ' ').trim();
  if (!cleanQuestion) return [];

  const targetDocIds = await identifyTargetDocuments(question);

  // 1. Búsqueda por Texto (FTS)
  let ftsQuery = db.from('document_chunks')
    .select('id, document_id, parent_id, text')
    .textSearch('fts_vector', cleanQuestion, { config: 'spanish', type: 'websearch' })
    .limit(limit);

  if (targetDocIds.length > 0) {
    ftsQuery = ftsQuery.or(`document_id.in.(${targetDocIds.join(',')})`);
  }

  const { data: ftsResults } = await ftsQuery;

  // 2. Búsqueda Vectorial (Conceptual)
  let vectorResults: any[] = [];
  try {
    const embedding = await generateEmbedding(question);
    if (embedding && embedding.length === 1536) {
      const { data: vData, error: vError } = await db.rpc('match_documents', {
        query_embedding: embedding,
        match_count: limit,
        match_threshold: 0.05
      });
      if (!vError && vData) vectorResults = vData;
    }
  } catch (e) {
    console.warn('[HybridSearch] IA conceptually offline or quota exceeded');
  }

  // 3. Combinación (RRF - Reciprocal Rank Fusion)
  const allCandidates = new Map<string, any>();
  
  // Procesar FTS (Alta prioridad)
  (ftsResults || []).forEach((c: any, i: number) => {
    allCandidates.set(c.id, { ...c, score: (1.0 / (i + 1)) + 2.0 });
  });

  // Procesar Vectores
  vectorResults.forEach((c: any, i: number) => {
    const existing = allCandidates.get(c.id);
    const vScore = (1.0 / (i + 1));
    if (existing) {
      existing.score += vScore;
    } else {
      allCandidates.set(c.id, { ...c, score: vScore });
    }
  });

  return Array.from(allCandidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(c => ({
      id: c.id,
      document_id: c.document_id,
      parent_id: c.parent_id,
      text: c.text,
      similarity: c.score
    }));
}

/**
 * PROCESAMIENTO PRINCIPAL (Optimizado para Cuota de Tokens)
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

    // A. Búsqueda (1 llamada a Embedding si hay cuota)
    const candidates = await hybridSearch(question, 10);

    if (candidates.length === 0) {
      const fallback = "Lo siento, no he encontrado información en la normativa escolar actual.";
      await supabaseAdmin.from('ai_queries').update({ answer: fallback, status: 'completed' }).eq('id', queryId);
      return { queryId, question, answer: fallback, sourceDocuments: [], tokensUsed: { input: 0, output: 0 } };
    }

    // B. Contexto (Recuperar bloques grandes)
    const parentIds = [...new Set(candidates.map(c => c.parent_id).filter(id => !!id))];
    let contextChunks: { text: string; document_id: string }[] = [];

    if (parentIds.length > 0) {
      const { data: parents } = await supabaseAdmin.from('document_parents').select('document_id, text').in('id', parentIds);
      if (parents) contextChunks = parents;
    } else {
      contextChunks = candidates.map(c => ({ text: c.text, document_id: c.document_id }));
    }

    const docIds = [...new Set(contextChunks.map(c => c.document_id))];
    const { data: docInfo } = await supabaseAdmin.from('documents').select('id, name').in('id', docIds);
    const docMap = new Map((docInfo || []).map(d => [d.id, d.name]));

    const contextText = contextChunks.map(c => `[DOC: ${docMap.get(c.document_id) || 'Info'}]\n${c.text}`).join('\n\n---\n\n');

    // C. Respuesta (1 llamada a Gemini Chat)
    const systemPrompt = "Eres el Asistente de la Escuela Maquilishuat. Responde de forma clara usando los documentos. Si no sabes, dilo amablemente.";
    const result = await generateResponse(question, [contextText], systemPrompt);

    // D. Guardar
    const docNames = Array.from(docMap.values());
    await supabaseAdmin.from('ai_queries').update({
      answer: result.answer,
      source_documents: docNames,
      model_used: 'gemini-3.5-flash-stable',
      tokens_used: result.tokensUsed,
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', queryId);

    // Auditoría
    for (const docId of docIds) {
      await logDocumentAccess(docId, userId, 'query', `Q: ${question}`, ipAddress);
    }

    return { queryId, question, answer: result.answer, sourceDocuments: docNames, tokensUsed: result.tokensUsed };

  } catch (error: any) {
    console.error('[QueryError]:', error);
    let msg = "Tengo dificultades técnicas temporales.";
    if (error.message?.includes('LIMITE_EXCEDIDO')) msg = "Límite de IA alcanzado. Reintenta en 30 segundos.";
    
    if (supabaseAdmin) {
      await supabaseAdmin.from('ai_queries').update({ status: 'error', error_message: error.message }).eq('id', queryId);
    }
    return { queryId, question, answer: msg, sourceDocuments: [], tokensUsed: { input: 0, output: 0 } };
  }
}

/**
 * REINICIO TOTAL: Borra todas las consultas y logs de auditoría
 * Solo para ser usado por directores antes de una nueva etapa.
 */
export async function clearAllSystemData(): Promise<void> {
  if (!supabaseAdmin) throw new Error('Admin client not configured');
  
  // 1. Borrar historial de consultas IA
  const { error: queryError } = await supabaseAdmin
    .from('ai_queries')
    .delete()
    .neq('id', 'placeholder'); // Truco para borrar todo sin WHERE id IS NOT NULL
  
  if (queryError) throw queryError;

  // 2. Borrar logs de auditoría de documentos
  const { error: auditError } = await supabaseAdmin
    .from('document_audit_logs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  
  if (auditError) throw auditError;

  // 3. Reiniciar fechas de corte de estadísticas
  await resetSystemStats('all');
  await resetSystemStats('unanswered');
}

/** Funciones de Soporte */
export async function rateQueryResponse(id: string, rating: number, feedback?: string): Promise<void> {
  if (supabaseAdmin) await supabaseAdmin.from('ai_queries').update({ 
    helpful_rating: rating,
    feedback,
    updated_at: new Date().toISOString() 
  }).eq('id', id);
}

export async function getUserQueryHistory(userId: string, limit: number = 10): Promise<AIQuery[]> {
  const { data } = await (supabaseAdmin || supabaseClient)
    .from('ai_queries')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false })
    .limit(limit);
  return (data || []) as AIQuery[];
}

export async function resetSystemStats(type: 'all' | 'unanswered'): Promise<void> {
  if (!supabaseAdmin) return;
  const now = new Date().toISOString();
  const { data: config } = await supabaseAdmin.from('system_settings').select('value').eq('key', 'stats_config').single();
  const newValue = { ...(config?.value || {}) };
  if (type === 'all') newValue.last_reset_at = now;
  else newValue.unanswered_reset_at = now;
  await supabaseAdmin.from('system_settings').upsert({ key: 'stats_config', value: newValue, updated_at: now });
}

export async function markQueryAsProcessed(id: string, userId: string): Promise<void> {
  if (supabaseAdmin) await supabaseAdmin.from('ai_queries').update({ is_processed: true, processed_at: new Date().toISOString(), processed_by: userId }).eq('id', id);
}

export async function getQueryStatistics(startDate?: string, endDate?: string) {
  const db = supabaseAdmin || supabaseClient;
  const { data: config } = await db.from('system_settings').select('value').eq('key', 'stats_config').single();
  const lastReset = config?.value?.last_reset_at || '2020-01-01';
  
  let query = db.from('ai_queries').select('*').gte('requested_at', lastReset);
  if (startDate) query = query.gte('requested_at', startDate);
  if (endDate) query = query.lte('requested_at', endDate);

  const { data } = await query;
  const { data: mostConsulted } = await db.from('document_consultation_stats').select('*').order('consultation_count', { ascending: false }).limit(5);

  return {
    total: data?.length || 0,
    errors: data?.filter((q: any) => q.status === 'error').length || 0,
    average_rating: data?.filter((q: any) => q.helpful_rating).reduce((acc: number, q: any) => acc + q.helpful_rating, 0) / (data?.filter((q: any) => q.helpful_rating).length || 1) || 0,
    unanswered: data?.filter((q: any) => q.error_message === 'NO_DOCUMENT_MATCH' && !q.is_processed).length || 0,
    processed_count: data?.filter((q: any) => q.is_processed).length || 0,
    most_consulted: (mostConsulted || []).map(d => ({ id: d.id, name: d.name, count: d.consultation_count }))
  };
}

export async function getStakeholderInsights(): Promise<any> {
  if (!supabaseAdmin) return { message: 'No configurado' };
  const { data: queries } = await supabaseAdmin.from('ai_queries').select('user_role, question').limit(20);
  if (!queries || queries.length < 5) return { strategicAnalysis: 'Datos insuficientes para análisis.' };
  const prompt = `Analiza estas preguntas: ${queries.map(q => q.question).join(', ')}`;
  const res = await generateResponse(prompt, [], "Analista escolar.");
  return { strategicAnalysis: res.answer };
}

export async function getIARecommendations(): Promise<any> {
  if (!supabaseAdmin) return { recommendations: 'No hay suficientes datos.' };
  const { data } = await supabaseAdmin.from('ai_queries').select('question').eq('error_message', 'NO_DOCUMENT_MATCH').limit(10);
  if (!data || data.length < 3) return { recommendations: 'Continúa alimentando el repositorio.' };
  const res = await generateResponse(`Sugiere temas para: ${data.map(q => q.question).join(', ')}`, [], "Experto en políticas.");
  return { recommendations: res.answer };
}
