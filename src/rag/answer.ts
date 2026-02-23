import { config } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { formatSources } from '../utils/format';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { SearchResult, AnswerResult } from './types';
import { buildContext } from './retrieve';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 검색 결과를 기반으로 LLM(또는 Mock)으로 답변 생성 */
export async function generateAnswer(
  question: string,
  searchResults: SearchResult[],
  history?: ConversationMessage[],
): Promise<AnswerResult> {
  const context = buildContext(searchResults);
  const sources = searchResults.map((r) => r.chunk.metadata);

  if (config.useMockLlm || !config.geminiApiKey) {
    return generateMockAnswer(question, context, sources);
  }

  return generateGeminiAnswer(question, context, sources, history);
}

function generateMockAnswer(
  question: string,
  context: string,
  sources: AnswerResult['sources'],
): AnswerResult {
  logger.info('[Mock LLM] 모의 답변 생성 중...');

  if (!context) {
    return {
      answer: '등록된 자료에서 확인되지 않습니다.',
      sources: [],
    };
  }

  const snippets = context.split('---').filter((s) => s.trim());
  const firstSnippet = snippets[0]?.trim().slice(0, 200) ?? '';

  const sourceList = formatSources(sources);

  const answer = `[Mock 응답] 질문 "${question}"에 대한 관련 문서를 찾았습니다.\n\n관련 내용:\n${firstSnippet}...\n\n📎 출처:\n${sourceList.map((s) => `- ${s}`).join('\n')}`;

  return { answer, sources };
}

async function generateGeminiAnswer(
  question: string,
  context: string,
  sources: AnswerResult['sources'],
  history?: ConversationMessage[],
): Promise<AnswerResult> {
  const { getGenAI } = await import('../store/embeddings');
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  });

  const userPrompt = buildUserPrompt(context, question, history);

  try {
    const result = await withRetry(
      () => model.generateContent(userPrompt),
      'Gemini 답변 생성',
    );
    const answer = result.response.text() ?? '답변을 생성하지 못했습니다.';
    return { answer, sources };
  } catch (error) {
    logger.error('Gemini API 호출 실패 (재시도 소진)', error);
    return {
      answer: '답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      sources: [],
    };
  }
}
