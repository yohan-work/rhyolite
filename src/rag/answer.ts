import { config } from '../config/env';
import { logger } from '../utils/logger';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { SearchResult, AnswerResult } from './types';
import { buildContext } from './retrieve';

/** 검색 결과를 기반으로 LLM(또는 Mock)으로 답변 생성 */
export async function generateAnswer(
  question: string,
  searchResults: SearchResult[],
): Promise<AnswerResult> {
  const context = buildContext(searchResults);
  const sources = searchResults.map((r) => r.chunk.metadata);

  if (config.useMockLlm || !config.geminiApiKey) {
    return generateMockAnswer(question, context, sources);
  }

  return generateGeminiAnswer(question, context, sources);
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

  const sourceList = sources
    .map((s) => {
      const parts = [s.fileName];
      if (s.sheetName) parts.push(`시트: ${s.sheetName}`);
      if (s.rowIndex !== undefined) parts.push(`행: ${s.rowIndex}`);
      if (s.section) parts.push(`섹션: ${s.section}`);
      return parts.join(' / ');
    })
    .filter((v, i, arr) => arr.indexOf(v) === i);

  const answer = `[Mock 응답] 질문 "${question}"에 대한 관련 문서를 찾았습니다.\n\n관련 내용:\n${firstSnippet}...\n\n📎 출처:\n${sourceList.map((s) => `- ${s}`).join('\n')}`;

  return { answer, sources };
}

async function generateGeminiAnswer(
  question: string,
  context: string,
  sources: AnswerResult['sources'],
): Promise<AnswerResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
    },
  });

  const userPrompt = buildUserPrompt(context, question);

  try {
    const result = await model.generateContent(userPrompt);
    const answer = result.response.text() ?? '답변을 생성하지 못했습니다.';
    return { answer, sources };
  } catch (error) {
    logger.error('Gemini API 호출 실패', error);
    return {
      answer: '답변 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      sources: [],
    };
  }
}
