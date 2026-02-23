import fs from 'fs';
import path from 'path';
import { parseTxt } from '../parsers/txtParser';
import { parseMd } from '../parsers/mdParser';
import { parseDocx } from '../parsers/docxParser';
import { parseXlsx } from '../parsers/xlsxParser';
import { generateEmbeddings } from '../store/embeddings';
import { saveIndex } from '../store/indexStore';
import { DocumentChunk, IndexData } from './types';
import { logger } from '../utils/logger';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

const EXTENSION_MAP: Record<string, (filePath: string) => DocumentChunk[] | Promise<DocumentChunk[]>> = {
  '.txt': parseTxt,
  '.md': parseMd,
  '.docx': parseDocx,
  '.xlsx': parseXlsx,
};

/** uploads 폴더의 모든 지원 문서를 파싱 → 임베딩 → 인덱스 저장 */
export async function ingestDocuments(): Promise<void> {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    logger.warn(`uploads 폴더가 없어 생성했습니다: ${UPLOADS_DIR}`);
  }

  const files = fs.readdirSync(UPLOADS_DIR).filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ext in EXTENSION_MAP;
  });

  if (files.length === 0) {
    logger.warn('uploads 폴더에 처리할 문서가 없습니다.');
    return;
  }

  logger.info(`${files.length}개 문서 발견: ${files.join(', ')}`);

  const allChunks: DocumentChunk[] = [];

  for (const file of files) {
    const filePath = path.join(UPLOADS_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const parser = EXTENSION_MAP[ext];

    if (!parser) continue;

    try {
      logger.info(`파싱 중: ${file}`);
      const chunks = await parser(filePath);
      allChunks.push(...chunks);
      logger.info(`  → ${chunks.length}개 청크 생성`);
    } catch (error) {
      logger.error(`파싱 실패: ${file}`, error);
    }
  }

  if (allChunks.length === 0) {
    logger.warn('파싱된 청크가 없습니다.');
    return;
  }

  logger.info(`총 ${allChunks.length}개 청크에 대한 임베딩 생성 시작...`);
  const texts = allChunks.map((c) => c.content);
  const embeddings = await generateEmbeddings(texts);

  for (let i = 0; i < allChunks.length; i++) {
    allChunks[i].embedding = embeddings[i];
  }

  const indexData: IndexData = {
    chunks: allChunks,
    createdAt: new Date().toISOString(),
    version: '1.0.0',
  };

  saveIndex(indexData);
  logger.info(`인덱싱 완료! 총 ${allChunks.length}개 청크가 저장되었습니다.`);
}
