import { Ollama } from 'ollama';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

let ollamaInstance: Ollama | null = null;

export function getOllama(): Ollama {
  if (!ollamaInstance) {
    ollamaInstance = new Ollama({ host: config.ollamaBaseUrl });
  }
  return ollamaInstance;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (config.useMockLlm) {
    return generateMockEmbedding(text);
  }
  return generateOllamaEmbedding(text);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (config.useMockLlm) {
    return texts.map(generateMockEmbedding);
  }
  return generateOllamaEmbeddings(texts);
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

async function generateOllamaEmbedding(text: string): Promise<number[]> {
  const ollama = getOllama();
  return withRetry(async () => {
    const response = await ollama.embeddings({
      model: config.ollamaEmbeddingModel,
      prompt: text,
    });
    return response.embedding;
  }, 'Ollama 임베딩');
}

async function generateOllamaEmbeddings(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  
  // Ollama는 batch 임베딩 API를 공식적으로 지원하지 않으므로 순차적으로 처리
  for (let i = 0; i < texts.length; i++) {
    if (i % 10 === 0) {
      logger.info(`임베딩 생성 중... (${i + 1}/${texts.length})`);
    }
    const embedding = await generateOllamaEmbedding(texts[i]);
    allEmbeddings.push(embedding);
  }

  return allEmbeddings;
}
