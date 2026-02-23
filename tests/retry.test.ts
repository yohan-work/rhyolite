import { withRetry } from '../src/utils/retry';

describe('withRetry', () => {
  it('성공 시 즉시 반환', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 'test');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 가능한 에러 시 재시도 후 성공', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, 'test', {
      maxRetries: 2,
      baseDelayMs: 10,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('재시도 불가능한 에러는 즉시 throw', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('invalid api key'));

    await expect(
      withRetry(fn, 'test', { maxRetries: 3, baseDelayMs: 10 }),
    ).rejects.toThrow('invalid api key');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('최대 재시도 초과 시 마지막 에러 throw', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('503 service unavailable'));

    await expect(
      withRetry(fn, 'test', { maxRetries: 2, baseDelayMs: 10 }),
    ).rejects.toThrow('503');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
