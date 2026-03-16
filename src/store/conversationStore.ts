import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface LastAnswerContext {
  question: string;
  rewrittenQuestion?: string;
  sources: string[];
}

interface ConversationEntry {
  messages: Message[];
  lastUpdated: number;
  lastAnswer?: LastAnswerContext;
}

const MAX_HISTORY_PER_THREAD = 10;
const TTL_MS = 30 * 60 * 1000; // 30분
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5분
const STORE_PATH = path.resolve(process.cwd(), 'data', 'conversations.json');

const store = new Map<string, ConversationEntry>();
let persistTimer: NodeJS.Timeout | null = null;

function loadStoreFromDisk(): void {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, ConversationEntry>;
    for (const [threadTs, entry] of Object.entries(parsed)) {
      if (!entry || !Array.isArray(entry.messages)) continue;
      store.set(threadTs, {
        messages: entry.messages,
        lastUpdated: typeof entry.lastUpdated === 'number' ? entry.lastUpdated : Date.now(),
        lastAnswer: entry.lastAnswer,
      });
    }
    logger.info(`대화 히스토리 로드 완료: ${store.size}개 스레드`);
  } catch (error) {
    logger.warn('대화 히스토리 로드 실패. 빈 스토어로 시작합니다.', error);
  }
}

function persistStoreToDisk(): void {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const asObject = Object.fromEntries(store.entries());
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(asObject, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (error) {
    logger.warn('대화 히스토리 저장 실패', error);
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistStoreToDisk();
  }, 250);
  persistTimer.unref();
}

loadStoreFromDisk();

export function getHistory(threadTs: string): Message[] {
  const entry = store.get(threadTs);
  if (!entry) return [];
  return entry.messages;
}

export function addMessage(threadTs: string, role: 'user' | 'assistant', content: string): void {
  let entry = store.get(threadTs);
  if (!entry) {
    entry = { messages: [], lastUpdated: Date.now() };
    store.set(threadTs, entry);
  }

  entry.messages.push({ role, content });
  entry.lastUpdated = Date.now();

  if (entry.messages.length > MAX_HISTORY_PER_THREAD * 2) {
    entry.messages = entry.messages.slice(-MAX_HISTORY_PER_THREAD * 2);
  }

  schedulePersist();
}

export function setLastAnswerContext(
  threadTs: string,
  context: LastAnswerContext,
): void {
  let entry = store.get(threadTs);
  if (!entry) {
    entry = { messages: [], lastUpdated: Date.now() };
    store.set(threadTs, entry);
  }
  entry.lastAnswer = context;
  entry.lastUpdated = Date.now();
  schedulePersist();
}

export function getLastAnswerContext(threadTs: string): LastAnswerContext | undefined {
  return store.get(threadTs)?.lastAnswer;
}

function cleanupExpired(): void {
  const now = Date.now();
  let deleted = 0;
  for (const [key, entry] of store) {
    if (now - entry.lastUpdated > TTL_MS) {
      store.delete(key);
      deleted += 1;
    }
  }
  if (deleted > 0) {
    schedulePersist();
  }
}

setInterval(cleanupExpired, CLEANUP_INTERVAL_MS).unref();
