import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { DocumentChunk } from '../rag/types';
import { splitTextIntoChunks } from '../utils/chunk';

/** pptx 파일을 슬라이드별로 텍스트 추출 후 청크 분리 */
export async function parsePptx(filePath: string): Promise<DocumentChunk[]> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const fileName = path.basename(filePath);

  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => extractSlideNumber(a) - extractSlideNumber(b));

  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const slideFile of slideFiles) {
    const slideNum = extractSlideNumber(slideFile);
    const xml = await zip.file(slideFile)!.async('string');
    const text = extractTextFromSlideXml(xml);

    if (!text.trim()) continue;

    const textChunks = splitTextIntoChunks(text);
    for (const content of textChunks) {
      chunks.push({
        id: `${fileName}::slide_${slideNum}::chunk_${chunkIndex}`,
        content,
        metadata: {
          fileName,
          section: `슬라이드 ${slideNum}`,
          chunkIndex,
        },
        embedding: [],
      });
      chunkIndex++;
    }
  }

  return chunks;
}

function extractSlideNumber(filePath: string): number {
  const match = filePath.match(/slide(\d+)\.xml$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** XML에서 <a:t> 태그 내 텍스트를 추출하고 <a:p> 단위로 줄바꿈 */
function extractTextFromSlideXml(xml: string): string {
  const paragraphs: string[] = [];
  const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  const tRegex = /<a:t>([\s\S]*?)<\/a:t>/g;

  let pMatch;
  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[1];
    const texts: string[] = [];

    let tMatch;
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      texts.push(tMatch[1]);
    }

    const line = texts.join('').trim();
    if (line) paragraphs.push(line);
  }

  return paragraphs.join('\n');
}
