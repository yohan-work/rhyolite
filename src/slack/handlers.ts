import { App } from '@slack/bolt';
import { logger } from '../utils/logger';
import { retrieveTopK } from '../rag/retrieve';
import { generateAnswer } from '../rag/answer';

/** 멘션 텍스트에서 봇 ID 태그를 제거하고 순수 질문만 추출 */
function extractQuestion(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

export function registerHandlers(app: App): void {
  app.event('app_mention', async ({ event, say }) => {
    try {
      const question = extractQuestion(event.text ?? '');
      logger.info(`멘션 수신 - 사용자: ${event.user}, 질문: "${question}"`);

      if (!question) {
        await say({ text: '질문을 입력해주세요!', thread_ts: event.ts });
        return;
      }

      const searchResults = await retrieveTopK(question);
      const { answer, sources } = await generateAnswer(question, searchResults);

      const sourceNames = sources.map((s) => {
        const parts = [s.fileName];
        if (s.sheetName) parts.push(`시트: ${s.sheetName}`);
        if (s.rowIndex !== undefined) parts.push(`행: ${s.rowIndex}`);
        if (s.section) parts.push(`섹션: ${s.section}`);
        return parts.join(' / ');
      });

      logger.logQA(question, answer, sourceNames);

      await say({ text: answer, thread_ts: event.ts });
    } catch (error) {
      logger.error('app_mention 처리 중 오류 발생', error);
      try {
        await say({
          text: '죄송합니다. 요청 처리 중 오류가 발생했습니다.',
          thread_ts: event.ts,
        });
      } catch (replyError) {
        logger.error('에러 응답 전송 실패', replyError);
      }
    }
  });
}
