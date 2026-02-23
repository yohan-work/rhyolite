import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { DocumentChunk } from '../rag/types';
import { splitTextIntoChunks } from '../utils/chunk';

/** docx 파일을 문단 단위로 추출하여 청크 생성 */
export async function parseDocx(filePath: string): Promise<DocumentChunk[]> {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  const fileName = path.basename(filePath);
  const chunks = splitTextIntoChunks(result.value);

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
