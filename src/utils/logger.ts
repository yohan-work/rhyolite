type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function timestamp(): string {
  return new Date().toISOString();
}

function formatLog(level: LogLevel, message: string, data?: unknown): string {
  const base = `[${timestamp()}] [${level}] ${message}`;
  if (data instanceof Error) {
    return `${base}\n${data.stack || data.message}`;
  }
  return data ? `${base}\n${JSON.stringify(data, null, 2)}` : base;
}

export const logger = {
  info(message: string, data?: unknown): void {
    console.log(formatLog('INFO', message, data));
  },
  warn(message: string, data?: unknown): void {
    console.warn(formatLog('WARN', message, data));
  },
  error(message: string, data?: unknown): void {
    console.error(formatLog('ERROR', message, data));
  },
  debug(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatLog('DEBUG', message, data));
    }
  },

  /** 질문/답변/출처를 보기 좋게 출력 */
  logQA(question: string, answer: string, sources: string[]): void {
    console.log('\n' + '='.repeat(60));
    console.log(`질문: ${question}`);
    console.log('-'.repeat(60));
    console.log(`답변: ${answer}`);
    console.log('-'.repeat(60));
    console.log(`출처: ${sources.length > 0 ? sources.join(', ') : '없음'}`);
    console.log('='.repeat(60) + '\n');
  },
};
