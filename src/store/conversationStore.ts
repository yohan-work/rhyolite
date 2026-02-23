interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationEntry {
  messages: Message[];
  lastUpdated: number;
}

const MAX_HISTORY_PER_THREAD = 10;
const TTL_MS = 30 * 60 * 1000; // 30분
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5분

const store = new Map<string, ConversationEntry>();

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
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.lastUpdated > TTL_MS) {
      store.delete(key);
    }
  }
}

setInterval(cleanupExpired, CLEANUP_INTERVAL_MS).unref();
