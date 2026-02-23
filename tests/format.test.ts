import { formatSource, formatSources } from '../src/utils/format';

describe('formatSource', () => {
  it('파일명만 있는 경우', () => {
    expect(formatSource({ fileName: 'test.txt' })).toBe('test.txt');
  });

  it('시트명 포함', () => {
    expect(formatSource({ fileName: 'data.xlsx', sheetName: 'Sheet1' })).toBe(
      'data.xlsx / 시트: Sheet1',
    );
  });

  it('모든 메타데이터 포함', () => {
    const result = formatSource({
      fileName: 'data.xlsx',
      sheetName: 'Sheet1',
      rowIndex: 5,
      section: '개요',
    });
    expect(result).toBe('data.xlsx / 시트: Sheet1 / 행: 5 / 섹션: 개요');
  });

  it('rowIndex가 0이어도 표시', () => {
    const result = formatSource({ fileName: 'test.xlsx', rowIndex: 0 });
    expect(result).toContain('행: 0');
  });
});

describe('formatSources', () => {
  it('중복 출처 제거', () => {
    const sources = [
      { fileName: 'a.txt', chunkIndex: 0 },
      { fileName: 'a.txt', chunkIndex: 1 },
      { fileName: 'b.txt', chunkIndex: 0 },
    ];
    const result = formatSources(sources);
    expect(result).toEqual(['a.txt', 'b.txt']);
  });

  it('빈 배열 입력', () => {
    expect(formatSources([])).toEqual([]);
  });
});
