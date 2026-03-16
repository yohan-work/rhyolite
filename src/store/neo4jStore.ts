import crypto from 'crypto';
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

export interface GraphSourceRef {
  fileName: string;
  chunkId: string;
  chunkIndex: number;
}

export interface GraphStats {
  entityCount: number;
  relationshipCount: number;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

function buildEntityId(type: string, name: string): string {
  const normalized = `${normalizeToken(type)}|${normalizeToken(name)}`;
  return `ent_${crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 16)}`;
}

function toNumber(value: unknown): number {
  if (neo4j.isInt(value)) {
    return value.toNumber();
  }
  if (typeof value === 'number') {
    return value;
  }
  return 0;
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
export async function saveGraphData(
  graphData: GraphExtractionResult,
  sourceRef: GraphSourceRef,
): Promise<void> {
  const session = getNeo4jSession();
  try {
    const idMap = new Map<string, string>();
    const sourceNodeId = `${sourceRef.fileName}#${sourceRef.chunkId}`;
    await session.run(
      `
      MERGE (s:SourceChunk {id: $sourceNodeId})
      SET s.fileName = $fileName,
          s.chunkId = $chunkId,
          s.chunkIndex = $chunkIndex,
          s.updatedAt = datetime()
      `,
      {
        sourceNodeId,
        fileName: sourceRef.fileName,
        chunkId: sourceRef.chunkId,
        chunkIndex: sourceRef.chunkIndex,
      },
    );

    // 1. 엔티티 저장
    for (const entity of graphData.entities) {
      // Cypher 쿼리에서 레이블은 동적으로 바인딩할 수 없으므로 문자열 보간을 사용합니다.
      // 보안을 위해 레이블 이름에서 특수문자를 제거합니다.
      const safeLabel = entity.type.replace(/[^a-zA-Z0-9_]/g, '') || 'Unknown';
      const canonicalId = buildEntityId(entity.type, entity.name);
      idMap.set(entity.id, canonicalId);
      
      await session.run(
        `
        MERGE (e:Entity {id: $id})
        SET e:${safeLabel},
            e.name = $name,
            e.type = $type,
            e.description = $description,
            e.normalizedName = $normalizedName,
            e.sourceFiles = CASE
              WHEN $fileName IN coalesce(e.sourceFiles, []) THEN coalesce(e.sourceFiles, [])
              ELSE coalesce(e.sourceFiles, []) + $fileName
            END
        WITH e
        MATCH (s:SourceChunk {id: $sourceNodeId})
        MERGE (s)-[:MENTIONS]->(e)
        `,
        {
          id: canonicalId,
          name: entity.name,
          type: entity.type,
          description: entity.description || '',
          normalizedName: normalizeToken(entity.name),
          fileName: sourceRef.fileName,
          sourceNodeId,
        }
      );
    }

    // 2. 관계 저장
    for (const rel of graphData.relationships) {
      const safeRelType = rel.type.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase() || 'RELATED_TO';
      const sourceEntityId = idMap.get(rel.sourceId);
      const targetEntityId = idMap.get(rel.targetId);
      if (!sourceEntityId || !targetEntityId || sourceEntityId === targetEntityId) {
        continue;
      }
      
      await session.run(
        `
        MATCH (source:Entity {id: $sourceId})
        MATCH (target:Entity {id: $targetId})
        MERGE (source)-[r:${safeRelType}]->(target)
        SET r.description = CASE
              WHEN coalesce(r.description, '') = '' AND $description <> '' THEN $description
              ELSE coalesce(r.description, '')
            END,
            r.sources = CASE
              WHEN $sourceNodeId IN coalesce(r.sources, []) THEN coalesce(r.sources, [])
              ELSE coalesce(r.sources, []) + $sourceNodeId
            END,
            r.sourceFiles = CASE
              WHEN $fileName IN coalesce(r.sourceFiles, []) THEN coalesce(r.sourceFiles, [])
              ELSE coalesce(r.sourceFiles, []) + $fileName
            END
        `,
        {
          sourceId: sourceEntityId,
          targetId: targetEntityId,
          description: rel.description || '',
          sourceNodeId,
          fileName: sourceRef.fileName,
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
 * 특정 파일이 기여한 그래프 데이터만 제거합니다.
 */
export async function removeGraphDataByFile(fileName: string): Promise<void> {
  const session = getNeo4jSession();
  try {
    await session.run(
      `
      MATCH (s:SourceChunk {fileName: $fileName})
      DETACH DELETE s
      `,
      { fileName },
    );

    await session.run(
      `
      MATCH (e:Entity)
      WHERE $fileName IN coalesce(e.sourceFiles, [])
      SET e.sourceFiles = [f IN coalesce(e.sourceFiles, []) WHERE f <> $fileName]
      `,
      { fileName },
    );

    await session.run(
      `
      MATCH (:Entity)-[r]->(:Entity)
      WHERE $fileName IN coalesce(r.sourceFiles, [])
      SET r.sourceFiles = [f IN coalesce(r.sourceFiles, []) WHERE f <> $fileName],
          r.sources = [src IN coalesce(r.sources, []) WHERE NOT src STARTS WITH ($fileName + '#')]
      `,
      { fileName },
    );

    await session.run(
      `
      MATCH (:Entity)-[r]->(:Entity)
      WHERE size(coalesce(r.sourceFiles, [])) = 0
      DELETE r
      `,
    );

    await session.run(
      `
      MATCH (e:Entity)
      WHERE size(coalesce(e.sourceFiles, [])) = 0
      DETACH DELETE e
      `,
    );

    logger.info(`Neo4j 그래프에서 파일 데이터 제거 완료: ${fileName}`);
  } catch (error) {
    logger.error(`Neo4j 그래프 파일 제거 실패: ${fileName}`, error);
  } finally {
    await session.close();
  }
}

/**
 * 그래프 통계를 조회합니다.
 */
export async function getGraphStats(): Promise<GraphStats> {
  const session = getNeo4jSession();
  try {
    const [entityResult, relResult] = await Promise.all([
      session.run('MATCH (e:Entity) RETURN count(e) AS entityCount'),
      session.run('MATCH (:Entity)-[r]->(:Entity) RETURN count(r) AS relationshipCount'),
    ]);

    const entityCount = toNumber(entityResult.records[0]?.get('entityCount'));
    const relationshipCount = toNumber(relResult.records[0]?.get('relationshipCount'));
    return { entityCount, relationshipCount };
  } catch (error) {
    logger.error('Neo4j 그래프 통계 조회 실패', error);
    return { entityCount: 0, relationshipCount: 0 };
  } finally {
    await session.close();
  }
}

/**
 * 주어진 개체 이름 목록과 관련된 하위 그래프(Subgraph) 컨텍스트를 조회합니다.
 */
export async function getSubgraphContext(entityNames: string[], maxHops = 2): Promise<string> {
  if (!entityNames || entityNames.length === 0) return '';

  const session = getNeo4jSession();
  try {
    const hopLimit = Math.max(1, Math.min(3, Math.floor(maxHops)));
    // 대소문자 구분 없이 부분 일치하는 엔티티를 찾고, 1-hop 관계를 가져옵니다.
    const query = `
      UNWIND $entityNames AS entityName
      MATCH (seed:Entity)
      WHERE toLower(seed.name) CONTAINS toLower(entityName)
      MATCH path = (seed)-[rels*1..${hopLimit}]-(neighbor:Entity)
      WHERE all(node IN nodes(path) WHERE node:Entity)
      UNWIND relationships(path) AS rel
      WITH DISTINCT startNode(rel) AS relSource, endNode(rel) AS relTarget, rel
      RETURN relSource.name AS source, type(rel) AS relType, relTarget.name AS target, rel.description AS desc
      LIMIT 50
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


