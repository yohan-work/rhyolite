import path from 'path';
import XLSX from 'xlsx';
import { DocumentChunk } from '../rag/types';

/**
 * xlsx 파일을 시트별 + 행 단위로 파싱.
 * 첫 행을 헤더로 가정하여 각 행을 자연어 문장으로 변환.
 * 예: "상품명은 A상품이고, 환불가능기간은 7일이며, 예외사항은 개봉 시 환불 불가입니다."
 */
export function parseXlsx(filePath: string): DocumentChunk[] {
  const workbook = XLSX.readFile(filePath);
  const fileName = path.basename(filePath);
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length < 2) continue;

    const headers = (rows[0] as unknown[]).map((h) => String(h ?? '').trim());

    for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx] as unknown[];
      if (!row || row.every((cell) => cell === null || cell === undefined || cell === '')) {
        continue;
      }

      const sentence = rowToSentence(headers, row);
      if (!sentence) continue;

      chunks.push({
        id: `${fileName}::${sheetName}::row_${rowIdx}`,
        content: sentence,
        metadata: {
          fileName,
          sheetName,
          rowIndex: rowIdx,
          chunkIndex,
        },
        embedding: [],
      });
      chunkIndex++;
    }
  }

  return chunks;
}

/** 헤더와 행 데이터를 자연어 문장으로 변환 */
function rowToSentence(headers: string[], row: unknown[]): string {
  const parts: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const value = row[i];
    if (!header || value === null || value === undefined || value === '') continue;
    parts.push(`${header}은(는) ${String(value)}`);
  }

  if (parts.length === 0) return '';

  return parts.join(', ') + '입니다.';
}
