import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { parseTxt } from '../parsers/txtParser';
import { parseMd } from '../parsers/mdParser';
import { parseDocx } from '../parsers/docxParser';
import { parseXlsx } from '../parsers/xlsxParser';
import { parsePdf } from '../parsers/pdfParser';
import { parsePptx } from '../parsers/pptxParser';
import { generateEmbeddings } from '../store/embeddings';
import { loadIndex, saveIndex } from '../store/indexStore';
import { DocumentChunk, IndexData } from './types';
import { logger } from '../utils/logger';
import { extractGraphFromText } from './graph';
import { saveGraphData, clearGraphData, closeNeo4jDriver } from '../store/neo4jStore';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

const EXTENSION_MAP: Record<string, (filePath: string) => DocumentChunk[] | Promise<DocumentChunk[]>> = {
  '.txt': parseTxt,
  '.md': parseMd,
  '.docx': parseDocx,
  '.xlsx': parseXlsx,
  '.pdf': parsePdf,
  '.pptx': parsePptx,
};

function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** uploads 폴더의 문서를 증분 인덱싱 (변경된 파일만 재처리) */
export async function ingestDocuments(forceAll = false): Promise<void> {
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

  if (forceAll) {
    logger.info('전체 인덱싱 모드: Neo4j 그래프 데이터를 초기화합니다.');
    await clearGraphData();
  }

  const existingIndex = loadIndex();
  const existingHashes = existingIndex.fileHashes ?? {};

  const currentHashes: Record<string, string> = {};
  const changedFiles: string[] = [];
  const unchangedFiles: string[] = [];

  for (const file of files) {
    const filePath = path.join(UPLOADS_DIR, file);
    const hash = computeFileHash(filePath);
    currentHashes[file] = hash;

    if (forceAll || existingHashes[file] !== hash) {
      changedFiles.push(file);
    } else {
      unchangedFiles.push(file);
    }
  }

  const deletedFiles = Object.keys(existingHashes).filter((f) => !currentHashes[f]);

  if (changedFiles.length === 0 && deletedFiles.length === 0) {
    logger.info('변경된 문서가 없습니다. 인덱싱을 건너뜁니다.');
    return;
  }

  logger.info(`문서 현황 - 변경/신규: ${changedFiles.length}개, 유지: ${unchangedFiles.length}개, 삭제: ${deletedFiles.length}개`);

  const retainedChunks = existingIndex.chunks.filter(
    (c) => unchangedFiles.includes(c.metadata.fileName) && c.embedding.length > 0,
  );

  const newChunks: DocumentChunk[] = [];
  for (const file of changedFiles) {
    const filePath = path.join(UPLOADS_DIR, file);
    const ext = path.extname(file).toLowerCase();
    const parser = EXTENSION_MAP[ext];
    if (!parser) continue;

    try {
      logger.info(`파싱 중: ${file}`);
      const chunks = await parser(filePath);
      newChunks.push(...chunks);
      logger.info(`  → ${chunks.length}개 청크 생성`);
    } catch (error) {
      logger.error(`파싱 실패: ${file}`, error);
    }
  }

  if (newChunks.length > 0) {
    logger.info(`${newChunks.length}개 신규 청크에 대한 임베딩 생성 시작...`);
    const texts = newChunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(texts);

    for (let i = 0; i < newChunks.length; i++) {
      newChunks[i].embedding = embeddings[i];
    }

    logger.info(`${newChunks.length}개 신규 청크에 대한 지식 그래프 추출 시작...`);
    for (let i = 0; i < newChunks.length; i++) {
      const chunk = newChunks[i];
      try {
        logger.info(`그래프 추출 중 (${i + 1}/${newChunks.length}): ${chunk.metadata.fileName}`);
        const graphData = await extractGraphFromText(chunk.content);
        
        if (graphData.entities.length > 0) {
          await saveGraphData(graphData);
          logger.info(`  → 추출 완료: 엔티티 ${graphData.entities.length}개, 관계 ${graphData.relationships.length}개`);
        }
        
        // 무료 티어 Rate Limit 방지를 위해 청크 간 3초 대기
        if (i < newChunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error) {
        logger.error(`그래프 추출 실패 (${chunk.metadata.fileName}):`, error);
      }
    }
  }

  const allChunks = [...retainedChunks, ...newChunks];

  const indexData: IndexData = {
    chunks: allChunks,
    createdAt: new Date().toISOString(),
    version: '1.0.0',
    fileHashes: currentHashes,
  };

  saveIndex(indexData);
  logger.info(`인덱싱 완료! 총 ${allChunks.length}개 청크 (유지: ${retainedChunks.length}, 신규: ${newChunks.length})`);
  
  await closeNeo4jDriver();
}
