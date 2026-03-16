import neo4j, { Driver, Session } from 'neo4j-driver';
import { logger } from '../utils/logger';
import { GraphExtractionResult } from '../rag/graph';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    logger.info(`Neo4j 드라이버 초기화 완료: ${NEO4J_URI}`);
  }
  return driver;
}

export async function closeNeo4jDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
    logger.info('Neo4j 드라이버 연결 종료');
  }
}

export function getNeo4jSession(): Session {
  return getNeo4jDriver().session();
}

/**
 * Neo4j 연결 상태 확인
 */
export async function verifyNeo4jConnection(): Promise<boolean> {
  try {
    const driver = getNeo4jDriver();
    await driver.verifyConnectivity();
    logger.info('Neo4j 연결 성공');
    return true;
  } catch (error) {
    logger.error('Neo4j 연결 실패', error);
    return false;
  }
}

/**
 * 추출된 그래프 데이터를 Neo4j에 저장합니다.
 */
export async function saveGraphData(graphData: GraphExtractionResult): Promise<void> {
  const session = getNeo4jSession();
  try {
    // 1. 엔티티 저장
    for (const entity of graphData.entities) {
      // Cypher 쿼리에서 레이블은 동적으로 바인딩할 수 없으므로 문자열 보간을 사용합니다.
      // 보안을 위해 레이블 이름에서 특수문자를 제거합니다.
      const safeLabel = entity.type.replace(/[^a-zA-Z0-9_]/g, '');
      
      await session.run(
        `
        MERGE (e:Entity {id: $id})
        SET e:${safeLabel},
            e.name = $name,
            e.type = $type,
            e.description = $description
        `,
        {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          description: entity.description || '',
        }
      );
    }

    // 2. 관계 저장
    for (const rel of graphData.relationships) {
      const safeRelType = rel.type.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
      
      await session.run(
        `
        MATCH (source:Entity {id: $sourceId})
        MATCH (target:Entity {id: $targetId})
        MERGE (source)-[r:${safeRelType}]->(target)
        SET r.description = $description
        `,
        {
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          description: rel.description || '',
        }
      );
    }
  } catch (error) {
    logger.error('Neo4j 그래프 데이터 저장 중 오류 발생:', error);
  } finally {
    await session.close();
  }
}

/**
 * 그래프 데이터 초기화 (전체 삭제)
 */
export async function clearGraphData(): Promise<void> {
  const session = getNeo4jSession();
  try {
    await session.run('MATCH (n) DETACH DELETE n');
    logger.info('Neo4j 그래프 데이터 초기화 완료');
  } catch (error) {
    logger.error('Neo4j 그래프 데이터 초기화 중 오류 발생:', error);
  } finally {
    await session.close();
  }
}

/**
 * 주어진 개체 이름 목록과 관련된 하위 그래프(Subgraph) 컨텍스트를 조회합니다.
 */
export async function getSubgraphContext(entityNames: string[]): Promise<string> {
  if (!entityNames || entityNames.length === 0) return '';

  const session = getNeo4jSession();
  try {
    // 대소문자 구분 없이 부분 일치하는 엔티티를 찾고, 1-hop 관계를 가져옵니다.
    const query = `
      UNWIND $entityNames AS entityName
      MATCH (n:Entity)
      WHERE toLower(n.name) CONTAINS toLower(entityName)
      MATCH (n)-[r]-(m:Entity)
      RETURN n.name AS source, type(r) AS relType, m.name AS target, r.description AS desc
      LIMIT 20
    `;

    const result = await session.run(query, { entityNames });
    
    if (result.records.length === 0) {
      return '';
    }

    const contextLines = result.records.map(record => {
      const source = record.get('source');
      const relType = record.get('relType');
      const target = record.get('target');
      const desc = record.get('desc');
      
      let line = `- ${source} [${relType}] ${target}`;
      if (desc) {
        line += ` (${desc})`;
      }
      return line;
    });

    return `[지식 그래프 정보]\n${contextLines.join('\n')}`;
  } catch (error) {
    logger.error('Neo4j 하위 그래프 조회 중 오류 발생:', error);
    return '';
  } finally {
    await session.close();
  }
}


