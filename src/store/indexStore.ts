import fs from 'fs';
import path from 'path';
import { DocumentChunk, IndexData } from '../rag/types';
import { logger } from '../utils/logger';

const INDEX_PATH = path.resolve(process.cwd(), 'data', 'index.json');

let cachedIndex: IndexData | null = null;

export function loadIndex(): IndexData {
  if (cachedIndex) return cachedIndex;

  try {
    if (!fs.existsSync(INDEX_PATH)) {
      cachedIndex = createEmptyIndex();
      return cachedIndex;
    }
    const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
    cachedIndex = JSON.parse(raw) as IndexData;
    logger.info(`인덱스 캐시 로드 완료: ${cachedIndex.chunks.length}개 청크`);
    return cachedIndex;
  } catch (error) {
    logger.warn('인덱스 로딩 실패, 빈 인덱스로 초기화', error);
    cachedIndex = createEmptyIndex();
    return cachedIndex;
  }
}

export function saveIndex(data: IndexData): void {
  const dir = path.dirname(INDEX_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = INDEX_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, INDEX_PATH);

  cachedIndex = data;
  logger.info(`인덱스 저장 완료: ${data.chunks.length}개 청크 → ${INDEX_PATH}`);
}

/** 캐시를 무효화하여 다음 로드 시 디스크에서 다시 읽도록 함 */
export function invalidateCache(): void {
  cachedIndex = null;
}

export function getAllChunks(): DocumentChunk[] {
  const index = loadIndex();
  return index.chunks;
}

function createEmptyIndex(): IndexData {
  return {
    chunks: [],
    createdAt: new Date().toISOString(),
    version: '1.0.0',
  };
}
