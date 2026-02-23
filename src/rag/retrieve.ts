import { getAllChunks } from '../store/indexStore';
import { generateEmbedding } from '../store/embeddings';
import { cosineSimilarity } from '../utils/similarity';
import { formatSource } from '../utils/format';
import { logger } from '../utils/logger';
import { SearchResult } from './types';
import { config } from '../config/env';

/**
 * 질문에 대해 top-k 유사 청크를 검색.
 * 추후 벡터DB로 교체 시 이 함수의 내부만 변경하면 됨.
 */
export async function retrieveTopK(query: string, topK?: number): Promise<SearchResult[]> {
  const k = topK ?? config.topK;
  const chunks = getAllChunks();

  if (chunks.length === 0) {
    logger.warn('인덱스에 청크가 없습니다. npm run ingest를 먼저 실행하세요.');
    return [];
  }

  const queryEmbedding = await generateEmbedding(query);

  const scored: SearchResult[] = chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  const results = scored.slice(0, k);
  logger.info(`검색 완료: 상위 ${results.length}개 문서 (총 ${chunks.length}개 중)`);

  return results;
}

/** 검색 결과에서 context 문자열 생성 */
export function buildContext(results: SearchResult[]): string {
  if (results.length === 0) return '';

  return results
    .map((r, i) => {
      const source = formatSource(r.chunk.metadata);
      return `[문서 ${i + 1}] (출처: ${source})\n${r.chunk.content}`;
    })
    .join('\n\n---\n\n');
}
