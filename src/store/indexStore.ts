import fs from 'fs';
import path from 'path';
import { DocumentChunk, IndexData } from '../rag/types';
import { logger } from '../utils/logger';

const INDEX_PATH = path.resolve(process.cwd(), 'data', 'index.json');

export function loadIndex(): IndexData {
  try {
    if (!fs.existsSync(INDEX_PATH)) {
      return createEmptyIndex();
    }
    const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
    return JSON.parse(raw) as IndexData;
  } catch (error) {
    logger.warn('인덱스 로딩 실패, 빈 인덱스로 초기화', error);
    return createEmptyIndex();
  }
}

export function saveIndex(data: IndexData): void {
  const dir = path.dirname(INDEX_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2), 'utf-8');
  logger.info(`인덱스 저장 완료: ${data.chunks.length}개 청크 → ${INDEX_PATH}`);
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
