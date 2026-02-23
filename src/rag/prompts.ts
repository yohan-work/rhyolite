export const SYSTEM_PROMPT = `당신은 기업 내부 문서 기반 질의응답 챗봇 "YOBOT"입니다.

규칙:
1. 제공된 context 문서 내용만을 근거로 답변하세요.
2. context에 없는 내용은 절대 추측하거나 만들어내지 마세요.
3. 근거가 부족하면 반드시 "등록된 자료에서 확인되지 않습니다."라고 답변하세요.
4. 답변 마지막에 반드시 출처 목록(파일명, 시트명, 행번호, 섹션 등)을 표시하세요.
5. 답변은 명확하고 간결하게 작성하세요.
6. 한국어로 답변하세요.
7. 이전 대화 기록이 제공되면 맥락을 이해하되, 여전히 context 문서만을 근거로 답변하세요.`;

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildUserPrompt(
  context: string,
  question: string,
  history?: HistoryMessage[],
): string {
  let prompt = '';

  if (history && history.length > 0) {
    prompt += '이전 대화:\n';
    for (const msg of history) {
      const label = msg.role === 'user' ? '사용자' : 'YOBOT';
      prompt += `${label}: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  if (!context) {
    return prompt + `질문: ${question}\n\n참고할 문서가 없습니다. "등록된 자료에서 확인되지 않습니다."라고 답변해주세요.`;
  }

  return prompt + `아래 문서를 참고하여 질문에 답변해주세요.

---
${context}
---

질문: ${question}

답변 형식:
1. 질문에 대한 답변
2. 출처 목록 (답변에 사용한 문서의 파일명/시트명/행번호/섹션)`;
}
