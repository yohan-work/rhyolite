import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

let genAIInstance: GoogleGenerativeAI | null = null;
let embeddingModel: GenerativeModel | null = null;

function getEmbeddingModel(): GenerativeModel {
  if (!embeddingModel) {
    if (!genAIInstance) {
      genAIInstance = new GoogleGenerativeAI(config.geminiApiKey);
    }
    embeddingModel = genAIInstance.getGenerativeModel({ model: 'gemini-embedding-001' });
  }
  return embeddingModel;
}

export function getGenAI(): GoogleGenerativeAI {
  if (!genAIInstance) {
    genAIInstance = new GoogleGenerativeAI(config.geminiApiKey);
  }
  return genAIInstance;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (config.useMockLlm || !config.geminiApiKey) {
    return generateMockEmbedding(text);
  }
  return generateGeminiEmbedding(text);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (config.useMockLlm || !config.geminiApiKey) {
    return texts.map(generateMockEmbedding);
  }
  return generateGeminiEmbeddings(texts);
}

function generateMockEmbedding(text: string): number[] {
  const DIMS = 128;
  const vec = new Array<number>(DIMS).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  for (const word of words) {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash * 31 + word.charCodeAt(i)) & 0x7fffffff;
    }
    const idx = hash % DIMS;
    vec[idx] += 1;
  }

  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < DIMS; i++) {
      vec[i] /= norm;
    }
  }

  return vec;
}

async function generateGeminiEmbedding(text: string): Promise<number[]> {
  const model = getEmbeddingModel();
  return withRetry(async () => {
    const result = await model.embedContent(text);
    return result.embedding.values;
  }, 'Gemini 임베딩');
}

async function generateGeminiEmbeddings(texts: string[]): Promise<number[][]> {
  const model = getEmbeddingModel();
  const allEmbeddings: number[][] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.info(`임베딩 생성 중... (${i + 1}~${Math.min(i + BATCH_SIZE, texts.length)} / ${texts.length})`);

    const batchResult = await withRetry(
      () => model.batchEmbedContents({
        requests: batch.map((text) => ({ content: { parts: [{ text }], role: 'user' } })),
      }),
      `Gemini 배치 임베딩 (${i + 1}~${Math.min(i + BATCH_SIZE, texts.length)})`,
    );

    for (const emb of batchResult.embeddings) {
      allEmbeddings.push(emb.values);
    }
  }

  return allEmbeddings;
}
