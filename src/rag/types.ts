export interface ChunkMetadata {
  fileName: string;
  section?: string;
  sheetName?: string;
  rowIndex?: number;
  chunkIndex: number;
}

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: ChunkMetadata;
  embedding: number[];
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

export interface AnswerResult {
  answer: string;
  sources: ChunkMetadata[];
}

export interface IndexData {
  chunks: DocumentChunk[];
  createdAt: string;
  version: string;
  fileHashes?: Record<string, string>;
}
