import { GoogleGenerativeAI, Schema, SchemaType } from '@google/generative-ai';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

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

const graphExtractionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    entities: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING, description: 'Unique identifier for the entity (e.g., entity_1)' },
          type: { type: SchemaType.STRING, description: 'Type of the entity (e.g., Person, Organization, Location, Concept, Technology)' },
          name: { type: SchemaType.STRING, description: 'Name of the entity' },
          description: { type: SchemaType.STRING, description: 'Brief description of the entity' },
        },
        required: ['id', 'type', 'name'],
      },
    },
    relationships: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          sourceId: { type: SchemaType.STRING, description: 'ID of the source entity' },
          targetId: { type: SchemaType.STRING, description: 'ID of the target entity' },
          type: { type: SchemaType.STRING, description: 'Type of the relationship (e.g., WORKS_FOR, LOCATED_IN, RELATES_TO, USES)' },
          description: { type: SchemaType.STRING, description: 'Brief description of the relationship' },
        },
        required: ['sourceId', 'targetId', 'type'],
      },
    },
  },
  required: ['entities', 'relationships'],
};

/**
 * 텍스트 청크에서 개체와 관계를 추출합니다.
 */
export async function extractGraphFromText(text: string): Promise<GraphExtractionResult> {
  if (config.useMockLlm) {
    logger.warn('Mock LLM 모드에서는 그래프 추출을 수행하지 않습니다.');
    return { entities: [], relationships: [] };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: graphExtractionSchema,
      },
    });

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
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
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

const queryExtractionSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    entities: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'List of entity names extracted from the query',
    },
  },
  required: ['entities'],
};

/**
 * 사용자 질문에서 주요 개체(키워드)를 추출합니다.
 */
export async function extractEntitiesFromQuery(query: string): Promise<string[]> {
  if (config.useMockLlm) {
    return [];
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: queryExtractionSchema,
      },
    });

    const prompt = `
다음 질문에서 검색에 유용할 주요 개체(Entity, 키워드, 사람 이름, 조직, 기술 등)를 추출하세요.

[질문]
${query}
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
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

