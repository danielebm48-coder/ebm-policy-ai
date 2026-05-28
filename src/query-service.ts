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

    // Buscar chunks relevantes
    let similarChunks: ChunkWithSimilarity[] = [];
    try {
      similarChunks = await findSimilarChunks(question, 5);
    } catch (error) {
      console.warn('Error finding similar chunks:', error);
      // Continuar sin chunks si hay error en la búsqueda
    }

    // Filtrar por permisos de acceso
    const allowedChunks: ChunkWithSimilarity[] = [];
    for (const chunk of similarChunks) {
      const hasAccess = await checkDocumentAccess(chunk.document_id, userRole, 'ask');
      if (hasAccess) {
        allowedChunks.push(chunk);
      }
    }

    // Obtener documentos completos asociados a los chunks
    const uniqueDocIds = [...new Set(allowedChunks.map((c) => c.document_id))];
    const { data: documents, error: docError } = await supabaseClient
      .from('documents')
      .select('*')
      .in('id', uniqueDocIds);

    if (docError) {
      console.warn('Error fetching documents:', docError);
    }

    // Preparar contexto para la IA
    const contextTexts = allowedChunks.map((chunk) => chunk.text);
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

      const result = await generateResponse(question, contextTexts, systemPrompt);
      answer = result.answer;
      tokensUsed = result.tokensUsed;
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

    const stats = {
      total_queries: data?.length || 0,
      completed: data?.filter((q: any) => q.status === 'completed').length || 0,
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
