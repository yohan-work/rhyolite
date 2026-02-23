import { App } from '@slack/bolt';
import { createSlackApp } from './slack/app';
import { registerHandlers } from './slack/handlers';
import { logger } from './utils/logger';

async function main(): Promise<void> {
  const app = createSlackApp();
  registerHandlers(app);

  registerShutdownHandlers(app);

  await app.start();
  logger.info('⚡ YOBOT이 실행되었습니다 (Socket Mode)');
}

function registerShutdownHandlers(app: App): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`${signal} 수신 - YOBOT을 종료합니다...`);
    try {
      await app.stop();
      logger.info('Slack 연결이 정상적으로 종료되었습니다.');
    } catch (error) {
      logger.error('Slack 연결 종료 중 오류 발생', error);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error('YOBOT 시작 실패', error);
  process.exit(1);
});
