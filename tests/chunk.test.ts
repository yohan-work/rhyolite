import { splitTextIntoChunks } from '../src/utils/chunk';

describe('splitTextIntoChunks', () => {
  it('빈 텍스트는 빈 배열 반환', () => {
    expect(splitTextIntoChunks('')).toEqual([]);
    expect(splitTextIntoChunks('   ')).toEqual([]);
  });

  it('chunkSize 이하 텍스트는 단일 청크 반환', () => {
    const text = 'Hello world';
    const result = splitTextIntoChunks(text, { chunkSize: 500 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(text);
  });

  it('문단 경계에서 분리', () => {
    const text = 'A'.repeat(300) + '\n\n' + 'B'.repeat(300);
    const result = splitTextIntoChunks(text, { chunkSize: 400, overlap: 50 });
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toContain('A');
  });

  it('단일 문단이 chunkSize 초과 시 강제 분할', () => {
    const text = 'X'.repeat(1200);
    const result = splitTextIntoChunks(text, { chunkSize: 500, overlap: 50 });
    expect(result.length).toBeGreaterThanOrEqual(2);
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(500);
    });
  });

  it('모든 청크가 비어있지 않음', () => {
    const text = 'Line 1\n\nLine 2\n\nLine 3\n\nLine 4';
    const result = splitTextIntoChunks(text, { chunkSize: 20, overlap: 5 });
    result.forEach((chunk) => {
      expect(chunk.trim().length).toBeGreaterThan(0);
    });
  });
});
