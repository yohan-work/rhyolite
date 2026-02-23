import { ingestDocuments } from '../src/rag/ingest';
import { logger } from '../src/utils/logger';

async function main(): Promise<void> {
  logger.info('=== 문서 인덱싱 시작 ===');
  await ingestDocuments();
  logger.info('=== 문서 인덱싱 완료 ===');
}

main().catch((error) => {
  logger.error('인덱싱 스크립트 실행 중 오류 발생', error);
  process.exit(1);
});
