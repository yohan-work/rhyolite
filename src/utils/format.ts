import { ChunkMetadata } from '../rag/types';

/** 청크 메타데이터를 출처 문자열로 포맷팅 */
export function formatSource(meta: Pick<ChunkMetadata, 'fileName' | 'sheetName' | 'rowIndex' | 'section'>): string {
  const parts = [meta.fileName];
  if (meta.sheetName) parts.push(`시트: ${meta.sheetName}`);
  if (meta.rowIndex !== undefined) parts.push(`행: ${meta.rowIndex}`);
  if (meta.section) parts.push(`섹션: ${meta.section}`);
  return parts.join(' / ');
}

/** 출처 배열을 중복 제거된 문자열 배열로 변환 */
export function formatSources(sources: ChunkMetadata[]): string[] {
  return sources
    .map(formatSource)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}
