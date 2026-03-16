import { config } from '../config/env';
import { getOllama } from '../store/embeddings';
import { withRetry } from '../utils/retry';
import { logger } from '../utils/logger';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface QueryRewriteResult {
  standaloneQuery: string;
}

export async function rewriteQueryWithHistory(
  question: string,
  history: ConversationMessage[] = [],
): Promise<string> {
  if (config.useMockLlm || history.length === 0) {
    return question;
  }

  try {
    const recent = history.slice(-6);
    const dialogue = recent.map((msg) => `${msg.role === 'user' ? '사용자' : 'YOBOT'}: ${msg.content}`).join('\n');
    const prompt = `
다음 대화를 참고해서 마지막 사용자 질문을 독립적으로 이해 가능한 검색 질의로 재작성하세요.
의미가 이미 명확하면 원문을 유지하세요.

[대화]
${dialogue}

[마지막 사용자 질문]
${question}

반드시 아래 JSON 형식으로만 응답하세요.
{
  "standaloneQuery": "재작성된 질문"
}
`;
    const ollama = getOllama();
    const result = await withRetry(
      () =>
        ollama.generate({
          model: config.ollamaModel,
          prompt,
          format: 'json',
          options: { temperature: 0.1 },
        }),
      'Ollama 질문 재작성',
      { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 5000 },
    );
    const parsed = JSON.parse(result.response ?? '{}') as QueryRewriteResult;
    const rewritten = parsed.standaloneQuery?.trim();
    if (!rewritten) {
      return question;
    }
    return rewritten;
  } catch (error) {
    logger.warn('질문 재작성 실패. 원문 질문으로 진행합니다.', error);
    return question;
  }
}
