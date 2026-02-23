import { createSlackApp } from './slack/app';
import { registerHandlers } from './slack/handlers';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const app = createSlackApp();
  registerHandlers(app);

  await app.start();
  logger.info('⚡ YOBOT이 실행되었습니다 (Socket Mode)');
}

main().catch((error) => {
  logger.error('YOBOT 시작 실패', error);
  process.exit(1);
});
