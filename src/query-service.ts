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
 * CAPA 2: Búsqueda Híbrida Multinivel (Escenarios + Vectores + FTS)
 */
async function hybridSearch(question: string, roleId: string, limit: number = 20): Promise<ChunkWithSimilarity[]> {
  const db = supabaseAdmin || supabaseClient;
  const cleanQuestion = question.replace(/[^\w\s]/gi, ' ').trim();
  if (!cleanQuestion) return [];

  const targetDocIds = await identifyTargetDocuments(question);
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(question);
  } catch (e) {
    console.warn('[HybridSearch] Embedding API offline');
  }

  // 1. Búsqueda en Capa de Escenarios Q&A (Prioridad Máxima)
  let qaResults: any[] = [];
  if (embedding && embedding.length === 1536) {
    const { data: qData } = await db.rpc('match_qa_scenarios', {
      query_embedding: embedding,
      match_role_id: roleId,
      match_count: 5,
      match_threshold: 0.7 // Buscamos alta coincidencia
    });
    if (qData) qaResults = qData;
  }

  // 2. Búsqueda por Texto (FTS)
  let ftsQuery = db.from('document_chunks')
    .select('id, document_id, parent_id, text')
    .textSearch('fts_vector', cleanQuestion, { config: 'spanish', type: 'websearch' })
    .limit(limit);

  if (targetDocIds.length > 0) {
    ftsQuery = ftsQuery.or(`document_id.in.(${targetDocIds.join(',')})`);
  }
  const { data: ftsResults } = await ftsQuery;

  // 3. Búsqueda Vectorial de Chunks (Conceptual)
  let vectorResults: any[] = [];
  if (embedding && embedding.length === 1536) {
    const { data: vData } = await db.rpc('match_documents', {
      query_embedding: embedding,
      match_count: limit,
      match_threshold: 0.1
    });
    if (vData) vectorResults = vData;
  }

  // 4. Combinación (RRF mejorado con Capa Q&A)
  const allCandidates = new Map<string, any>();
  
  // Procesar Q&A (Boost x5)
  qaResults.forEach((c: any, i: number) => {
    allCandidates.set(`qa_${c.id}`, { 
      text: `PREGUNTA FRECUENTE: ${c.question}\nRESPUESTA SUGERIDA: ${c.answer}`, 
      document_id: c.document_id,
      score: (1.0 / (i + 1)) + 5.0 
    });
  });

  // Procesar FTS (Boost x2)
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
      id: c.id || 'qa',
      document_id: c.document_id,
      parent_id: c.parent_id,
      text: c.text,
      similarity: c.score
    }));
}

/**
 * PROCESAMIENTO PRINCIPAL (Optimizado para Cuota de Tokens y Diálogo)
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

    // A. Obtener historial reciente para contexto (Memoria de Conversación)
    const { data: history } = await supabaseAdmin
      .from('ai_queries')
      .select('question, answer')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('requested_at', { ascending: false })
      .limit(2);

    const chatHistory = (history || [])
      .reverse()
      .map(h => `Usuario: ${h.question}\nAsistente: ${h.answer}`)
      .join('\n\n');

    // B. Búsqueda Multinivel (Escenarios + Chunks)
    // Si la pregunta es corta (ej: "4to grado"), incluimos la pregunta anterior en la búsqueda para mantener contexto
    const searchContext = (question.length < 20 && history?.[0]) 
      ? `${history[0].question} ${question}` 
      : question;

    const candidates = await hybridSearch(searchContext, userRole, 10);

    if (candidates.length === 0) {
      const fallback = "La normativa actual define los lineamientos generales sobre este tema; sin embargo, para detalles específicos de implementación o casos excepcionales, le recomendamos validar directamente con la Coordinación de Nivel o la Administración, quienes podrán brindarle una guía personalizada.";
      await supabaseAdmin.from('ai_queries').update({ answer: fallback, status: 'completed' }).eq('id', queryId);
      return { queryId, question, answer: fallback, sourceDocuments: [], tokensUsed: { input: 0, output: 0 } };
    }

    // C. Preparar contexto (Priorizando Q&A y fragmentos relevantes)
    const contextChunks = candidates.map(c => ({ text: c.text, document_id: c.document_id, parent_id: c.parent_id }));
    const docIds = [...new Set(contextChunks.map(c => c.document_id))];
    const { data: docInfo } = await supabaseAdmin.from('documents').select('id, name').in('id', docIds);
    const docMap = new Map((docInfo || []).map(d => [d.id, d.name]));

    const finalContext = contextChunks.map(c => `[DOC: ${docMap.get(c.document_id) || 'Info'}]\n${c.text}`).join('\n\n---\n\n');

    // D. Respuesta (Optimizado con Inteligencia Dialógica)
    const systemPrompt = `Eres el Asistente Institucional de la Escuela Bilingüe Maquilishuat (EBM). 
Tu misión es actuar como un Consultor Normativo profesional.

PROTOCOLO DE ENTREVISTA (SÚPER IMPORTANTE):
1. ANÁLISIS DE VARIABLES: Antes de dar una respuesta final, analiza si la normativa recuperada tiene reglas que varían según el GRADO, NIVEL (Primaria/Secundaria) o EDAD.
2. LA PREGUNTA LÓGICA: Si la normativa depende del grado y el usuario NO lo ha mencionado en su pregunta ni en el historial, NO des la respuesta completa. En su lugar, saluda amablemente y pide el dato faltante (Ej: "¿Podría indicarme de qué grado es el estudiante? Nuestra normativa varía según el nivel académico").
3. MEMORIA: Revisa el HISTORIAL DE CONVERSACIÓN para ver si el usuario ya te dio ese dato antes.
4. TONO: Institucional, amable y empático. NUNCA uses lenguaje técnico como "fragmento", "contexto proporcionado" o "sección".
5. CIERRE: Si tienes la información completa, responde con seguridad citando el documento de forma natural.

HISTORIAL RECIENTE:
${chatHistory}`;
    
    const result = await generateResponse(question, [finalContext], systemPrompt);

    // D. Guardar
    const docNames = Array.from(docMap.values());
    await supabaseAdmin.from('ai_queries').update({
      answer: result.answer,
      source_documents: docNames,
      model_used: 'gemini-1.5-flash-stable',
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
