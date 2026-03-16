import { Ollama } from 'ollama';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';
import { getOllama } from '../store/embeddings';

export interface Entity {
  id: string;
  type: string;
  name: string;
  description?: string;
}

export interface Relationship {
  sourceId: string;
  targetId: string;
  type: string;
  description?: string;
}

export interface GraphExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
}

/**
 * 텍스트 청크에서 개체와 관계를 추출합니다.
 */
export async function extractGraphFromText(text: string): Promise<GraphExtractionResult> {
  if (config.useMockLlm) {
    logger.warn('Mock LLM 모드에서는 그래프 추출을 수행하지 않습니다.');
    return { entities: [], relationships: [] };
  }

  try {
    const ollama = getOllama();
    const prompt = `
다음 텍스트에서 주요 개체(Entity)와 그들 간의 관계(Relationship)를 추출하세요.

[텍스트 시작]
${text}
[텍스트 끝]

추출 지침:
1. 개체 유형(type)은 다음 중 하나를 권장합니다: Person, Organization, Location, Concept, Technology, Event, Product.
2. 관계 유형(type)은 대문자와 밑줄을 사용하세요 (예: WORKS_FOR, LOCATED_IN, RELATES_TO, USES, CREATED, PART_OF).
3. 각 개체는 고유한 id를 가져야 하며, 관계는 이 id를 사용하여 연결해야 합니다.
4. 텍스트에 명시적으로 나타난 정보만 추출하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명은 포함하지 마세요.
{
  "entities": [
    { "id": "entity_1", "type": "Person", "name": "홍길동", "description": "개발자" }
  ],
  "relationships": [
    { "sourceId": "entity_1", "targetId": "entity_2", "type": "WORKS_FOR", "description": "소속됨" }
  ]
}
`;

    const result = await withRetry(
      () => ollama.generate({
        model: config.ollamaModel,
        prompt: prompt,
        format: 'json',
        options: {
          temperature: 0.1,
        }
      }),
      'Ollama 그래프 추출',
      { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 10000 }
    );
    
    const responseText = result.response;
    
    if (!responseText) {
      throw new Error('LLM 응답이 비어있습니다.');
    }

    const parsedResult = JSON.parse(responseText) as GraphExtractionResult;
    return parsedResult;
  } catch (error) {
    logger.error('그래프 추출 중 오류 발생:', error);
    return { entities: [], relationships: [] };
  }
}

export interface QueryEntityExtractionResult {
  entities: string[];
}

/**
 * 사용자 질문에서 주요 개체(키워드)를 추출합니다.
 */
export async function extractEntitiesFromQuery(query: string): Promise<string[]> {
  if (config.useMockLlm) {
    return [];
  }

  try {
    const ollama = getOllama();
    const prompt = `
다음 질문에서 검색에 유용할 주요 개체(Entity, 키워드, 사람 이름, 조직, 기술 등)를 추출하세요.

[질문]
${query}

반드시 아래 JSON 형식으로만 응답하세요. 다른 설명은 포함하지 마세요.
{
  "entities": ["키워드1", "키워드2"]
}
`;

    const result = await withRetry(
      () => ollama.generate({
        model: config.ollamaModel,
        prompt: prompt,
        format: 'json',
        options: {
          temperature: 0.1,
        }
      }),
      'Ollama 질문 개체 추출',
      { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 10000 }
    );
    
    const responseText = result.response;
    
    if (!responseText) {
      return [];
    }

    const parsedResult = JSON.parse(responseText) as QueryEntityExtractionResult;
    return parsedResult.entities || [];
  } catch (error) {
    logger.error('질문 개체 추출 중 오류 발생:', error);
    return [];
  }
}

