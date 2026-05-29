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

async function findKeywordChunks(
  question: string,
  userRole: string,
  limit: number = 5
): Promise<ChunkWithSimilarity[]> {
  const { data: accessRows, error: accessError } = await supabaseClient
    .from('document_access_policies')
    .select('document_id')
    .eq('role_id', userRole)
    .in('access_level', ['ask', 'search', 'view']);

  if (accessError) {
    console.warn('Error fetching document access policies:', accessError);
    return [];
  }

  const documentIds = [...new Set((accessRows || []).map((row: any) => row.document_id))];
  if (documentIds.length === 0) {
    const { data: activeDocuments, error: docsError } = await supabaseClient
      .from('documents')
      .select('id')
      .eq('status', 'active')
      .limit(50);

    if (docsError) {
      console.warn('Error fetching active documents for fallback:', docsError);
    }

    documentIds.push(...[...new Set((activeDocuments || []).map((row: any) => row.id))]);
  }

  if (documentIds.length === 0) {
    return findBuiltInChunks(question, limit);
  }

  const { data: chunks, error: chunksError } = await supabaseClient
    .from('document_chunks')
    .select('id, document_id, text, chunk_number')
    .in('document_id', documentIds)
    .limit(80);

  if (chunksError) {
    console.warn('Error fetching fallback chunks:', chunksError);
    return [];
  }

  const tokens = tokenizeQuestion(question);
  const scored = (chunks || [])
    .map((chunk: any) => {
      const normalizedText = String(chunk.text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const hits = tokens.filter((token) => normalizedText.includes(token)).length;

      return {
        id: chunk.id,
        document_id: chunk.document_id,
        text: chunk.text,
        similarity: tokens.length > 0 ? hits / tokens.length : 0.1,
      };
    })
    .sort((a: ChunkWithSimilarity, b: ChunkWithSimilarity) => b.similarity - a.similarity);

  const matches = scored.filter((chunk: ChunkWithSimilarity) => chunk.similarity > 0);
  return (matches.length > 0 ? matches : scored).slice(0, limit);
}

function findBuiltInChunks(question: string, limit: number = 5): ChunkWithSimilarity[] {
  const tokens = tokenizeQuestion(question);
  const scored = BUILT_IN_CHUNKS.map((chunk) => {
    const normalizedText = chunk.text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const hits = tokens.filter((token) => normalizedText.includes(token)).length;

    return {
      ...chunk,
      similarity: tokens.length > 0 ? hits / tokens.length : chunk.similarity,
    };
  }).sort((a, b) => b.similarity - a.similarity);

  const matches = scored.filter((chunk) => chunk.similarity > 0);
  return (matches.length > 0 ? matches : scored).slice(0, limit);
}

function buildFallbackAnswer(question: string, chunks: ChunkWithSimilarity[]): string {
  const context = chunks.map((chunk) => chunk.text).join('\n\n');
  const tokens = tokenizeQuestion(question);
  const sentences = context
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const ranked = sentences
    .map((sentence) => {
      const normalized = sentence
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const score = tokens.filter((token) => normalized.includes(token)).length;
      return { sentence, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked
    .filter((item) => item.score > 0)
    .slice(0, 4)
    .map((item) => item.sentence);

  const answerSentences = selected.length > 0 ? selected : sentences.slice(0, 4);
  const sources = [...new Set(chunks.map((chunk) => chunk.document_id))].join(', ');

  return `Segun las politicas disponibles: ${answerSentences.join(' ')}\n\nFuente: ${sources || 'base de conocimiento escolar'}.`;
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
    const { data, error } = await supabaseClient.rpc('match_documents', {
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

    if (allowedChunks.length === 0 && similarChunks.some((chunk) => chunk.id.startsWith('builtin_'))) {
      allowedChunks.push(...similarChunks.filter((chunk) => chunk.id.startsWith('builtin_')));
    }

    if (allowedChunks.length === 0) {
      allowedChunks.push(...findBuiltInChunks(question, 5));
    }

    const hasDocumentMatch = allowedChunks.some((chunk) => chunk.similarity > 0);

    // Obtener documentos completos asociados a los chunks
    const uniqueDocIds = hasDocumentMatch ? [...new Set(allowedChunks.map((c) => c.document_id))] : [];
    const { data: documents, error: docError } = await supabaseClient
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

    if (contextTexts.length > 0) {
      const systemPrompt = `Eres un asistente de políticas escolares especializado en responder preguntas 
sobre las normas, procedimientos y documentos de la institución educativa. 
Responde de manera clara, precisa y amable. Siempre basa tu respuesta en los documentos proporcionados.
Si no encuentras la información en los documentos, indícalo claramente al usuario.
Cita siempre las secciones o documentos de los que obtienes la información.`;

      try {
        const result = await generateResponse(question, contextTexts, systemPrompt);
        answer = result.answer;
        tokensUsed = result.tokensUsed;
      } catch (error) {
        console.warn('Gemini response failed, using local fallback answer:', error);
        answer = buildFallbackAnswer(question, allowedChunks);
      }
    } else {
      answer =
        'No encontré documentos disponibles sobre este tema en el repositorio. Por favor, contacta con la administración para más información.';
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
    const { data, error } = await supabaseClient
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
    let query = supabaseClient.from('ai_queries').select('*');

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
    };

    // Agrupar por rol
    data?.forEach((query: any) => {
      if (!stats.by_role[query.user_role]) {
        stats.by_role[query.user_role] = 0;
      }
      stats.by_role[query.user_role]++;
    });

    return stats;
  } catch (error) {
    console.error('Error fetching query statistics:', error);
    throw error;
  }
}
