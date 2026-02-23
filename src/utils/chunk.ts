const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_OVERLAP = 50;

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
}

/** 텍스트를 일정 크기의 청크로 분리 (문단 경계를 우선 존중) */
export function splitTextIntoChunks(
  text: string,
  options: ChunkOptions = {},
): string[] {
  const { chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP } = options;

  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.length <= chunkSize) {
    return [trimmed];
  }

  const paragraphs = trimmed.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    const cleanPara = para.trim();
    if (!cleanPara) continue;

    if (buffer.length + cleanPara.length + 1 <= chunkSize) {
      buffer = buffer ? `${buffer}\n\n${cleanPara}` : cleanPara;
    } else {
      if (buffer) {
        chunks.push(buffer);
        const overlapText = buffer.slice(-overlap);
        buffer = overlapText + '\n\n' + cleanPara;
      } else {
        // 단일 문단이 chunkSize를 초과하는 경우 강제 분할
        for (let i = 0; i < cleanPara.length; i += chunkSize - overlap) {
          chunks.push(cleanPara.slice(i, i + chunkSize));
        }
        buffer = '';
      }

      if (buffer.length > chunkSize) {
        chunks.push(buffer.slice(0, chunkSize));
        buffer = buffer.slice(chunkSize - overlap);
      }
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  return chunks;
}
