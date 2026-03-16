import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  slackBotToken: string;
  slackAppToken: string;
  slackAdminUserIds: string[];
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaEmbeddingModel: string;
  useMockLlm: boolean;
  topK: number;
  graphMaxHops: number;
  rerankEntityWeight: number;
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

function parseWeight(raw: string | undefined, defaultValue: number, name: string): number {
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`환경변수 ${name}은(는) 0 이상 1 이하의 숫자여야 합니다. 현재값: "${raw}"`);
  }
  return parsed;
}

const useMockLlm = process.env.USE_MOCK_LLM === 'true';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const ollamaModel = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b';
const ollamaEmbeddingModel = process.env.OLLAMA_EMBEDDING_MODEL ?? 'embeddinggemma:latest';
const slackAdminUserIds = (process.env.SLACK_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

export const config: AppConfig = {
  slackBotToken: requireEnv('SLACK_BOT_TOKEN'),
  slackAppToken: requireEnv('SLACK_APP_TOKEN'),
  slackAdminUserIds,
  ollamaBaseUrl,
  ollamaModel,
  ollamaEmbeddingModel,
  useMockLlm,
  topK: parsePositiveInt(process.env.TOP_K, 5, 'TOP_K'),
  graphMaxHops: parsePositiveInt(process.env.GRAPH_MAX_HOPS, 2, 'GRAPH_MAX_HOPS'),
  rerankEntityWeight: parseWeight(process.env.RERANK_ENTITY_WEIGHT, 0.25, 'RERANK_ENTITY_WEIGHT'),
  maxInputLength: parsePositiveInt(process.env.MAX_INPUT_LENGTH, 2000, 'MAX_INPUT_LENGTH'),
};
