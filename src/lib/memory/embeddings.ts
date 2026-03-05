/**
 * Embedding Generation for Semantic Search
 *
 * Uses OpenAI's text-embedding-3-small model for efficient, high-quality embeddings.
 * Falls back gracefully when embeddings are unavailable.
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

interface EmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

/**
 * Generate an embedding vector for a given text.
 * Returns null if embeddings are unavailable (no API key or error).
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[Embeddings] OPENAI_API_KEY not set, semantic search disabled');
    return null;
  }

  try {
    // Truncate text to ~8000 tokens (~32000 chars) to stay within model limits
    const truncatedText = text.slice(0, 32000);

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncatedText,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Embeddings] API error:', response.status, error);
      return null;
    }

    const data = (await response.json()) as EmbeddingResponse;
    return data.data[0]?.embedding ?? null;
  } catch (error) {
    console.error('[Embeddings] Failed to generate embedding:', error);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch.
 * More efficient than calling generateEmbedding() in a loop.
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<(number[] | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || texts.length === 0) {
    return texts.map(() => null);
  }

  try {
    // Process in batches of 100 (OpenAI limit)
    const results: (number[] | null)[] = [];
    const batchSize = 100;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize).map((t) => t.slice(0, 32000));

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: batch,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        // Fill this batch with nulls on error
        results.push(...batch.map(() => null));
        continue;
      }

      const data = (await response.json()) as EmbeddingResponse;

      // Results may not be in order, so sort by index
      const sortedEmbeddings = data.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);

      results.push(...sortedEmbeddings);
    }

    return results;
  } catch (error) {
    console.error('[Embeddings] Batch generation failed:', error);
    return texts.map(() => null);
  }
}

/**
 * Calculate cosine similarity between two embedding vectors.
 * Returns a value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Create a combined embedding from multiple text segments.
 * Useful for creating a single memory embedding from topic + content.
 */
export async function generateCombinedEmbedding(
  segments: string[]
): Promise<number[] | null> {
  const combined = segments.filter(Boolean).join('\n\n');
  return generateEmbedding(combined);
}

/**
 * Check if embeddings are available (API key configured).
 */
export function isEmbeddingsAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export { EMBEDDING_DIMENSIONS };
