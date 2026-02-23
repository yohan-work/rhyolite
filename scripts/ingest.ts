import { ingestDocuments } from '../src/rag/ingest';
import { logger } from '../src/utils/logger';

async function main(): Promise<void> {
  const forceAll = process.argv.includes('--force');

  if (forceAll) {
    logger.info('=== 문서 전체 재인덱싱 시작 (--force) ===');
  } else {
    logger.info('=== 문서 증분 인덱싱 시작 ===');
  }

  await ingestDocuments(forceAll);
  logger.info('=== 문서 인덱싱 완료 ===');
}

main().catch((error) => {
  logger.error('인덱싱 스크립트 실행 중 오류 발생', error);
  process.exit(1);
});
