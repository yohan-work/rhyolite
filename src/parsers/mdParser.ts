import fs from 'fs';
import path from 'path';
import { DocumentChunk } from '../rag/types';
import { splitTextIntoChunks } from '../utils/chunk';

interface MdSection {
  heading: string;
  content: string;
}

/** 마크다운 파일을 제목(#) 기준으로 섹션 분리하여 파싱 */
export function parseMd(filePath: string): DocumentChunk[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const sections = splitByHeadings(raw);
  const chunks: DocumentChunk[] = [];

  let chunkIndex = 0;
  for (const section of sections) {
    const textChunks = splitTextIntoChunks(section.content);
    for (const text of textChunks) {
      chunks.push({
        id: `${fileName}::${section.heading || 'intro'}::chunk_${chunkIndex}`,
        content: text,
        metadata: {
          fileName,
          section: section.heading || undefined,
          chunkIndex,
        },
        embedding: [],
      });
      chunkIndex++;
    }
  }

  return chunks;
}

function splitByHeadings(markdown: string): MdSection[] {
  const lines = markdown.split('\n');
  const sections: MdSection[] = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[2].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0 || currentHeading) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections.filter((s) => s.content.length > 0);
}
