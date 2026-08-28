import { supabaseClient, supabaseAdmin } from './supabase';
import { generateEmbedding, generateResponse, geminiConfig } from './gemini';
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

const RAG_RESULT_LIMIT = Number.parseInt(process.env.RAG_RESULT_LIMIT || '12', 10);
const RAG_MAX_CONTEXT_CHARS = Number.parseInt(process.env.RAG_MAX_CONTEXT_CHARS || '24000', 10);
const RAG_EXPLICIT_DOCUMENT_MAX_CHARS = Number.parseInt(process.env.RAG_EXPLICIT_DOCUMENT_MAX_CHARS || '120000', 10);
const POLICY_RESPONSE_VERSION = '2';
const GEMINI_ENABLE_CLASSIFIER = process.env.GEMINI_ENABLE_CLASSIFIER === 'true';

function normalizeQuestion(question: string): string {
  return question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Contexto recortado para evitar limites de cuota.]`;
}

/**
 * CAPA 1: Identificación de documentos por nombre (Estilo PDFgear)
 */
async function identifyTargetDocuments(question: string): Promise<string[]> {
  const db = supabaseAdmin || supabaseClient;
  const normalizedQuestion = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const documentTerms = ['manual', 'reglamento', 'politica', 'protocolo', 'procedimiento', 'codigo', 'handbook'];
  const requestedTerms = documentTerms.filter(term => normalizedQuestion.includes(term));
  if (requestedTerms.length === 0) return [];

  const { data: docs } = await db.from('documents').select('id, name').eq('status', 'active');
  if (!docs) return [];

  return docs
    .filter(doc => {
      const docName = doc.name.toLowerCase();
      return requestedTerms.some(term => docName.includes(term));
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

  // La mención explícita de un documento debe funcionar aunque FTS o el índice
  // vectorial no encuentren una coincidencia exacta dentro de sus chunks.
  const { data: requestedChunks } = targetDocIds.length > 0
    ? await db
      .from('document_chunks')
      .select('id, document_id, parent_id, text')
      .in('document_id', targetDocIds)
      .limit(limit)
    : { data: [] };

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

  (requestedChunks || []).forEach((c: any, i: number) => {
    if (!allCandidates.has(c.id)) {
      allCandidates.set(c.id, { ...c, score: 4.0 - (i / 100) });
    }
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
    .filter(candidate => targetDocIds.length === 0 || targetDocIds.includes(candidate.document_id))
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
  if (!supabaseAdmin) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured on server; ai queries require service role key for privileged DB operations');
  const queryId = `query_${Date.now()}`;
  const normalizedQuestion = normalizeQuestion(question);

  try {
    // Reutilizar respuestas previamente validadas evita embedding y generación para preguntas repetidas.
    const { data: cachedQuery } = await supabaseAdmin
      .from('ai_queries')
      .select('answer, source_documents, tokens_used, error_message')
      .eq('user_role', userRole)
      .eq('normalized_question', normalizedQuestion)
      .eq('response_version', POLICY_RESPONSE_VERSION)
      .eq('status', 'completed')
      .or('error_message.is.null,error_message.neq.NO_DOCUMENT_MATCH')
      .not('answer', 'is', null)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cachedQuery?.answer) {
      await supabaseAdmin.from('ai_queries').insert([{
        id: queryId,
        user_id: userId,
        user_role: userRole,
        question,
        normalized_question: normalizedQuestion,
        answer: cachedQuery.answer,
        source_documents: cachedQuery.source_documents || [],
        tokens_used: { input: 0, output: 0, cached: true },
        model_used: geminiConfig.model,
        response_version: POLICY_RESPONSE_VERSION,
        status: 'completed',
        completed_at: new Date().toISOString(),
      }]);
      return {
        queryId,
        question,
        answer: cachedQuery.answer,
        sourceDocuments: cachedQuery.source_documents || [],
        tokensUsed: { input: 0, output: 0 },
      };
    }

    await supabaseAdmin.from('ai_queries').insert([{
      id: queryId,
      user_id: userId,
      user_role: userRole,
      question,
      normalized_question: normalizedQuestion,
      response_version: POLICY_RESPONSE_VERSION,
      status: 'processing',
    }]);

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
      const searchContext = (question.length < 40 && history?.[0])
        ? `${history[0].question} ${question}`
        : question;

    const candidates = await hybridSearch(searchContext, userRole, RAG_RESULT_LIMIT);

    if (candidates.length === 0) {
      const fallback = "La normativa actual define los lineamientos generales sobre este tema; sin embargo, para detalles específicos de implementación o casos excepcionales, le recomendamos validar directamente con la Coordinación de Nivel o la Administración, quienes podrán brindarle una guía personalizada.";
      await supabaseAdmin.from('ai_queries').update({
        answer: fallback,
        status: 'completed',
        error_message: 'NO_DOCUMENT_MATCH',
        completed_at: new Date().toISOString()
      }).eq('id', queryId);
      return { queryId, question, answer: fallback, sourceDocuments: [], tokensUsed: { input: 0, output: 0 } };
    }

    // C. Preparar contexto (Priorizando Q&A y fragmentos relevantes)
    const contextChunks = candidates.map(c => ({ text: c.text, document_id: c.document_id, parent_id: c.parent_id }));
    const docIds = [...new Set(contextChunks.map(c => c.document_id))];
    const requestedDocumentIds = await identifyTargetDocuments(searchContext);
    const allDocIds = [...new Set([...docIds, ...requestedDocumentIds])];
    const { data: docInfo } = await supabaseAdmin
      .from('documents')
      .select('id, name, content_original, content_optimized')
      .in('id', allDocIds);
    const docMap = new Map((docInfo || []).map(d => [d.id, d.name]));

    let finalContext = limitText(
      contextChunks.map(c => `[DOC: ${docMap.get(c.document_id) || 'Info'}]\n${c.text}`).join('\n\n---\n\n'),
      RAG_MAX_CONTEXT_CHARS
    );

    // Cuando se nombra un documento, la fuente de verdad es su contenido ingerido,
    // no solamente los chunks que resultaron mejor posicionados en la búsqueda.
    if (requestedDocumentIds.length > 0) {
      const docsWithContent = (docInfo || []).filter(
        d => requestedDocumentIds.includes(d.id) && typeof (d.content_original || d.content_optimized) === 'string' && (d.content_original || d.content_optimized).trim()
      );
      const docsWithoutContent = requestedDocumentIds.filter(
        documentId => !docsWithContent.some(d => d.id === documentId)
      );
      let documentFallbackChunks: Array<{ document_id: string; text: string }> = [];

      if (docsWithoutContent.length > 0) {
        const { data: storedChunks } = await supabaseAdmin
          .from('document_chunks')
          .select('document_id, chunk_number, text')
          .in('document_id', docsWithoutContent)
          .order('document_id', { ascending: true })
          .order('chunk_number', { ascending: true });
        documentFallbackChunks = storedChunks || [];
      }

      const completeDocuments = [
        ...docsWithContent.map(d => `[DOCUMENTO COMPLETO: ${d.name}]\n${d.content_original || d.content_optimized}`),
        ...docsWithoutContent.map(documentId => {
          const chunks = documentFallbackChunks
            .filter(chunk => chunk.document_id === documentId)
            .map(chunk => chunk.text)
            .join('\n\n');
          return `[DOCUMENTO COMPLETO RECONSTRUIDO: ${docMap.get(documentId) || 'Documento'}]\n${chunks}`;
        }),
      ].filter(text => !text.endsWith('\n'));

      if (completeDocuments.length > 0) {
        finalContext = limitText(completeDocuments.join('\n\n---\n\n'), RAG_EXPLICIT_DOCUMENT_MAX_CHARS);
      }
    }

    // D1. Clasificación de variables (Protocolo de Entrevista Dinámica)
    let clarifyText: string | null = null;
    let extractedGrade: string | null = null;

    // Solo aplicamos para roles de comunidad (padre, alumno, profesor)
    if (GEMINI_ENABLE_CLASSIFIER && userRole !== 'admin' && userRole !== 'directivo') {
      try {
        const classificationPrompt = `Eres un Clasificador de Contexto y Variables para un sistema de información escolar.
Analiza los fragmentos de normativas recuperados, la pregunta del usuario y el historial de la conversación.

Fragmentos de normativas:
---
${finalContext}
---

Historial de conversación:
${chatHistory}

Pregunta actual del usuario:
${question}

Tu tarea es responder EXCLUSIVAMENTE con un objeto JSON (sin formato markdown adicional ni explicaciones) con la siguiente estructura:
{
  "dependsOnGradeOrLevel": boolean,
  "hasUserProvidedGradeOrLevel": boolean,
  "extractedGradeOrLevel": string | null,
  "clarifyingQuestion": string | null
}

REGLAS DE CLASIFICACIÓN:
1. "dependsOnGradeOrLevel": true si el contenido de las normativas indica explícitamente reglas distintas para diferentes grados (ej. 1ero, 4to, 7mo) o niveles escolares (Primaria, Secundaria, Bachillerato). De lo contrario, false.
2. "hasUserProvidedGradeOrLevel": true si el usuario ha indicado el grado o nivel académico en su pregunta actual o en el historial. De lo contrario, false.
3. "extractedGradeOrLevel": si el usuario proporcionó el grado/nivel, extrae el texto normalizado (ej. "7mo grado", "Secundaria"). Si no lo proporcionó, null.
4. "clarifyingQuestion": si "dependsOnGradeOrLevel" es true y "hasUserProvidedGradeOrLevel" es false, escribe una pregunta corta, institucional y amable preguntando el grado o nivel escolar del estudiante (ej. "¿Podría indicarme el grado o nivel académico del estudiante para brindarle la información correcta? Nuestra normativa varía según el nivel."). Si no aplica, null.`;

        const classificationResult = await generateResponse(
          "Clasifica esta consulta.",
          [],
          classificationPrompt
        );
        
        const jsonStr = classificationResult.answer.replace(/```json|```/g, '').trim();
        const classification = JSON.parse(jsonStr);

        if (classification.dependsOnGradeOrLevel) {
          if (!classification.hasUserProvidedGradeOrLevel) {
            clarifyText = classification.clarifyingQuestion || "¿Podría indicarme el grado o nivel académico del estudiante?";
          } else {
            extractedGrade = classification.extractedGradeOrLevel;
          }
        }
      } catch (err) {
        console.warn('[InterviewProtocol] Classification step failed, falling back to standard dialog:', err);
      }
    }

    if (clarifyText) {
      const docNames = Array.from(docMap.values());
      await supabaseAdmin.from('ai_queries').update({
        answer: clarifyText,
        source_documents: docNames,
        model_used: geminiConfig.model,
        tokens_used: { input: 0, output: 0 },
        status: 'completed',
        completed_at: new Date().toISOString()
      }).eq('id', queryId);

      for (const docId of docIds) {
        await logDocumentAccess(docId, userId, 'query', `Q: ${question} (Intercepción: Falta grado)`, ipAddress);
      }

      return { queryId, question, answer: clarifyText, sourceDocuments: docNames, tokensUsed: { input: 0, output: 0 } };
    }

    let levelContextInstruction = '';
    if (extractedGrade) {
      levelContextInstruction = `\n\nATENCIÓN: El usuario ha especificado que el grado/nivel escolar aplicable es: "${extractedGrade}". Filtra el contexto y responde basándote estrictamente en las reglas para este nivel/grado.`;
    }

    // D2. Respuesta (Optimizado con Inteligencia Dialógica)
    const greetingInstruction = chatHistory
      ? 'No vuelvas a saludar ni a presentarte; continúa directamente con la respuesta.'
      : 'Puedes saludar brevemente solo en esta primera respuesta, antes de contestar.';
    const systemPrompt = `Eres el Asistente Institucional de la Escuela Bilingüe Maquilishuat (EBM). 
Tu misión es actuar como un Consultor Normativo profesional.

${greetingInstruction}

PROTOCOLO DE ENTREVISTA (SÚPER IMPORTANTE):
1. ANÁLISIS DE VARIABLES: Antes de dar una respuesta final, analiza si la normativa recuperada tiene reglas que varían según el GRADO, NIVEL (Primaria/Secundaria) o EDAD.
2. LA PREGUNTA LÓGICA: Si la normativa depende del grado y el usuario NO lo ha mencionado en su pregunta ni en el historial, NO des la respuesta completa. En su lugar, saluda amablemente y pide el dato faltante (Ej: "¿Podría indicarme de qué grado es el estudiante? Nuestra normativa varía según el nivel académico").
3. MEMORIA: Revisa el HISTORIAL DE CONVERSACIÓN para ver si el usuario ya te dio ese dato antes.
4. TONO: Institucional, amable y empático. NUNCA uses lenguaje técnico como "fragmento", "contexto proporcionado" o "sección".
5. BÚSQUEDA Y FUNDAMENTO (OBLIGATORIO): Consulta todo el documento proporcionado antes de responder. Si la pregunta menciona el manual, reglamento, código de conducta u otro documento, usa prioritariamente el contenido marcado como DOCUMENTO COMPLETO y cita ese documento; no respondas con conocimiento general.
6. CITAS Y REFERENCIAS (OBLIGATORIO): Si tienes la información completa para responder, debes citar de forma explícita y visible el nombre de los documentos de origen de donde obtuviste la información directamente en el texto de tu respuesta (ej: "De acuerdo con el documento [Nombre del Documento]..."). Si la normativa contiene artículos, secciones, capítulos o numerales específicos en el texto, menciónalos detalladamente para facilitar que el usuario pueda consultarlo directamente en el documento escrito original.${levelContextInstruction}
7. HONESTIDAD SOBRE LA FUENTE: No digas que solo tienes fragmentos, que el manual no fue consultado o que el usuario debe buscar el documento completo cuando el contexto incluya DOCUMENTO COMPLETO. Si la disposición no aparece en el documento, dilo claramente y no inventes sanciones ni artículos.

HISTORIAL RECIENTE:
${chatHistory}`;
    
    const result = await generateResponse(question, [finalContext], systemPrompt);

    // D. Guardar
    const docNames = Array.from(docMap.values());
    await supabaseAdmin.from('ai_queries').update({
      answer: result.answer,
      source_documents: docNames,
      model_used: geminiConfig.model,
      response_version: POLICY_RESPONSE_VERSION,
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
    const errMsg = String(error?.message || '').toLowerCase();
    if (errMsg.includes('limite_excedido') || errMsg.includes('limite') || errMsg.includes('rate limit')) {
      msg = "Límite de IA alcanzado. Reintenta en 30 segundos.";
    } else if (errMsg.includes('not found') || errMsg.includes('no longer available') || errMsg.includes('not found for api') || errMsg.includes('not supported')) {
      msg = "Proveedor de IA: modelo no disponible o API incompatible. Verifica GEMINI_CHAT_MODEL y GEMINI_API_URL en la configuración del servidor.";
    }
    
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
  {
    const { data: queries } = await supabaseAdmin
      .from('ai_queries')
      .select('user_role, question, helpful_rating, requested_at')
      .order('requested_at', { ascending: false })
      .limit(100);

    const roleGroups = new Map<string, { role: string; count: number; ratingSum: number; ratingCount: number }>();
    for (const query of queries || []) {
      const role = query.user_role || 'sin_rol';
      const current = roleGroups.get(role) || { role, count: 0, ratingSum: 0, ratingCount: 0 };
      current.count += 1;
      if (query.helpful_rating) {
        current.ratingSum += query.helpful_rating;
        current.ratingCount += 1;
      }
      roleGroups.set(role, current);
    }

    const roleStats = Array.from(roleGroups.values()).map((group) => ({
      role: group.role,
      count: group.count,
      avgRating: group.ratingCount > 0 ? group.ratingSum / group.ratingCount : 0,
    }));

    if (!queries || queries.length < 5) {
      return { roleStats, strategicAnalysis: 'Datos insuficientes para analisis.' };
    }

    const recentQuestions = queries.slice(0, 20).map(q => q.question).join(', ');
    const prompt = `Analiza estas preguntas por grupos de interes: ${recentQuestions}`;
    const res = await generateResponse(prompt, [], "Analista escolar.");
    return { roleStats, strategicAnalysis: res.answer };
  }
}

export async function getIARecommendations(): Promise<any> {
  if (!supabaseAdmin) return { recommendations: 'No hay suficientes datos.' };
  {
    const { data } = await supabaseAdmin
      .from('ai_queries')
      .select('question')
      .eq('error_message', 'NO_DOCUMENT_MATCH')
      .or('is_processed.is.false,is_processed.is.null')
      .order('requested_at', { ascending: false })
      .limit(10);

    if (!data || data.length < 3) return { recommendations: 'Continua alimentando el repositorio.' };
    const res = await generateResponse(`Sugiere temas para: ${data.map(q => q.question).join(', ')}`, [], "Experto en politicas.");
    return { recommendations: res.answer };
  }
}
