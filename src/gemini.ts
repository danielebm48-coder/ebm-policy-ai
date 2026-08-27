import { loadEnv } from './config/env';

loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'models/gemini-3.5-flash-lite';
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
const GEMINI_MAX_RETRIES = Number.parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10);
const GEMINI_MIN_INTERVAL_MS = Number.parseInt(process.env.GEMINI_MIN_INTERVAL_MS || '4000', 10);
const GEMINI_MAX_OUTPUT_TOKENS = Number.parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS || '1536', 10);

let nextGeminiRequestAt = 0;
let geminiThrottleQueue = Promise.resolve();

if (!GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY not configured. AI features will be disabled.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleGeminiRequest(): Promise<void> {
  let release!: () => void;
  const previous = geminiThrottleQueue;
  geminiThrottleQueue = new Promise((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    const waitMs = Math.max(0, nextGeminiRequestAt - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    nextGeminiRequestAt = Date.now() + Math.max(0, GEMINI_MIN_INTERVAL_MS);
  } finally {
    release();
  }
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) return seconds * 1000;

    const retryDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryDate)) return Math.max(0, retryDate - Date.now());
  }

  return Math.min(30000, 1000 * 2 ** attempt);
}

async function fetchGemini(path: string, body: unknown): Promise<any> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
    await throttleGeminiRequest();

    const response = await fetch(`${GEMINI_API_URL}/${path}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    const apiError = data.error;

    if (response.ok && !apiError) {
      return data;
    }

    const code = apiError?.code || response.status;
    const message = apiError?.message || response.statusText || 'Gemini request failed';
    lastError = new Error(`Gemini Error [${code}]: ${message}`);

    if ((code === 429 || code === 503) && attempt < GEMINI_MAX_RETRIES) {
      const delayMs = getRetryDelayMs(response, attempt);
      console.warn(`[Gemini] ${code} recibido. Reintentando en ${Math.round(delayMs / 1000)}s...`);
      await sleep(delayMs);
      continue;
    }

    if (code === 429) {
      throw new Error(`LIMITE_EXCEDIDO: ${message}`);
    }

    throw lastError;
  }

  throw lastError || new Error('Gemini request failed');
}

/**
 * Generar embeddings para un texto usando Google Gemini
 * Ajustado a 1536 dimensiones para compatibilidad con la DB actual
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  try {
    const data = await fetchGemini(`${GEMINI_EMBEDDING_MODEL}:embedContent`, {
      model: `models/${GEMINI_EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: text }],
      },
      outputDimensionality: 1536,
    });

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
    const data = await fetchGemini(`${GEMINI_CHAT_MODEL}:generateContent`, {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      },
    });

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
  model: GEMINI_CHAT_MODEL,
  embeddingModel: GEMINI_EMBEDDING_MODEL,
  maxContextLength: 30000,
  temperatureDefault: 0.7,
};
