import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = fs.existsSync(path.join(process.cwd(), '.env.development')) 
  ? '.env.development' 
  : '.env';

dotenv.config({ path: envPath });

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
            parts: [
              {
                text: text,
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    let values = data.embedding.values;
    
    // Si la dimensión es > 1536, truncamos (Matryoshka embeddings)
    if (values.length > 1536) {
      values = values.slice(0, 1536);
    }
    
    return values;
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
  const defaultSystemPrompt = `Eres un asistente de políticas escolares. 
Tu objetivo es responder preguntas sobre las políticas, manuales y documentos de la escuela 
basándote en la información proporcionada. 
Sé preciso, amable y siempre cita las fuentes de donde obtienes la información.
Si la información no está disponible, di claramente que no encuentras la respuesta en los documentos.`;

  const fullPrompt = `${systemPrompt || defaultSystemPrompt}

DOCUMENTOS DE REFERENCIA:
${contextText}

PREGUNTA DEL USUARIO:
${question}

Por favor, responde de manera clara y directa, basándote en los documentos proporcionados.`;

  try {
    const response = await fetch(
      `${GEMINI_API_URL}/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: fullPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const answer = data.candidates[0].content.parts[0].text;
    const tokensUsed = {
      input: data.usageMetadata?.promptTokenCount || 0,
      output: data.usageMetadata?.candidatesTokenCount || 0,
    };

    return { answer, tokensUsed };
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
