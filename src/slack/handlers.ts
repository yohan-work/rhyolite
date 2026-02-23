import { App } from '@slack/bolt';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { formatSources } from '../utils/format';
import { retrieveTopK } from '../rag/retrieve';
import { generateAnswer } from '../rag/answer';
import { getHistory, addMessage } from '../store/conversationStore';

/** 멘션 텍스트에서 봇 ID 태그를 제거하고 순수 질문만 추출 */
function extractQuestion(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

export function registerHandlers(app: App): void {
  app.event('app_mention', async ({ event, say }) => {
    try {
      const question = extractQuestion(event.text ?? '');
      const threadTs = event.thread_ts ?? event.ts;
      logger.info(`멘션 수신 - 사용자: ${event.user}, 스레드: ${threadTs}, 질문: "${question}"`);

      if (!question) {
        await say({ text: '질문을 입력해주세요!', thread_ts: threadTs });
        return;
      }

      if (question.length > config.maxInputLength) {
        await say({
          text: `질문이 너무 깁니다. ${config.maxInputLength}자 이내로 입력해주세요.`,
          thread_ts: threadTs,
        });
        return;
      }

      const history = getHistory(threadTs);
      addMessage(threadTs, 'user', question);

      const searchResults = await retrieveTopK(question);
      const { answer, sources } = await generateAnswer(question, searchResults, history);

      addMessage(threadTs, 'assistant', answer);
      logger.logQA(question, answer, formatSources(sources));

      await say({ text: answer, thread_ts: threadTs });
    } catch (error) {
      logger.error('app_mention 처리 중 오류 발생', error);
      const threadTs = event.thread_ts ?? event.ts;
      try {
        await say({
          text: '죄송합니다. 요청 처리 중 오류가 발생했습니다.',
          thread_ts: threadTs,
        });
      } catch (replyError) {
        logger.error('에러 응답 전송 실패', replyError);
      }
    }
  });
}
