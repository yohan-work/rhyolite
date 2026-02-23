import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * 임베딩 생성 모듈.
 * USE_MOCK_LLM=true이거나 Gemini 키가 없으면 키워드 기반 mock 임베딩 사용.
 * 추후 벡터DB 확장 시 이 모듈만 교체하면 됨.
 */
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

/**
 * 간단한 키워드 빈도 기반 mock 임베딩.
 * 단어를 해싱하여 고정 차원 벡터로 변환.
 */
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
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

  const result = await model.embedContent(text);
  return result.embedding.values;
}

async function generateGeminiEmbeddings(texts: string[]): Promise<number[][]> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

  const allEmbeddings: number[][] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.info(`임베딩 생성 중... (${i + 1}~${Math.min(i + BATCH_SIZE, texts.length)} / ${texts.length})`);

    const batchResult = await model.batchEmbedContents({
      requests: batch.map((text) => ({ content: { parts: [{ text }], role: 'user' } })),
    });

    for (const emb of batchResult.embeddings) {
      allEmbeddings.push(emb.values);
    }
  }

  return allEmbeddings;
}
