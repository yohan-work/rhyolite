import { config } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { formatSources } from '../utils/format';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { SearchResult, AnswerResult } from './types';
import { buildContext, HybridSearchResult } from './retrieve';
import { getOllama } from '../store/embeddings';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 검색 결과를 기반으로 LLM(또는 Mock)으로 답변 생성 */
export async function generateAnswer(
  question: string,
  searchResults: HybridSearchResult | SearchResult[],
  history?: ConversationMessage[],
): Promise<AnswerResult> {
  const context = buildContext(searchResults);
  
  const isHybrid = !Array.isArray(searchResults);
  const vectorResults = isHybrid ? searchResults.vectorResults : searchResults;
  const sources = vectorResults.map((r) => r.chunk.metadata);

  if (config.useMockLlm) {
    return generateMockAnswer(question, context, sources);
  }

  return generateOllamaAnswer(question, context, sources, history);
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

async function generateOllamaAnswer(
  question: string,
  context: string,
  sources: AnswerResult['sources'],
  history?: ConversationMessage[],
): Promise<AnswerResult> {
  const ollama = getOllama();
  const userPrompt = buildUserPrompt(context, question, history);

  try {
    const result = await withRetry(
      () => ollama.generate({
        model: config.ollamaModel,
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        options: {
          temperature: 0.2,
          num_predict: 1024,
        }
      }),
      'Ollama 답변 생성',
    );
    const answer = result.response ?? '답변을 생성하지 못했습니다.';
    return { answer, sources };
  } catch (error) {
    logger.error('Ollama API 호출 실패 (재시도 소진)', error);
    return {
      answer: '답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      sources: [],
    };
  }
}
