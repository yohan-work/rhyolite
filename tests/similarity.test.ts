import { cosineSimilarity } from '../src/utils/similarity';

describe('cosineSimilarity', () => {
  it('동일한 벡터는 1을 반환', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
  });

  it('정반대 벡터는 -1을 반환', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('직교 벡터는 0을 반환', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('빈 벡터는 0을 반환', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('길이가 다른 벡터는 0을 반환', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it('영벡터는 0을 반환', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('스칼라 배수 벡터는 1을 반환', () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });
});
