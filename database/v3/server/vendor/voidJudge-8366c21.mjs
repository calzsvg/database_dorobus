// 아이가 적은 가설을 기준 문서의 정답 판정(정답, 부분 정답, 오답)에 맞춰 판단한다.
// 의미 판단은 Gemini(데모 모드)가 할 수 있지만, 근거 확인과 대사는 항상 여기서 정한다.
// 결과: { verdict: 'correct' | 'partial' | 'wrong' | 'needs' | 'unclear', text, solved?: [문제 id] }

const all = (patterns, text) => patterns.every(pattern => pattern.test(text))
const any = (patterns, text) => patterns.some(pattern => pattern.test(text))
const seenAny = (ids, known) => ids.some(id => known.includes(id))

// 근거가 될 단서를 직접 확인했는지: needs의 묶음마다 하나 이상
export function missingEvidence(item, known) {
  return (item.judge?.needs ?? []).find(group => !seenAny(group, known)) ?? null
}

function clueHint(item, ids) {
  const clue = item.clueList.find(candidate => candidate.id === ids[0])
  if (!clue) return '아직 직접 확인하지 않은 게 있어.'
  return clue.npc
    ? `${clue.npc}에게 직접 물어보면 확인할 수 있을 거야. ‘질문’에 있어.`
    : `‘${clue.type}’에서 직접 확인해 보자.`
}

function wrongReply(item, text, known) {
  const handler = item.judge?.wrong?.find(candidate => candidate.re.test(text))
  if (!handler) return null
  return { verdict: 'wrong', text: known.includes(handler.clue) ? handler.refute : handler.ask }
}

// 퍼레이드: 네 문제를 따로 판정한다. 이미 설명한 문제(solvedBefore)는 다시 요구하지 않는다
function judgeParade(item, text, known, solvedBefore = [], modelExplained = []) {
  const solved = new Set(solvedBefore)
  const unproven = []
  for (const problem of item.problems) {
    if (solved.has(problem.id) || !(all(problem.correct, text) || modelExplained.includes(problem.id))) continue
    if (problem.needs.some(id => known.includes(id))) solved.add(problem.id)
    else unproven.push(problem)
  }
  const left = item.problems.filter(problem => !solved.has(problem.id))
  if (!left.length) return { verdict: 'correct', text: item.lines.correct, solved: [...solved] }
  const gained = [...solved].filter(id => !solvedBefore.includes(id))
  if (gained.length || unproven.length) {
    const names = gained.map(id => item.problems.find(problem => problem.id === id).name)
    const head = names.length ? `좋아! ${names.join(', ')} 원인은 알아냈어. ` : ''
    const proof = unproven.length ? `${unproven[0].name}은 아직 직접 확인하지 않았어. 현장에서 먼저 살펴보자. ` : ''
    return { verdict: 'partial', text: `${head}${proof}남은 문제: ${left.map(problem => problem.name).join(', ')}. ${left[0].hint}`, solved: [...solved] }
  }
  return wrongReply(item, text, known) ?? { verdict: 'unclear', text: `지금 생긴 문제는 하나가 아니야. ${left[0].name}부터 무엇 때문인지 적어 볼래?`, solved: [...solved] }
}

export function judgeLocally(item, rawText, known, solvedBefore) {
  const text = rawText.replace(/\s+/g, ' ').trim()
  if (item.problems) return judgeParade(item, text, known, solvedBefore)
  const judge = item.judge
  if (all(judge.correct, text)) {
    const missing = missingEvidence(item, known)
    // 근거 없이 맞힌 추측은 정답으로 인정하지 않는다
    if (missing) return { verdict: 'needs', text: `그럴 수도 있겠다! 그런데 아직 직접 확인하지 않았어. ${clueHint(item, missing)}` }
    return { verdict: 'correct', text: item.lines.correct }
  }
  const wrongAnswer = wrongReply(item, text, known)
  if (wrongAnswer) return wrongAnswer
  if (any(judge.partial, text)) return { verdict: 'partial', text: judge.followUp }
  return { verdict: 'unclear', text: '음, 무엇이 무엇 때문에 그렇게 됐는지 한 문장으로 다시 적어 볼래? 수첩에 모은 관찰을 이어 보면 좋아.' }
}

// Gemini 판정을 받으면: 의미 판단은 Gemini를 따르되, 근거 단서 확인(needs)과 작업대 전환 대사는 게임 규칙을 따른다.
// model = { verdict, reply, explained } 또는 null(키 없음, 오프라인 → 로컬 규칙만)
export function judgeWithModel(item, text, known, model, solvedBefore) {
  if (item.problems) {
    return judgeParade(item, text.replace(/\s+/g, ' ').trim(), known, solvedBefore, model?.explained ?? [])
  }
  const local = judgeLocally(item, text, known, solvedBefore)
  if (!model) return local
  const correct = model.verdict === 'correct' || (local.verdict === 'correct' && model.verdict !== 'wrong')
  if (correct) {
    const missing = missingEvidence(item, known)
    if (missing) return { verdict: 'needs', text: `그럴 수도 있겠다! 그런데 아직 직접 확인하지 않았어. ${clueHint(item, missing)}` }
    return { verdict: 'correct', text: item.lines.correct }
  }
  const verdict = local.verdict === 'needs' ? 'partial' : model.verdict
  return { verdict, text: model.reply || local.text }
}
