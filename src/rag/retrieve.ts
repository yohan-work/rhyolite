import { getAllChunks } from '../store/indexStore';
import { generateEmbedding } from '../store/embeddings';
import { cosineSimilarity } from '../utils/similarity';
import { formatSource } from '../utils/format';
import { logger } from '../utils/logger';
import { SearchResult } from './types';
import { config } from '../config/env';
import { extractEntitiesFromQuery } from './graph';
import { getSubgraphContext } from '../store/neo4jStore';

export interface HybridSearchResult {
  vectorResults: SearchResult[];
  graphContext: string;
  queryEntities: string[];
}

function computeEntityOverlapScore(content: string, entities: string[]): number {
  if (entities.length === 0) return 0;
  const lowered = content.toLowerCase();
  const hitCount = entities.filter((entity) => lowered.includes(entity.toLowerCase())).length;
  return hitCount / entities.length;
}

/**
 * 질문에 대해 top-k 유사 청크를 검색하고, 그래프 컨텍스트를 함께 반환합니다.
 */
export async function retrieveHybrid(query: string, topK?: number): Promise<HybridSearchResult> {
  const k = topK ?? config.topK;
  const chunks = getAllChunks();
  let queryEntities: string[] = [];

  let vectorResults: SearchResult[] = [];
  
  if (chunks.length === 0) {
    logger.warn('인덱스에 청크가 없습니다. npm run ingest를 먼저 실행하세요.');
  } else {
    const queryEmbedding = await generateEmbedding(query);

    const scored = chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    vectorResults = scored.slice(0, k).map(({ chunk, score }) => ({ chunk, score }));
    logger.info(`벡터 검색 완료: 상위 ${vectorResults.length}개 문서 (총 ${chunks.length}개 중)`);
  }

  // 지식 그래프 검색
  let graphContext = '';
  try {
    queryEntities = await extractEntitiesFromQuery(query);
    if (queryEntities.length > 0) {
      logger.info(`질문에서 추출된 개체: ${queryEntities.join(', ')}`);
      graphContext = await getSubgraphContext(queryEntities, config.graphMaxHops);
      if (graphContext) {
        logger.info('지식 그래프 컨텍스트를 성공적으로 조회했습니다.');
      }
    }
  } catch (error) {
    logger.error('하이브리드 검색 중 그래프 조회 실패:', error);
  }

  // 그래프 개체 정보를 얻은 뒤 최종 rerank를 다시 수행합니다.
  if (vectorResults.length > 0 && queryEntities.length > 0) {
    vectorResults = vectorResults
      .map((result) => {
        const overlapScore = computeEntityOverlapScore(result.chunk.content, queryEntities);
        const rerankScore =
          result.score * (1 - config.rerankEntityWeight) + overlapScore * config.rerankEntityWeight;
        return {
          ...result,
          score: rerankScore,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  return { vectorResults, graphContext, queryEntities };
}

/**
 * 하위 호환성을 위한 기존 함수
 */
export async function retrieveTopK(query: string, topK?: number): Promise<SearchResult[]> {
  const { vectorResults } = await retrieveHybrid(query, topK);
  return vectorResults;
}

/** 검색 결과에서 context 문자열 생성 (하이브리드 지원) */
export function buildContext(hybridResult: HybridSearchResult | SearchResult[]): string {
  const isHybrid = !Array.isArray(hybridResult);
  const vectorResults = isHybrid ? hybridResult.vectorResults : hybridResult;
  const graphContext = isHybrid ? hybridResult.graphContext : '';

  let context = '';

  if (graphContext) {
    context += `${graphContext}\n\n---\n\n`;
  }

  if (vectorResults.length > 0) {
    context += vectorResults
      .map((r, i) => {
        const source = formatSource(r.chunk.metadata);
        return `[문서 ${i + 1}] (출처: ${source})\n${r.chunk.content}`;
      })
      .join('\n\n---\n\n');
  }

  return context;
}

