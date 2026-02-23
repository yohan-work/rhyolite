import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  slackBotToken: string;
  slackAppToken: string;
  geminiApiKey: string;
  useMockLlm: boolean;
  topK: number;
  maxInputLength: number;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

function parsePositiveInt(raw: string | undefined, defaultValue: number, name: string): number {
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1) {
    throw new Error(`환경변수 ${name}은(는) 1 이상의 정수여야 합니다. 현재값: "${raw}"`);
  }
  return parsed;
}

const useMockLlm = process.env.USE_MOCK_LLM === 'true';
const geminiApiKey = process.env.GEMINI_API_KEY ?? '';

if (!useMockLlm && !geminiApiKey) {
  console.warn(
    '[WARN] GEMINI_API_KEY가 설정되지 않았습니다. Mock LLM 모드로 자동 전환합니다.',
  );
}

export const config: AppConfig = {
  slackBotToken: requireEnv('SLACK_BOT_TOKEN'),
  slackAppToken: requireEnv('SLACK_APP_TOKEN'),
  geminiApiKey,
  useMockLlm: useMockLlm || !geminiApiKey,
  topK: parsePositiveInt(process.env.TOP_K, 5, 'TOP_K'),
  maxInputLength: parsePositiveInt(process.env.MAX_INPUT_LENGTH, 2000, 'MAX_INPUT_LENGTH'),
};
