import { loadEnv } from './config/env';

loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

if (!GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY not configured. AI features will be disabled.');
}

/**
 * Generar embeddings para un texto usando Google Gemini
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  try {
    const response = await fetch(
      `${GEMINI_API_URL}/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: {
            parts: [{ text: text }],
          },
        }),
      }
    );

    const data = await response.json();
    
    if (data.error) {
      const code = data.error.code;
      const message = data.error.message;
      if (code === 429) {
        throw new Error(`LIMITE_EXCEDIDO: (Embeddings) ${message}`);
      }
      throw new Error(`Gemini Embedding Error [${code}]: ${message}`);
    }

    return data.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generar respuesta usando Google Gemini con contexto RAG
 */
export async function generateResponse(
  question: string,
  context: string[],
  systemPrompt?: string
): Promise<{
  answer: string;
  tokensUsed: { input: number; output: number };
}> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const contextText = context.join('\n\n---\n\n');
  const fullPrompt = `${systemPrompt}

DOCUMENTOS DE REFERENCIA:
${contextText}

PREGUNTA DEL USUARIO:
${question}

Por favor, responde de manera clara y directa basándote en los documentos.`;

  try {
    const response = await fetch(
      `${GEMINI_API_URL}/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    const data = await response.json();
    
    if (data.error) {
      const code = data.error.code;
      const message = data.error.message;
      if (code === 429) {
        throw new Error(`LIMITE_EXCEDIDO: (Chat) ${message}`);
      }
      throw new Error(`Gemini Chat Error [${code}]: ${message}`);
    }

    if (!data.candidates || data.candidates.length === 0) {
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason === 'SAFETY') throw new Error('CONTENIDO_BLOQUEADO');
      throw new Error(`No se obtuvo respuesta de Gemini. Motivo: ${blockReason || 'Desconocido'}`);
    }

    return {
      answer: data.candidates[0].content.parts[0].text,
      tokensUsed: {
        input: data.usageMetadata?.promptTokenCount || 0,
        output: data.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  } catch (error) {
    console.error('Error generating response:', error);
    throw error;
  }
}

/**
 * Calcular similitud coseno entre dos embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Encontrar los chunks más similares a una consulta
 * (Este método se ejecuta en la base de datos con pgvector)
 */
export function buildSimilarityQuery(embedding: number[], limit: number = 5): string {
  const embeddingString = `[${embedding.join(',')}]`;
  return `
    SELECT id, document_id, text, embedding <-> '${embeddingString}'::vector AS distance
    FROM document_chunks
    WHERE embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${limit};
  `;
}

export const geminiConfig = {
  isConfigured: !!GEMINI_API_KEY,
  model: 'gemini-pro',
  embeddingModel: 'embedding-001',
  maxContextLength: 30000,
  temperatureDefault: 0.7,
};
