import { App } from '@slack/bolt';
import { Block, KnownBlock } from '@slack/types';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { formatSources } from '../utils/format';
import { retrieveHybrid } from '../rag/retrieve';
import { generateAnswer } from '../rag/answer';
import {
  getHistory,
  addMessage,
  getLastAnswerContext,
  setLastAnswerContext,
} from '../store/conversationStore';
import { rewriteQueryWithHistory } from '../rag/queryRewrite';
import { getIngestJobStatus, startIngestJob } from '../rag/ingestJob';

/** 멘션 텍스트에서 봇 ID 태그를 제거하고 순수 질문만 추출 */
function extractQuestion(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

interface ActionPayload {
  threadKey: string;
  question?: string;
  sources?: string[];
}

interface ActionBodyLike {
  container?: {
    thread_ts?: string;
    message_ts?: string;
  };
  message?: {
    thread_ts?: string;
    ts?: string;
  };
}

function isSlackAdmin(userId: string): boolean {
  return config.slackAdminUserIds.includes(userId);
}

function encodeActionPayload(payload: ActionPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

function decodeActionPayload(raw?: string): ActionPayload {
  if (!raw) return { threadKey: '' };
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as ActionPayload;
  } catch {
    return { threadKey: '' };
  }
}

function extractActionThreadTs(body: unknown): string | undefined {
  const candidate = body as ActionBodyLike;
  return (
    candidate.container?.thread_ts ||
    candidate.container?.message_ts ||
    candidate.message?.thread_ts ||
    candidate.message?.ts
  );
}

function buildAnswerBlocks(
  answer: string,
  sources: string[],
  threadKey: string,
  question: string,
): (KnownBlock | Block)[] {
  const sourcePreview = sources.length > 0 ? sources.slice(0, 5).map((s) => `- ${s}`).join('\n') : '- 없음';
  const payload = encodeActionPayload({ threadKey, question, sources });
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: answer,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*출처*\n${sourcePreview}`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '답변 다시 생성' },
          action_id: 'yobot_regenerate',
          value: payload,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '근거만 보기' },
          action_id: 'yobot_show_sources',
          value: payload,
        },
      ],
    },
  ];
}

function validateQuestion(question: string): string | null {
  if (!question) {
    return '질문을 입력해주세요!';
  }
  if (question.length > config.maxInputLength) {
    return `질문이 너무 깁니다. ${config.maxInputLength}자 이내로 입력해주세요.`;
  }
  return null;
}

async function runQaFlow(threadKey: string, question: string): Promise<{
  answer: string;
  sources: string[];
}> {
  const history = getHistory(threadKey);
  const rewrittenQuestion = await rewriteQueryWithHistory(question, history);
  addMessage(threadKey, 'user', question);

  const searchResults = await retrieveHybrid(rewrittenQuestion);
  const { answer, sources } = await generateAnswer(question, searchResults, history);
  const formattedSources = formatSources(sources);

  addMessage(threadKey, 'assistant', answer);
  setLastAnswerContext(threadKey, {
    question,
    rewrittenQuestion,
    sources: formattedSources,
  });
  logger.logQA(question, answer, formattedSources);
  return { answer, sources: formattedSources };
}

function formatAdminStatus(): string {
  const status = getIngestJobStatus();
  const progressText = status.progress
    ? `phase=${status.progress.phase}, ${status.progress.message}, ${status.progress.processed ?? 0}/${status.progress.total ?? 0}`
    : '진행 정보 없음';
  const summaryText = status.summary
    ? `files=${status.summary.totalFiles}, changed=${status.summary.changedFiles}, deleted=${status.summary.deletedFiles}, entities=${status.summary.graphStats.entityCount}, relationships=${status.summary.graphStats.relationshipCount}`
    : '요약 정보 없음';
  return [
    '*인덱싱 상태*',
    `- running: ${status.running}`,
    `- startedAt: ${status.startedAt ?? '-'}`,
    `- finishedAt: ${status.finishedAt ?? '-'}`,
    `- progress: ${progressText}`,
    `- summary: ${summaryText}`,
    `- lastError: ${status.lastError ?? '-'}`,
  ].join('\n');
}

export function registerHandlers(app: App): void {
  app.event('app_mention', async ({ event, say }) => {
    try {
      const question = extractQuestion(event.text ?? '');
      const threadTs = event.thread_ts ?? event.ts;
      logger.info(`멘션 수신 - 사용자: ${event.user}, 스레드: ${threadTs}, 질문: "${question}"`);

      const validationError = validateQuestion(question);
      if (validationError) {
        await say({ text: validationError, thread_ts: threadTs });
        return;
      }

      const { answer, sources } = await runQaFlow(threadTs, question);
      await say({
        text: answer,
        thread_ts: threadTs,
        blocks: buildAnswerBlocks(answer, sources, threadTs, question),
      });
    } catch (error) {
      logger.error('app_mention 처리 중 오류 발생', error);
      const threadTs = event.thread_ts ?? event.ts;
      try {
        await say({
          text: '죄송합니다. 요청 처리 중 오류가 발생했습니다.',
          thread_ts: threadTs,
        });
      } catch (replyError) {
        logger.error('에러 응답 전송 실패', replyError);
      }
    }
  });

  app.command('/yobot', async ({ command, ack, respond }) => {
    await ack();
    const question = (command.text ?? '').trim();
    const threadKey = `cmd:${command.channel_id}:${command.user_id}`;
    const validationError = validateQuestion(question);
    if (validationError) {
      await respond({ text: validationError, response_type: 'ephemeral' });
      return;
    }

    try {
      const { answer, sources } = await runQaFlow(threadKey, question);
      await respond({
        text: answer,
        response_type: 'in_channel',
        blocks: buildAnswerBlocks(answer, sources, threadKey, question),
      });
    } catch (error) {
      logger.error('/yobot 처리 중 오류 발생', error);
      await respond({
        text: '죄송합니다. 요청 처리 중 오류가 발생했습니다.',
        response_type: 'ephemeral',
      });
    }
  });

  app.command('/yobot-admin', async ({ command, ack, respond }) => {
    await ack();
    if (!isSlackAdmin(command.user_id)) {
      await respond({
        text: '권한이 없습니다. 관리자에게 문의하세요.',
        response_type: 'ephemeral',
      });
      return;
    }

    const args = (command.text ?? '').trim().split(/\s+/).filter(Boolean);
    if (args.length === 0) {
      await respond({
        text: '사용법: `/yobot-admin ingest start [--force]` 또는 `/yobot-admin ingest status`',
        response_type: 'ephemeral',
      });
      return;
    }

    const [scope, action, option] = args;
    if (scope !== 'ingest') {
      await respond({ text: '지원하지 않는 명령입니다. ingest만 지원합니다.', response_type: 'ephemeral' });
      return;
    }

    if (action === 'start') {
      const forceAll = option === '--force';
      const result = startIngestJob(forceAll);
      await respond({
        text: result.message,
        response_type: 'ephemeral',
      });
      return;
    }

    if (action === 'status') {
      await respond({
        text: formatAdminStatus(),
        response_type: 'ephemeral',
      });
      return;
    }

    await respond({
      text: '사용법: `/yobot-admin ingest start [--force]` 또는 `/yobot-admin ingest status`',
      response_type: 'ephemeral',
    });
  });

  app.action('yobot_regenerate', async ({ ack, body, client, action }) => {
    await ack();
    const payload = decodeActionPayload('value' in action ? action.value : undefined);
    const threadKey = payload.threadKey;
    const originalQuestion = payload.question || getLastAnswerContext(threadKey)?.question;
    const channelId = body.channel?.id;
    const threadTs = extractActionThreadTs(body);
    if (!threadKey || !originalQuestion || !channelId || !threadTs) {
      return;
    }
    try {
      const { answer, sources } = await runQaFlow(threadKey, originalQuestion);
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: answer,
        blocks: buildAnswerBlocks(answer, sources, threadKey, originalQuestion),
      });
    } catch (error) {
      logger.error('답변 재생성 액션 처리 실패', error);
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: '답변 재생성 중 오류가 발생했습니다.',
      });
    }
  });

  app.action('yobot_show_sources', async ({ ack, body, client, action }) => {
    await ack();
    const payload = decodeActionPayload('value' in action ? action.value : undefined);
    const threadKey = payload.threadKey;
    const channelId = body.channel?.id;
    const threadTs = extractActionThreadTs(body);
    if (!channelId || !threadTs) {
      return;
    }
    const sourceLines = payload.sources && payload.sources.length > 0
      ? payload.sources
      : getLastAnswerContext(threadKey)?.sources || [];
    const text = sourceLines.length > 0 ? `*근거 목록*\n${sourceLines.map((s) => `- ${s}`).join('\n')}` : '근거 정보가 없습니다.';
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text,
    });
  });
}
