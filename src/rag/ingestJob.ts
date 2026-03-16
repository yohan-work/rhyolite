import { ingestDocuments, IngestProgressEvent, IngestSummary } from './ingest';
import { logger } from '../utils/logger';

export interface IngestJobStatus {
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  progress?: IngestProgressEvent;
  summary?: IngestSummary;
}

const state: IngestJobStatus = {
  running: false,
};

export function getIngestJobStatus(): IngestJobStatus {
  return { ...state };
}

export function startIngestJob(forceAll = false): { started: boolean; message: string } {
  if (state.running) {
    return {
      started: false,
      message: '이미 인덱싱 작업이 진행 중입니다. `/yobot-admin ingest status`로 상태를 확인하세요.',
    };
  }

  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = undefined;
  state.lastError = undefined;
  state.summary = undefined;
  state.progress = {
    phase: 'start',
    message: forceAll ? '전체 재인덱싱 요청 수신' : '증분 인덱싱 요청 수신',
  };

  ingestDocuments(forceAll, {
    onProgress: (event) => {
      state.progress = event;
    },
  })
    .then((summary) => {
      state.summary = summary;
      state.finishedAt = new Date().toISOString();
      logger.info('백그라운드 인덱싱 작업 완료', summary);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      state.lastError = message;
      state.finishedAt = new Date().toISOString();
      logger.error('백그라운드 인덱싱 작업 실패', error);
    })
    .finally(() => {
      state.running = false;
    });

  return {
    started: true,
    message: forceAll
      ? '전체 재인덱싱 작업을 시작했습니다.'
      : '증분 인덱싱 작업을 시작했습니다.',
  };
}
