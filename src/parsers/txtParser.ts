import fs from 'fs';
import path from 'path';
import { DocumentChunk } from '../rag/types';
import { splitTextIntoChunks } from '../utils/chunk';

/** txt 파일을 문단/청크 단위로 파싱 */
export function parseTxt(filePath: string): DocumentChunk[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const chunks = splitTextIntoChunks(content);

  return chunks.map((text, index) => ({
    id: `${fileName}::chunk_${index}`,
    content: text,
    metadata: {
      fileName,
      chunkIndex: index,
    },
    embedding: [],
  }));
}
