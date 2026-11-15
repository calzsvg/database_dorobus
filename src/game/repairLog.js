// 수리 미션 행동을 서버 DB에 기록한다(server/repair-log.mjs → 팀원 v3 테이블).
// - 게임은 응답을 기다리지 않는다. 기록이 실패해도 플레이는 그대로 이어진다.
// - 순서가 중요하므로(단서를 본 뒤에 그 단서를 근거로 가설) 한 사건의 요청은 차례대로 보낸다.
// - 서버에 기록 API가 없으면(DB 없는 개발 서버, 정적 사이트) 조용히 끈다.
const post = (path, body) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body), keepalive: true })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
    .catch(() => ({ status: 0, body: {} }))

const NOOP = new Proxy({}, { get: () => () => {} })

export function createRepairLog(caseId, { diagnosed = false, enabled = true } = {}) {
  if (!enabled) return NOOP
  let runId = null
  let off = false
  let chain = post('/api/repair/start', { caseId, diagnosed }).then((r) => {
    if (r.status === 200) runId = r.body.runId
    else off = true
  })
  const send = (path, body) => {
    chain = chain.then(() => (off || !runId ? null : post(path, { runId, ...body })))
  }
  return {
    clue: (clueKey) => send('/api/repair/clue', { clueKey }),
    notes: (notes) => send('/api/repair/notes', { notes }),
    hint: (kind, text, revealedClue = null) => send('/api/repair/hint', { kind, text, revealedClue }),
    attempt: ({ text, evidence, verdict, model, feedback, solved }) => send('/api/repair/attempt', { text, evidence, verdict, model, feedback, solved }),
    rethink: () => send('/api/repair/rethink', {}),
    adjust: (settings) => send('/api/repair/adjust', { settings }),
    trial: (index, passed) => send('/api/repair/trial', { index, passed }),
    complete: () => send('/api/repair/complete', {}),
    // 대화창: 아이 질문(typed: 직접 입력, button: 빠른 버튼)과 보이드 답
    chat: (childText, mode, voidText, hint = false) =>
      send('/api/repair/message', { items: [{ speaker: 'child', mode, text: childText }, ...(voidText ? [{ speaker: 'void', text: voidText, hint }] : [])] }),
  }
}
