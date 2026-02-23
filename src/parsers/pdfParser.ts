import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import { DocumentChunk } from '../rag/types';
import { splitTextIntoChunks } from '../utils/chunk';

/** PDF 파일을 텍스트 추출 후 청크 단위로 분리 */
export async function parsePdf(filePath: string): Promise<DocumentChunk[]> {
  const buffer = fs.readFileSync(filePath);
  const pdf = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await pdf.getText();
  const fileName = path.basename(filePath);
  const chunks = splitTextIntoChunks(result.text);

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
