import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  slackBotToken: string;
  slackAppToken: string;
  geminiApiKey: string;
  useMockLlm: boolean;
  topK: number;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`환경변수 ${key}가 설정되지 않았습니다. .env 파일을 확인하세요.`);
  }
  return value;
}

export const config: AppConfig = {
  slackBotToken: requireEnv('SLACK_BOT_TOKEN'),
  slackAppToken: requireEnv('SLACK_APP_TOKEN'),
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  useMockLlm: process.env.USE_MOCK_LLM === 'true',
  topK: parseInt(process.env.TOP_K ?? '5', 10),
};
