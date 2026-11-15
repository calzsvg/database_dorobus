// 수리 미션 행동 기록: 게임 화면(Repair.jsx)에서 일어난 일을 팀원 v3 테이블(002_repair.sql)과 대화 기록(011)에 남긴다.
// - 판정과 진행의 기준은 게임 화면이다(Gemini + 규칙 판정). 여기서는 다시 채점하거나 진행을 막지 않고 결과를 그대로 기록한다.
//   팀원의 database/v3/server/repair-service.mjs는 서버가 직접 채점·진행을 막는 참조 구현이라, 게임과 판정이 어긋나지 않도록 쓰지 않았다.
// - CELL 보상은 게임 상태(user_game_states)에서 주므로 wallets, reward_claims에는 쓰지 않는다(이중 지급 방지).
// - 기록 실패는 게임을 멈추지 않는다(화면은 응답을 기다리지 않는다).
import { randomUUID } from 'node:crypto'

const RULE_VERSION = 'game-voidJudge'
const VERDICTS = ['correct', 'partial', 'wrong', 'needs', 'unclear']
const text = (v, max) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null)
const uuid = (v) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null)
const keyList = (v) => (Array.isArray(v) ? [...new Set(v.filter((k) => typeof k === 'string' && k.length <= 50))].slice(0, 20) : [])

export function createRepairLog(tx) {
  const ok = (body = {}) => ({ status: 200, body })
  const bad = { status: 400, body: {} }
  const gone = { status: 404, body: {} }

  // 내 진행 중 도전(완료 전)을 잠그고 가져온다
  const lockRun = async (c, me, runId) =>
    (await c.query('SELECT * FROM dorobus.repair_runs WHERE id = $1 AND user_id = $2 FOR UPDATE', [runId, me.uid])).rows[0]
  const touch = (c, runId) => c.query('UPDATE dorobus.repair_runs SET state_revision = state_revision + 1, updated_at = now() WHERE id = $1', [runId])
  const toBench = (c, runId) =>
    c.query("UPDATE dorobus.repair_runs SET phase = 'bench', first_diagnosed_at = COALESCE(first_diagnosed_at, now()) WHERE id = $1 AND phase = 'investigation'", [runId])

  // 사건 시작(또는 이어 하기): 완료 전 도전이 있으면 그것을, 없으면 새로 만든다.
  // diagnosed: 이 기능 전에 이미 가설을 맞힌 상태로 이어 하는 경우 작업대 단계로 맞춘다.
  async function start(input, _ctx, me) {
    const caseId = text(input?.caseId, 40)
    if (!caseId || !/^[a-z]+$/.test(caseId)) return bad
    return tx(async (c) => {
      const d = (await c.query(`SELECT rv.content_id, rv.content_version_id, rv.case_role, v.public_body FROM dorobus.contents t
        JOIN dorobus.content_versions v ON v.content_id = t.id JOIN dorobus.repair_case_versions rv ON rv.content_version_id = v.id
        WHERE t.code = $1 AND t.is_active AND v.published_at IS NOT NULL AND v.published_at <= now() ORDER BY v.version DESC LIMIT 1`, ['repair:' + caseId])).rows[0]
      if (!d) return { ...gone, rollback: true }
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [me.uid])
      let run = (await c.query("SELECT * FROM dorobus.repair_runs WHERE user_id = $1 AND content_id = $2 AND phase <> 'completed'", [me.uid, d.content_id])).rows[0]
      if (!run && d.case_role !== 'onboarding') {
        // 003: 자동차 외 사건은 DB 운전면허(자동차 사건을 기록과 함께 끝내야 발급)가 있어야 도전 행을 만들 수 있다.
        // 이 기능 전에 게임에서만 면허를 받은 계정은 기록 없이 플레이한다(가짜 면허를 만들지 않는다).
        const licensed = (await c.query('SELECT 1 FROM dorobus.driving_licenses WHERE user_id = $1', [me.uid])).rows[0]
        if (!licensed) return { status: 409, body: { reason: 'license_required' }, rollback: true }
      }
      if (!run) {
        const settings = Object.fromEntries(Object.entries(d.public_body.controls ?? {}).map(([k, s]) => [k, s.initial]))
        run = (await c.query(`INSERT INTO dorobus.repair_runs (user_id, content_id, content_version_id, case_role, start_request_id, settings)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [me.uid, d.content_id, d.content_version_id, d.case_role, randomUUID(), settings])).rows[0]
      }
      if (input?.diagnosed === true) await toBench(c, run.id)
      return ok({ runId: run.id })
    })
  }

  // 단서 확인(관찰, NPC 질문, 점검, 기록). 처음 확인한 것만 순서대로 남는다.
  async function clue(input, _ctx, me) {
    const runId = uuid(input?.runId), clueKey = text(input?.clueKey, 50)
    if (!runId || !clueKey) return bad
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r || r.phase === 'completed') return { ...gone, rollback: true }
      const exists = (await c.query('SELECT 1 FROM dorobus.repair_clues WHERE content_version_id = $1 AND clue_key = $2', [r.content_version_id, clueKey])).rows[0]
      if (!exists) return { ...bad, rollback: true }
      const n = Number((await c.query('SELECT count(*) n FROM dorobus.repair_clue_discoveries WHERE run_id = $1', [runId])).rows[0].n)
      const inserted = await c.query(`INSERT INTO dorobus.repair_clue_discoveries (run_id, content_version_id, clue_key, discovery_order)
        VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [runId, r.content_version_id, clueKey, n + 1])
      if (inserted.rowCount) await touch(c, runId)
      return ok()
    })
  }

  // 수첩에 적은 내 생각 → 단서별 note_text
  async function notes(input, _ctx, me) {
    const runId = uuid(input?.runId), notes = input?.notes
    if (!runId || !notes || typeof notes !== 'object') return bad
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r) return { ...gone, rollback: true }
      for (const [key, value] of Object.entries(notes).slice(0, 20)) {
        const note = typeof value === 'string' ? value.trim().slice(0, 200) : ''
        await c.query('UPDATE dorobus.repair_clue_discoveries SET note_text = $3 WHERE run_id = $1 AND clue_key = $2', [runId, key, note || null])
      }
      return ok()
    })
  }

  // 도움: requested(막혔어), judge_feedback(가설 반복 실패 뒤 힌트), automatic(시험 반복 실패 뒤 힌트)
  async function hint(input, _ctx, me) {
    const runId = uuid(input?.runId), body = text(input?.text, 1000), kind = input?.kind
    if (!runId || !body || !['requested', 'automatic', 'judge_feedback'].includes(kind)) return bad
    const revealed = text(input?.revealedClue, 50)
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r || r.phase === 'completed') return { ...gone, rollback: true }
      const clueOk = revealed && (await c.query('SELECT 1 FROM dorobus.repair_clues WHERE content_version_id = $1 AND clue_key = $2', [r.content_version_id, revealed])).rows[0]
      const attempt = kind === 'judge_feedback'
        ? (await c.query('SELECT id FROM dorobus.learning_attempts WHERE repair_run_id = $1 ORDER BY attempt_no DESC LIMIT 1', [runId])).rows[0]?.id ?? null
        : null
      await c.query(`INSERT INTO dorobus.repair_hint_events (run_id, content_version_id, triggered_by_attempt_id, request_id, trigger_kind, phase, hint_text, rule_version, revealed_clue_key, issued_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`, [runId, r.content_version_id, attempt, randomUUID(), kind, r.phase, body, RULE_VERSION, clueOk ? revealed : null])
      await touch(c, runId)
      return ok()
    })
  }

  // 가설 제출: 게임이 내린 판정을 그대로 남긴다. 정답이면 작업대 단계로.
  async function attempt(input, _ctx, me) {
    const runId = uuid(input?.runId), answer = text(input?.text, 400), verdict = input?.verdict
    if (!runId || !answer || !VERDICTS.includes(verdict)) return bad
    const model = text(input?.model, 80)
    const feedback = typeof input?.feedback === 'string' ? input.feedback.slice(0, 1000) : null
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r || r.phase === 'completed') return { ...gone, rollback: true }
      const known = (await c.query('SELECT clue_key FROM dorobus.repair_clue_discoveries WHERE run_id = $1', [runId])).rows.map((x) => x.clue_key)
      const evidence = keyList(input?.evidence).filter((k) => known.includes(k))
      const seq = Number((await c.query('SELECT COALESCE(max(attempt_no), 0) + 1 n FROM dorobus.learning_attempts WHERE repair_run_id = $1', [runId])).rows[0].n)
      const a = (await c.query(`INSERT INTO dorobus.learning_attempts (user_id, content_version_id, scope, answer, is_correct, request_id, repair_run_id, repair_case_role,
          attempt_no, verdict, judge_source, rule_version, prompt_version, model_id, feedback_text)
        VALUES ($1, $2, 'activity', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [me.uid, r.content_version_id, { text: answer }, verdict === 'correct', randomUUID(), runId, r.case_role, seq, verdict,
        model ? 'hybrid' : 'rule', RULE_VERSION, model ? 'server/prompts' : null, model, feedback])).rows[0]
      for (const key of evidence)
        await c.query('INSERT INTO dorobus.repair_attempt_evidence (attempt_id, run_id, content_version_id, clue_key) VALUES ($1, $2, $3, $4)', [a.id, runId, r.content_version_id, key])
      // 해결한 문제: 퍼레이드는 화면이 알려 준 문제들, 나머지는 정답이면 사건의 모든 문제
      if (verdict === 'correct' || verdict === 'partial') {
        const all = (await c.query('SELECT problem_key FROM dorobus.repair_problems WHERE content_version_id = $1', [r.content_version_id])).rows.map((x) => x.problem_key)
        const solved = all.length > 1 ? keyList(input?.solved).filter((k) => all.includes(k)) : verdict === 'correct' ? all : []
        for (const key of solved)
          await c.query(`INSERT INTO dorobus.repair_problem_solutions (run_id, content_version_id, problem_key, attempt_id, accepted_verdict)
            VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [runId, r.content_version_id, key, a.id, verdict])
      }
      if (verdict === 'correct') await toBench(c, runId)
      await touch(c, runId)
      return ok({ attemptNo: seq })
    })
  }

  // 다시 현장으로(가설 고치기)
  async function rethink(input, _ctx, me) {
    const runId = uuid(input?.runId)
    if (!runId) return bad
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r || r.phase === 'completed') return { ...gone, rollback: true }
      await c.query("UPDATE dorobus.repair_runs SET phase = 'investigation' WHERE id = $1", [runId])
      await touch(c, runId)
      return ok()
    })
  }

  // 작업대 설정 바꾸기: 바뀐 설정에 기대던 통과 기록은 효력을 끝낸다
  async function adjust(input, _ctx, me) {
    const runId = uuid(input?.runId), settings = input?.settings
    if (!runId || !settings || typeof settings !== 'object') return bad
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r || r.phase === 'completed') return { ...gone, rollback: true }
      const v = (await c.query('SELECT public_body FROM dorobus.content_versions WHERE id = $1', [r.content_version_id])).rows[0]
      const controls = v.public_body.controls ?? {}
      const next = { ...r.settings }
      const changed = []
      for (const [key, value] of Object.entries(settings)) {
        if (!controls[key] || !Number.isInteger(value) || value < 0 || value >= controls[key].options.length) return { ...bad, rollback: true }
        if (next[key] !== value) { next[key] = value; changed.push(key) }
      }
      if (!changed.length) return ok()
      await toBench(c, runId)
      await c.query(`UPDATE dorobus.repair_trials a SET invalidated_at = now() FROM dorobus.repair_tests t
        WHERE a.run_id = $1 AND a.content_version_id = t.content_version_id AND a.test_key = t.test_key AND a.passed AND a.invalidated_at IS NULL
          AND (t.dependent_controls && $2::text[] OR cardinality(t.dependent_controls) = 0)`, [runId, changed])
      await c.query('UPDATE dorobus.repair_runs SET settings = $2, bench_revision = bench_revision + 1 WHERE id = $1', [runId, next])
      await touch(c, runId)
      return ok()
    })
  }

  // 작업대 시험: 화면의 시험 버튼 순서(index) = DB repair_tests의 display_order 순서
  async function trial(input, _ctx, me) {
    const runId = uuid(input?.runId), index = input?.index
    if (!runId || !Number.isInteger(index) || index < 0 || index > 10 || typeof input?.passed !== 'boolean') return bad
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r || r.phase === 'completed') return { ...gone, rollback: true }
      const t = (await c.query('SELECT test_key FROM dorobus.repair_tests WHERE content_version_id = $1 ORDER BY display_order OFFSET $2 LIMIT 1', [r.content_version_id, index])).rows[0]
      if (!t) return { ...bad, rollback: true }
      await toBench(c, runId)
      await c.query(`INSERT INTO dorobus.repair_trials (run_id, content_version_id, test_key, request_id, bench_revision, settings_snapshot, passed)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [runId, r.content_version_id, t.test_key, randomUUID(), r.bench_revision, r.settings, input.passed])
      await touch(c, runId)
      return ok()
    })
  }

  // 수리 완료: 도전 완료, 첫 완료 기록, 자동차 사건이면 운전면허(기록이 다 갖춰졌을 때만)
  async function complete(input, _ctx, me) {
    const runId = uuid(input?.runId)
    if (!runId) return bad
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r) return { ...gone, rollback: true }
      if (r.phase === 'completed') return ok({ already: true })
      await c.query(`UPDATE dorobus.repair_runs SET phase = 'completed', first_diagnosed_at = COALESCE(first_diagnosed_at, now()),
        completed_at = now(), completion_request_id = $2, state_revision = state_revision + 1, updated_at = now() WHERE id = $1`, [runId, randomUUID()])
      const first = await c.query(`INSERT INTO dorobus.content_completions (user_id, content_id, completed_version_id, completed_at, source_repair_run_id, content_kind)
        VALUES ($1, $2, $3, now(), $4, 'repair_case') ON CONFLICT (user_id, content_id) DO NOTHING`, [me.uid, r.content_id, r.content_version_id, runId])
      let license = false
      if (r.case_role === 'onboarding') {
        await c.query('SAVEPOINT license')
        try {
          await c.query('SELECT dorobus.issue_driving_license($1, $2)', [me.uid, runId])
          license = true
        } catch {
          await c.query('ROLLBACK TO SAVEPOINT license') // 중간 기록이 빠졌으면 면허 기록만 건너뛴다(게임 면허는 그대로)
        }
      }
      return ok({ firstCompletion: first.rowCount > 0, license })
    })
  }

  // 대화창: 아이 질문(typed | button)과 보이드 답
  async function message(input, _ctx, me) {
    const runId = uuid(input?.runId)
    const items = Array.isArray(input?.items) ? input.items.slice(0, 4) : []
    if (!runId || !items.length) return bad
    for (const m of items) {
      if (!['child', 'void'].includes(m?.speaker) || !text(m?.text, 1000)) return bad
      if (m.speaker === 'child' && !['typed', 'button'].includes(m.mode)) return bad
    }
    return tx(async (c) => {
      const r = await lockRun(c, me, runId)
      if (!r || r.phase === 'completed') return { ...gone, rollback: true }
      let seq = Number((await c.query('SELECT COALESCE(max(seq), 0) n FROM dorobus.repair_messages WHERE run_id = $1', [runId])).rows[0].n)
      for (const m of items)
        await c.query(`INSERT INTO dorobus.repair_messages (run_id, content_version_id, seq, speaker, input_mode, is_hint, body, phase)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [runId, r.content_version_id, ++seq, m.speaker, m.speaker === 'child' ? m.mode : null, m.hint === true, m.text.trim(), r.phase])
      return ok()
    })
  }

  return { repairStart: start, repairClue: clue, repairNotes: notes, repairHint: hint, repairAttempt: attempt, repairRethink: rethink,
    repairAdjust: adjust, repairTrial: trial, repairComplete: complete, repairMessage: message }
}

export const REPAIR_ROUTES = {
  '/api/repair/start': 'repairStart', '/api/repair/clue': 'repairClue', '/api/repair/notes': 'repairNotes', '/api/repair/hint': 'repairHint',
  '/api/repair/attempt': 'repairAttempt', '/api/repair/rethink': 'repairRethink', '/api/repair/adjust': 'repairAdjust',
  '/api/repair/trial': 'repairTrial', '/api/repair/complete': 'repairComplete', '/api/repair/message': 'repairMessage',
}
