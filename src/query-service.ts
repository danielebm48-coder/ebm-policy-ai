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

const BUILT_IN_CHUNKS: ChunkWithSimilarity[] = [
  {
    id: 'builtin_manual_convivencia',
    document_id: 'builtin_manual_convivencia',
    similarity: 0.1,
    text:
      'Manual de Convivencia Escolar 2026. Asistencia y puntualidad: los estudiantes deben ingresar antes de las 08:00 AM. Toda inasistencia debe ser justificada por el apoderado en un plazo de 48 horas. Tres atrasos injustificados en un mes resultaran en citacion al apoderado. El uso de telefonos celulares esta prohibido durante clase salvo autorizacion del profesor con fines pedagogicos. El ciberacoso sera sancionado segun la gravedad de la falta.',
  },
  {
    id: 'builtin_politica_evaluacion',
    document_id: 'builtin_politica_evaluacion',
    similarity: 0.1,
    text:
      'Politica de Evaluacion y Calificacion. La escala de calificacion es de 1.0 a 7.0, con 4.0 como nota minima de aprobacion. Deben realizarse al menos 4 calificaciones por semestre en asignaturas principales. Si un estudiante falta a una evaluacion programada, debe presentar certificado medico. La nueva fecha sera coordinada por el profesor jefe y no puede exceder los 5 dias habiles desde el retorno. La inasistencia injustificada implica evaluacion con exigencia del 70%.',
  },
  {
    id: 'builtin_protocolo_seguridad',
    document_id: 'builtin_protocolo_seguridad',
    similarity: 0.1,
    text:
      'Protocolo de Seguridad y Emergencias. Ante sismo, incendio u otra emergencia se activa la alarma sonora. Todos deben dirigirse con calma a la Zona de Seguridad asignada en el patio central. Los profesores deben portar el libro de clases para pasar lista. En accidente grave se activa el seguro escolar, se traslada al centro asistencial mas cercano y administracion contacta inmediatamente a los padres.',
  },
];

function isVectorSearchEnabled(): boolean {
  return process.env.ENABLE_VECTOR_SEARCH === 'true';
}

function tokenizeQuestion(question: string): string[] {
  const stopWords = new Set([
    'que',
    'como',
    'cuando',
    'donde',
    'cual',
    'cuales',
    'sobre',
    'para',
    'por',
    'con',
    'los',
    'las',
    'una',
    'uno',
    'del',
    'de',
    'la',
    'el',
    'en',
    'y',
    'o',
    'a',
  ]);

  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function findBuiltInChunks(question: string, limit: number = 5): ChunkWithSimilarity[] {
  const tokens = tokenizeQuestion(question);
  if (tokens.length === 0) return BUILT_IN_CHUNKS.slice(0, limit);

  const scored = BUILT_IN_CHUNKS
    .map((chunk) => {
      const normalizedText = String(chunk.text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '');

      const hits = tokens.filter((token) => normalizedText.includes(token)).length;
      const score = hits / Math.max(tokens.length, 1);

      return { ...chunk, similarity: score } as ChunkWithSimilarity;
    })
    .filter((c) => c.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity);

  if (scored.length === 0) return BUILT_IN_CHUNKS.slice(0, limit);
  return scored.slice(0, limit);
}

async function findKeywordChunks(
  question: string,
  userRole: string,
  limit: number = 5
): Promise<ChunkWithSimilarity[]> {
  const db = supabaseAdmin || supabaseClient;
  
  // Intentar obtener documentos por políticas de acceso
  const { data: accessRows, error: accessError } = await db
    .from('document_access_policies')
    .select('document_id')
    .eq('role_id', userRole)
    .in('access_level', ['ask', 'search', 'view']);

  let documentIds: string[] = [];
  
  if (!accessError && accessRows && accessRows.length > 0) {
    documentIds = [...new Set((accessRows || []).map((row: any) => row.document_id))];
    console.log(`Found ${documentIds.length} document IDs from access policies for role ${userRole}`);
  }

  // Si no hay políticas de acceso, buscar documentos activos por defecto
  if (documentIds.length === 0) {
    console.log(`No access policies found for role ${userRole}, fetching active documents...`);
    const { data: activeDocuments, error: docError } = await db
      .from('documents')
      .select('id')
      .eq('status', 'active')
      .limit(100);
    
    if (!docError && activeDocuments && activeDocuments.length > 0) {
      documentIds = [...new Set((activeDocuments || []).map((row: any) => row.id))];
      console.log(`Found ${documentIds.length} active documents`);
    }
  }

  // Si aún no hay documentos, retornar built-in chunks
  if (documentIds.length === 0) {
    console.warn('No documents found for search, returning built-in chunks');
    return findBuiltInChunks(question, limit);
  }

  // Buscar chunks de los documentos encontrados
  const { data: chunks, error: chunksError } = await db
    .from('document_chunks')
    .select('id, document_id, text, chunk_number')
    .in('document_id', documentIds)
    .limit(200);

  if (chunksError) {
    console.error('Error fetching chunks:', chunksError);
    return findBuiltInChunks(question, limit);
  }

  if (!chunks || chunks.length === 0) {
    console.warn(`No chunks found for documents ${documentIds.join(', ')}`);
    return findBuiltInChunks(question, limit);
  }

  console.log(`Found ${chunks.length} chunks from ${documentIds.length} documents`);

  const tokens = tokenizeQuestion(question);
  if (tokens.length === 0) {
    // Si no hay tokens relevantes, retornar todos los chunks como fallback
    return chunks
      .map((chunk: any) => ({
        id: chunk.id,
        document_id: chunk.document_id,
        text: chunk.text,
        similarity: 0.1,
      }))
      .slice(0, limit);
  }

  const scored = (chunks || [])
    .map((chunk: any) => {
      const normalizedText = String(chunk.text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      
      // Contar coincidencias exactas de palabras clave
      const hits = tokens.filter((token) => normalizedText.includes(token)).length;
      const score = hits / Math.max(tokens.length, 1);

      return {
        id: chunk.id,
        document_id: chunk.document_id,
        text: chunk.text,
        similarity: Math.max(score, 0.01), // Mínimo 0.01 para no perder chunks
      };
    })
    .sort((a, b) => b.similarity - a.similarity);

  // Si no hay coincidencias perfectas, retornar los primeros chunks (orden natural de la BD)
  if (scored.filter(c => c.similarity > 0.2).length === 0) {
    console.log(`No exact keyword matches for question, returning first ${limit} chunks from all documents`);
    return scored.slice(0, limit);
  }

  return scored.filter(c => c.similarity > 0.1).slice(0, limit);
}

function buildFallbackAnswer(question: string, chunks: ChunkWithSimilarity[]): string {
  if (chunks.length === 0 || !chunks.some(c => c.similarity > 0.3)) {
    return "Lo siento, no he encontrado información específica en los documentos actuales que responda a tu pregunta. ¿Podrías ser más específico o indicarme sobre qué área (académica, convivencia, etc.) deseas consultar?";
  }

  const sources = [...new Set(chunks.map((chunk) => chunk.document_id))].join(', ');
  return `He encontrado algunas menciones relacionadas en los documentos (${sources}), pero no una respuesta exacta. 

Por favor, verifica si tu consulta se refiere a uno de estos temas o intenta reformularla para ser más preciso. ¿Hay algún documento en particular que te gustaría que revise?`;
}

/**
 * Buscar chunks similares a una pregunta usando pgvector
 */
export async function findSimilarChunks(
  question: string,
  limit: number = 5
): Promise<ChunkWithSimilarity[]> {
  try {
    // Generar embedding para la pregunta
    const questionEmbedding = await generateEmbedding(question);

    // Buscar chunks similares usando pgvector
    const db = supabaseAdmin || supabaseClient;
    const { data, error } = await db.rpc('match_documents', {
      query_embedding: questionEmbedding,
      match_count: limit,
      match_threshold: 0.2,
    });

    if (error) {
      console.error('Error matching documents:', error);
      throw error;
    }

    return data as ChunkWithSimilarity[];
  } catch (error) {
    console.error('Error finding similar chunks:', error);
    throw error;
  }
}

/**
 * Procesar una consulta de usuario y generar respuesta con IA
 */
export async function processUserQuery(
  userId: string,
  userRole: string,
  question: string,
  ipAddress?: string
): Promise<QueryResult> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  const queryId = `query_${Date.now()}`;

  try {
    // Crear registro de consulta
    const { data: queryData, error: queryError } = await supabaseAdmin
      .from('ai_queries')
      .insert([
        {
          id: queryId,
          user_id: userId,
          user_role: userRole,
          question,
          status: 'processing',
        },
      ])
      .select()
      .single();

    if (queryError) {
      throw new Error(`Failed to create query record: ${queryError.message}`);
    }

    // Buscar primero por texto para no depender de Gemini/embeddings en cada consulta.
    let similarChunks: ChunkWithSimilarity[] = await findKeywordChunks(question, userRole, 5);

    if (similarChunks.length === 0 && isVectorSearchEnabled()) {
      try {
        similarChunks = await findSimilarChunks(question, 5);
      } catch (error) {
        console.warn('Error finding similar chunks:', error);
        // Continuar sin chunks si hay error en la busqueda vectorial.
      }
    }

    // Filtrar por permisos de acceso
    const allowedChunks: ChunkWithSimilarity[] = [];
    for (const chunk of similarChunks) {
      const hasAccess = await checkDocumentAccess(chunk.document_id, userRole, 'ask');
      if (hasAccess) {
        allowedChunks.push(chunk);
      }
    }

    // Si no hay chunks permitidos, pero hay chunks de documentos, usarlos como fallback
    // (Esto permite que documentos recién creados, sin políticas de acceso explícitas, se usen)
    if (allowedChunks.length === 0 && similarChunks.length > 0) {
      console.warn(`No allowed chunks by permission check, but ${similarChunks.length} chunks exist. Using as fallback.`);
      allowedChunks.push(...similarChunks);
    }

    // Si aún no hay chunks, usar built-in
    if (allowedChunks.length === 0 && similarChunks.some((chunk) => chunk.id.startsWith('builtin_'))) {
      allowedChunks.push(...similarChunks.filter((chunk) => chunk.id.startsWith('builtin_')));
    }

    if (allowedChunks.length === 0) {
      allowedChunks.push(...findBuiltInChunks(question, 5));
    }

    const hasDocumentMatch = allowedChunks.some((chunk) => chunk.similarity > 0);

    // Obtener documentos completos asociados a los chunks
    const uniqueDocIds = hasDocumentMatch ? [...new Set(allowedChunks.map((c) => c.document_id))] : [];
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .in('id', uniqueDocIds);

    if (docError) {
      console.warn('Error fetching documents:', docError);
    }

    // Preparar contexto para la IA
    const contextTexts = hasDocumentMatch ? allowedChunks.map((chunk) => chunk.text) : [];
    const sourceDocIds = uniqueDocIds;

    // Generar respuesta con IA
    let answer = '';
    let tokensUsed = { input: 0, output: 0 };

    if (contextTexts.length > 0 && hasDocumentMatch) {
      const systemPrompt = `Eres un asistente de políticas escolares experto. Tu objetivo es proporcionar respuestas precisas, concisas y útiles basadas EXCLUSIVAMENTE en los documentos proporcionados.

Sigue estas reglas estrictas:
1. CONCISIÓN: Responde directamente. No repitas fragmentos de texto de forma literal ni innecesaria.
2. CITAS: Cita SOLO los documentos que realmente contienen la respuesta.
3. INTERACCIÓN: Termina siempre con 1 o 2 preguntas breves para ayudar al usuario o profundizar en el tema.
4. CALIDAD: Si la información en los documentos es contradictoria o insuficiente para dar una respuesta clara, indícalo y pregunta detalles adicionales para ayudar mejor.
5. TONO: Profesional y amable.`;

      try {
        const result = await generateResponse(question, contextTexts, systemPrompt);
        answer = result.answer;
        tokensUsed = result.tokensUsed;
      } catch (error) {
        console.error('Gemini API Error:', error);
        answer = "Lo siento, tengo dificultades técnicas para procesar tu respuesta con inteligencia artificial en este momento. Por favor, intenta de nuevo en unos minutos.";
      }
    } else {
      answer = "No he encontrado información específica en el repositorio de documentos que responda a tu pregunta. ¿Te gustaría consultar sobre algún otro tema o que te ayude a contactar con el área responsable?";
    }

    // Actualizar registro de consulta con respuesta
    const { error: updateError } = await supabaseAdmin
      .from('ai_queries')
      .update({
        answer,
        source_documents: sourceDocIds,
        source_chunks: allowedChunks.map((c) => c.id),
        model_used: 'gemini-pro',
        tokens_used: tokensUsed,
        error_message: hasDocumentMatch ? null : 'NO_DOCUMENT_MATCH',
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', queryId);

    if (updateError) {
      console.warn('Error updating query record:', updateError);
    }

    // Registrar auditoría de acceso
    for (const docId of sourceDocIds) {
      await logDocumentAccess(docId, userId, 'query', `Query: ${question}`, ipAddress);
    }

    return {
      queryId,
      question,
      answer,
      sourceDocuments: sourceDocIds,
      tokensUsed,
    };
  } catch (error) {
    console.error('Error processing user query:', error);

    // Actualizar query con error
    if (supabaseAdmin) {
      await supabaseAdmin
        .from('ai_queries')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          completed_at: new Date().toISOString(),
        })
        .eq('id', queryId);
    }

    throw error;
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
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }

  try {
    const { error } = await supabaseAdmin
      .from('ai_queries')
      .update({
        helpful_rating: rating,
        feedback,
        updated_at: new Date().toISOString(),
      })
      .eq('id', queryId);

    if (error) {
      throw new Error(`Failed to rate query: ${error.message}`);
    }
  } catch (error) {
    console.error('Error rating query:', error);
    throw error;
  }
}

/**
 * Obtener historial de consultas del usuario
 */
export async function getUserQueryHistory(
  userId: string,
  limit: number = 20
): Promise<AIQuery[]> {
  try {
    const db = supabaseAdmin || supabaseClient;
    const { data, error } = await db
      .from('ai_queries')
      .select('*')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch query history: ${error.message}`);
    }

    return data as AIQuery[];
  } catch (error) {
    console.error('Error fetching query history:', error);
    throw error;
  }
}

/**
 * Obtener estadísticas de consultas
 */
export async function getQueryStatistics(startDate?: string, endDate?: string) {
  try {
    const db = supabaseAdmin || supabaseClient;
    let query = db.from('ai_queries').select('*');

    if (startDate) {
      query = query.gte('requested_at', startDate);
    }
    if (endDate) {
      query = query.lte('requested_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch query statistics: ${error.message}`);
    }

    const stats: {
      total: number;
      errors: number;
      average_rating: number;
      by_role: Record<string, number>;
      unanswered: number;
      most_consulted: Array<{ id: string; name: string; count: number }>;
    } = {
      total: data?.length || 0,
      errors: data?.filter((q: any) => q.status === 'error').length || 0,
      average_rating:
        data && data.length > 0
          ? data
              .filter((q: any) => q.helpful_rating !== null)
              .reduce((sum: number, q: any) => sum + q.helpful_rating, 0) /
            (data.filter((q: any) => q.helpful_rating !== null).length || 1)
          : 0,
      by_role: {},
      unanswered: data?.filter((q: any) => q.error_message === 'NO_DOCUMENT_MATCH').length || 0,
      most_consulted: [],
    };

    // Agrupar por rol
    data?.forEach((query: any) => {
      if (!stats.by_role[query.user_role]) {
        stats.by_role[query.user_role] = 0;
      }
      stats.by_role[query.user_role]++;
    });

    // Calcular documentos más consultados
    const docCounts: Record<string, number> = {};
    data?.forEach((query: any) => {
      if (query.source_documents && Array.isArray(query.source_documents)) {
        query.source_documents.forEach((docId: string) => {
          docCounts[docId] = (docCounts[docId] || 0) + 1;
        });
      }
    });

    const docIds = Object.keys(docCounts);
    if (docIds.length > 0) {
      const { data: docs } = await db.from('documents').select('id, name').in('id', docIds);
      stats.most_consulted = (docs || [])
        .map((d) => ({
          id: d.id,
          name: d.name,
          count: docCounts[d.id] || 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }

    return stats;
  } catch (error) {
    console.error('Error fetching query statistics:', error);
    throw error;
  }
}

/**
 * Analizar interacciones de grupos de interes para proporcionar insights a la direccion
 */
export async function getStakeholderInsights(): Promise<any> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  try {
    const { data: queries } = await supabaseAdmin
      .from('ai_queries')
      .select('user_role, question, helpful_rating, source_documents, requested_at')
      .order('requested_at', { ascending: false });

    if (!queries || queries.length === 0) {
      return { message: 'No hay datos suficientes para el analisis.' };
    }

    // Agrupar por rol
    const byRole: Record<string, { count: number; queries: string[]; avgRating: number; ratedCount: number }> = {};
    queries.forEach((q) => {
      if (!byRole[q.user_role]) {
        byRole[q.user_role] = { count: 0, queries: [], avgRating: 0, ratedCount: 0 };
      }
      byRole[q.user_role].count++;
      byRole[q.user_role].queries.push(q.question);
      if (q.helpful_rating) {
        byRole[q.user_role].avgRating += q.helpful_rating;
        byRole[q.user_role].ratedCount++;
      }
    });

    const roleInsights = Object.entries(byRole).map(([role, data]) => ({
      role,
      count: data.count,
      avgRating: data.ratedCount > 0 ? data.avgRating / data.ratedCount : 0,
    }));

    // Usar IA para resumir preocupaciones por rol
    const roleAnalysisPrompt = `Analiza las siguientes preocupaciones de diferentes grupos de interes en la escuela basado en sus preguntas:
    
${Object.entries(byRole)
  .map(([role, data]) => `ROL ${role}:\n- ${data.queries.slice(0, 10).join('\n- ')}`)
  .join('\n\n')}

Proporciona un resumen ejecutivo para la direccion sobre:
1. Temas principales de preocupacion por cada grupo.
2. Areas de oportunidad para mejorar la comunicacion institucional.
3. Sugerencias para toma de decisiones administrativas.`;

    const result = await generateResponse(
      roleAnalysisPrompt,
      [],
      'Eres un consultor senior en estrategia educativa y comunicacion institucional.'
    );

    return {
      roleStats: roleInsights,
      strategicAnalysis: result.answer,
    };
  } catch (error) {
    console.error('Error in stakeholder insights:', error);
    throw error;
  }
}

/**
 * Generar recomendaciones de nuevas politicas basadas en consultas sin respuesta
 */
export async function getIARecommendations(): Promise<any> {
  if (!supabaseAdmin) {
    throw new Error('Admin client not configured');
  }

  try {
    const { data: unanswered } = await supabaseAdmin
      .from('ai_queries')
      .select('question')
      .eq('error_message', 'NO_DOCUMENT_MATCH')
      .limit(50);

    if (!unanswered || unanswered.length === 0) {
      return { 
        recommendations: 'No hay suficientes consultas sin respuesta para generar recomendaciones.',
        priority_topics: [] 
      };
    }

    const questions = unanswered.map(q => q.question).join('\n- ');
    const prompt = `Basado en las siguientes preguntas de la comunidad escolar que NO pudieron ser respondidas por falta de informacion en los documentos actuales:
    
- ${questions}

Proporciona:
1. Una lista de 3 a 5 temas prioritarios que requieren la creacion de nuevas politicas o normativas.
2. Una breve justificacion de por que cada tema es importante segun la demanda de los usuarios.
3. Sugerencias de que puntos clave deberian incluir estas nuevas politicas.`;

    const result = await generateResponse(
      prompt,
      [],
      'Eres un experto en gestion escolar y desarrollo organizacional.'
    );

    return {
      recommendations: result.answer,
      total_unanswered: unanswered.length
    };
  } catch (error) {
    console.error('Error in IA recommendations:', error);
    throw error;
  }
}
