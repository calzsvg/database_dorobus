import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { CAR_CASE, countFestivalRepairs, hasRemoteRepairLicense, isTarget, ownedParts, PARADE, REPAIR_CASES, WORKSHOP, trialResult } from '../game/repairCases.js'
import { voidReply } from '../game/voidRepair.js'
import { judgeWithModel } from '../game/voidJudge.js'
import RepairScene from './RepairScene.jsx'
import FixMission from '../missions/FixMission.jsx'
import { BREAKABLE, pendingFaults } from '../game/daily.js'
import './repair.css'

const ART = `${import.meta.env.BASE_URL}repair/openmoji/`
const CATEGORY = ['관찰', '질문', '점검', '기록']
const STEPS = ['살펴보기', '가설 시험', '복구 완료']
const MIN_OBSERVATIONS = 2 // 가설을 세우기 전에 적어도 이만큼은 직접 살펴본다
const MIN_HYPOTHESIS = 8 // 가설은 한 문장 이상
const COUNTDOWN = 10 * 60 // 퍼레이드 개막 카운트다운(연출용, 끝나도 실패 없음)
const emptyRecords = Object.freeze({})
const image = (id) => `${ART}${id}.svg`
// Gemini 보이드: 개발 서버(vite 플러그인)와 미니PC(server/void-server.mjs)가 /api/void-* 를 제공한다.
// API가 없는 곳(정적 호스팅)이나 실패하면 게임 규칙만으로 답한다
const aiVoice = true
const ANIMATED = ['run', 'repeat', 'kids', 'ledoff', 'floor']
const fieldPrompts = {
  food: '어떤 재료부터 떨어지는지 같이 보자.',
  carousel: '빈 상태로 한 바퀴 돌려 보자. 멈춘 자리를 기억해 둬.',
  safari: '투어 차량을 출발시켜 보자. 평지에선 잘 가는지도 봐.',
  viking: '운행 모드가 두 개야. 하나씩 돌려 보고 어디서 덜컹하는지 봐.',
  coaster: '아침과 저녁 운행을 비교해 보자. 마지막 언덕에서 뭐가 다를까?',
  sign: '낮 화면부터 보고, 밤까지 지켜보자. 어디가 달라질까?',
  parade: '문제가 하나가 아닌 것 같아. 차량, 풍선, 조명, 길을 하나씩 살펴보자.',
  delivery: '상자를 하나 올려 봐. 어느 롤러에서 멈추는지 보자.',
  car: '먼저 똑바로 달려 보자. 차가 어디로 가는지 잘 봐.',
}

// NPC 얼굴 대신 이름 첫 글자 배지
const NpcBadge = ({ name }) => <span className="repair-npc-badge" aria-hidden="true">{name.slice(0, 1)}</span>
// 말하는 인물 그림: 이야기 인물은 초상화, 나머지 NPC는 OpenMoji 직업 인물(CC BY-SA 4.0)
const PORTRAIT = (file) => `${import.meta.env.BASE_URL}portraits/${file}`
const SPEAKER_ART = {
  보이드: PORTRAIT('void.svg'), 리코: PORTRAIT('riko.png'), 자일로: PORTRAIT('xylo.png'), 제로: PORTRAIT('zero.png'),
  '사파리 가이드': image('1F481'), 사육사: image('1F9D1-200D-1F33E'), '푸드코트 점장': image('1F9D1-200D-1F373'),
  손님: image('1F9D1'), 아르바이트생: image('1F9D1-200D-1F393'), '회전목마 운영자': image('1F9D1-200D-1F527'),
  '청소 담당': image('1F477'), '회전 바이킹 운영자': image('1F9D1-200D-1F527'), '장식 담당': image('1F9D1-200D-1F3A8'),
  '장식 담당 직원': image('1F9D1-200D-1F3A8'), '운영 매니저': image('1F9D1-200D-1F4BC'), '솜사탕 가게 주인': image('1F9D1-200D-1F373'),
  '안내 센터 직원': image('1F481'), '전기 담당 직원': image('1F9D1-200D-1F4BB'), '축제 총감독': image('1F935'),
  '선물 가게 주인': image('1F9D1-200D-1F4BC'),
}
// 조사 방법 버튼의 아이콘
const CATEGORY_ICON = { 관찰: '🔍', 질문: '💬', 점검: '🔧', 기록: '📋' }

function Countdown() {
  const [left, setLeft] = useState(COUNTDOWN)
  useEffect(() => {
    const start = Date.now()
    const id = window.setInterval(() => setLeft(Math.max(0, COUNTDOWN - Math.floor((Date.now() - start) / 1000))), 1000)
    return () => window.clearInterval(id)
  }, [])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return <p className="repair-countdown" role="timer">{left ? <>개막까지 <b>{mm}:{ss}</b></> : <>곧 개막! 천천히 해도 괜찮아</>}</p>
}

function CasePlay({ item, records, investigation, surface, save, onComplete, onBack }) {
  const [phase, setPhase] = useState(() => {
    if (records[item.id]) return 'complete'
    return investigation.diagnosed ? 'bench' : 'field'
  })
  const [category, setCategory] = useState('관찰')
  const [sideTab, setSideTab] = useState('chat') // 오른쪽 창: 대화 | 수첩
  const [guessing, setGuessing] = useState(false) // 가설 세우기 창
  const [known, setKnown] = useState(investigation.known ?? [])
  const [fact, setFact] = useState(() => investigation.diagnosed ? item.lines.toBench : fieldPrompts[item.id])
  const [speaker, setSpeaker] = useState(null) // 하단 대사의 주인: null이면 보이드, 아니면 NPC 이름
  // 아이가 직접 적는 것들: 관찰마다 든 생각, 가설(문장)과 그 근거로 고른 관찰
  const [thoughts, setThoughts] = useState(investigation.thoughts ?? {})
  const [revealed, setRevealed] = useState(investigation.revealed ?? []) // ‘막혔어’로 미리 열어 준 조사 버튼
  const [draft, setDraft] = useState(investigation.hypothesis?.text ?? investigation.draft ?? '')
  const [evidence, setEvidence] = useState(investigation.hypothesis?.evidence ?? [])
  const [myHypothesis, setMyHypothesis] = useState(investigation.hypothesis ?? null)
  const [tries, setTries] = useState(investigation.tries ?? 0) // 가설을 말한 횟수
  const [solvedProblems, setSolvedProblems] = useState(investigation.solvedProblems ?? []) // 퍼레이드: 원인을 설명한 문제
  const [verdict, setVerdict] = useState(null) // 마지막 판정 { verdict, text }
  const [misses, setMisses] = useState(0) // 연속으로 정답이 아니었던 횟수 → 반복 실패 시 힌트
  const [failures, setFailures] = useState(0) // 작업대 시험 실패 횟수
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState([])
  const [asking, setAsking] = useState(false)
  const [judging, setJudging] = useState(false)
  const [aiOn, setAiOn] = useState(null) // Gemini 보이드 연결 여부(null: 아직 모름)
  const [settings, setSettings] = useState(() => Object.fromEntries(Object.entries(item.controls).map(([id, spec]) => [id, investigation.settings?.[id] ?? spec.initial])))
  const [verified, setVerified] = useState(investigation.verified ?? [])
  const [trial, setTrial] = useState(null)
  const [inspected, setInspected] = useState(null)
  const [running, setRunning] = useState(false)
  const timer = useRef(null)
  const pendingQuestion = useRef(null)
  const completed = useRef(false)
  const licensedAtEntry = useRef(hasRemoteRepairLicense(records))
  const titleRef = useRef(null)
  const chatLogRef = useRef(null)
  const questionRef = useRef(null)
  // 수첩에는 누가 한 말인지 함께 적는다
  const facts = Object.fromEntries(item.clueList.map(clue => [clue.id, clue.npc ? `${clue.npc}: ${clue.fact}` : clue.fact]))
  const owned = ownedParts(records)
  const noteCount = known.length
  const canHypothesize = known.length >= MIN_OBSERVATIONS
  const inWorld = surface === 'world'
  const licensed = hasRemoteRepairLicense(records)
  const earnedLicense = inWorld && licensed && !licensedAtEntry.current
  const working = phase === 'field' || phase === 'bench'
  const activeStep = ['field', 'bench', 'complete'].indexOf(phase)
  // 함께 조사하는 동료: 기본은 보이드, 스토리상 보이드가 없는 사건(첫 자동차)은 item.guide(리코)
  const G = item.guide ?? { name: '보이드', portrait: 'void.svg' }
  const portrait = <img className="repair-case-portrait" src={`${import.meta.env.BASE_URL}portraits/${G.portrait}`} alt={G.name} />
  const categories = CATEGORY.filter(type => item.clueList.some(clue => clue.type === type))

  useEffect(() => () => {
    window.clearTimeout(timer.current)
    pendingQuestion.current?.abort()
  }, [])
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }) }, [phase])
  useEffect(() => {
    const log = chatLogRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [chat])
  // 질문 칸은 적는 만큼 늘어난다(최대 6줄 정도, 그 뒤로는 스크롤)
  useEffect(() => {
    const box = questionRef.current
    if (!box) return
    box.style.height = 'auto'
    box.style.height = `${Math.min(box.scrollHeight, 168)}px`
  }, [question, sideTab])

  const say = (text, who = null) => { setFact(text); setSpeaker(who) }
  // 개발 서버의 Gemini 보이드 호출. 실패하면 null(게임 규칙만으로 답한다)
  const askGemini = async (path, body, timeout, signal) => {
    if (!aiVoice) return null
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      })
      setAiOn(response.ok)
      return response.ok ? await response.json() : null
    } catch {
      setAiOn(false)
      return null
    }
  }
  const voidSays = (text, input = null) => setChat(previous => [...previous.slice(-7), { input, reply: { text } }])

  const record = (clue) => {
    if (!known.includes(clue.id)) {
      const next = [...known, clue.id]
      setKnown(next)
      save({ known: next })
    }
    say(clue.fact, clue.npc ?? null)
  }
  const animate = (ok, done, kind, index) => {
    if (running) return
    setRunning(true)
    const duration = item.id === 'food' || item.id === 'coaster' ? 3000 : 2200
    const run = { start: performance.now(), duration, ok, kind, index }
    setTrial(run)
    timer.current = window.setTimeout(() => {
      setRunning(false)
      done()
    }, duration)
  }
  const inspect = (clue) => {
    setInspected(clue.id)
    if (ANIMATED.includes(clue.id) || (item.id === 'food' && clue.id === 'delay') || (item.id === 'parade' && ['route', 'hill'].includes(clue.id))) {
      say(item.id === 'food' ? '투입구 바로 아래를 봐. 재료가 하나씩 떨어져.' : '움직임이 달라지는 순간을 눈여겨봐.')
      animate(clue.id === 'kids', () => record(clue), clue.id)
    } else {
      setTrial(null)
      record(clue)
    }
  }

  // 힌트(기준 문서 순서): 이미 확인한 단서의 힌트는 건너뛴다
  const nextHint = () => {
    if (phase === 'bench') {
      const firstControl = Object.values(item.controls).find((spec, index) => !isTarget(spec, Object.values(settings)[index])) ?? Object.values(item.controls)[0]
      return failures < 2
        ? '네 가설이 맞다면 어떤 부품을 어떻게 바꿔야 할까? 한 번에 한 가지만 바꾸고 시험하면 무엇이 효과가 있는지 알 수 있어.'
        : `‘${firstControl.label}’을 바꾸면 결과가 어떻게 달라지는지 비교해 봐.`
    }
    if (item.problems) {
      const open = item.problems.find(problem => !solvedProblems.includes(problem.id))
      const step = item.hints.find(candidate => !candidate.clues.some(id => known.includes(id)))
      return step?.text ?? open?.hint ?? '수첩에 적은 관찰들 사이에 공통점이 있는지 찾아봐.'
    }
    const step = item.hints.find(candidate => !candidate.clues.some(id => known.includes(id)))
    return step?.text ?? '단서는 충분히 모았어. 수첩의 관찰들을 이어서 무엇이 무엇 때문에 그렇게 됐는지 한 문장으로 적어 봐.'
  }
  // 아직 숨겨진 조사 버튼: 관련 단서를 먼저 봤거나 ‘막혔어’로 열어 준 것만 보인다
  const isVisible = (clue) => !clue.after || known.includes(clue.id) || revealed.includes(clue.id) || clue.after.some(id => known.includes(id))
  // ‘막혔어, 도와줘’: 힌트를 주고, 지금 힌트와 관련된 숨은 조사 버튼이 있으면 하나 열어 준다
  const stuck = () => {
    let text = nextHint()
    if (phase === 'field') {
      const step = item.hints.find(candidate => !candidate.clues.some(id => known.includes(id)))
      const hidden = item.clueList.filter(clue => !isVisible(clue))
      // 지금 힌트와 관련된 버튼을 먼저, 없으면 다음 힌트 순서대로 하나를 연다(도움을 청할 때마다 하나씩)
      const from = Math.max(0, item.hints.indexOf(step))
      const order = item.hints.slice(from).flatMap(candidate => candidate.clues)
      const unlock = order.map(id => hidden.find(clue => clue.id === id)).find(Boolean) ?? hidden[0]
      if (unlock) {
        const next = [...revealed, unlock.id]
        setRevealed(next)
        save({ revealed: next })
        setCategory(unlock.type)
        text += ` ‘${unlock.type}’에 새로 해 볼 게 생겼어!`
      }
    }
    voidSays(text, '막혔어')
  }

  // 가설 말하기 → 보이드가 판정(정답, 부분 정답, 오답). 정답이어야 작업대로 간다
  const submitHypothesis = async () => {
    const text = draft.trim()
    if (text.length < MIN_HYPOTHESIS) {
      setVerdict({ verdict: 'unclear', text: '조금 더 자세히 적어 볼래? 무엇이 무엇 때문에 그렇게 됐는지 한 문장으로.' })
      return
    }
    if (!evidence.length) {
      setVerdict({ verdict: 'unclear', text: '어떤 관찰 때문에 그렇게 생각했는지 하나 이상 골라 줘.' })
      return
    }
    if (judging) return
    setJudging(true)
    // Gemini(개발 서버, 프롬프트 문서 기준)가 의미로 판정. 키가 없거나 오프라인이면 로컬 규칙만 쓴다
    const model = await askGemini('/api/void-judge', { caseId: item.id, known, hypothesis: text, solved: solvedProblems }, 14000)
    const result = judgeWithModel(item, text, known, model, solvedProblems)
    setJudging(false)
    const nextTries = tries + 1
    setTries(nextTries)
    const solved = result.solved ?? solvedProblems
    setSolvedProblems(solved)
    save({ tries: nextTries, draft: text, solvedProblems: solved })
    setChat(previous => [...previous.slice(-7), { input: text, reply: { text: result.text } }])
    if (result.verdict !== 'correct') {
      const missCount = misses + 1
      setMisses(missCount)
      // 반복해서 정답이 아니면 힌트를 순서대로 하나 더 준다
      setVerdict(missCount >= 2 ? { ...result, text: `${result.text} 힌트: ${nextHint()}` } : result)
      return
    }
    pendingQuestion.current?.abort()
    pendingQuestion.current = null
    setAsking(false)
    setTrial(null)
    const next = { text, evidence }
    setMyHypothesis(next)
    save({ diagnosed: true, hypothesis: next, tries: nextTries, solvedProblems: solved })
    setVerdict(null)
    setMisses(0)
    setGuessing(false)
    setPhase('bench')
    voidSays(item.lines.toBench)
    say(`${item.lines.correct} ${item.lines.toBench}`)
  }
  // 시험이 생각대로 안 되면 다시 현장으로 돌아가 관찰하고 가설을 고칠 수 있다
  const rethink = () => {
    if (running) return
    setTrial(null)
    save({ diagnosed: false })
    setPhase('field')
    say('다시 살펴보자. 아직 안 해 본 조사가 있을까? 새로 알게 된 걸로 가설을 고쳐 봐.')
  }
  const writeThought = (id, value) => setThoughts(previous => ({ ...previous, [id]: value }))
  const keepThoughts = () => save({ thoughts })
  const test = (index) => {
    const ok = trialResult(item, settings, index)
    animate(ok, () => {
      if (!ok) {
        const failCount = failures + 1
        setFailures(failCount)
        let message = `${item.fail} 네 가설로 이 결과를 설명할 수 있어? 설정을 바꿔 보거나 가설을 다시 세워 봐.`
        if (item.problems) {
          // 일부만 해결했으면 해결한 문제는 인정하고 남은 문제를 알려 준다
          const keys = item.testControls[index]
          const done = keys.filter(key => isTarget(item.controls[key], settings[key])).map(key => item.controls[key].label)
          const left = keys.filter(key => !isTarget(item.controls[key], settings[key])).map(key => item.controls[key].label)
          message = `${done.length ? `좋아! ${done.join(', ')} 문제는 해결했어. ` : ''}이제 남은 문제: ${left.join(', ')}. 가진 부품으로 해결할 방법을 골라 봐.`
        }
        say(message)
        if (failCount >= 2) voidSays(nextHint(), '시험이 또 실패했어')
        return
      }
      const next = [...new Set([...verified, index])]
      setVerified(next)
      save({ verified: next })
      say(item.pass)
      if (next.length === item.tests.length && !completed.current) {
        completed.current = true
        onComplete()
        setPhase('complete')
      }
    }, 'test', index)
  }
  const adjust = (id, value) => {
    if (running || settings[id] === Number(value)) return
    const next = { ...settings, [id]: Number(value) }
    const stillVerified = verified.filter(index => item.testControls?.[index] && !item.testControls[index].includes(id))
    setSettings(next)
    setVerified(stillVerified)
    setTrial(null)
    say('설정을 바꿨어요. 아래에서 시험해 보세요.')
    save({ settings: next, verified: stillVerified })
  }
  // 퍼레이드: 가진 부품으로만 해결 방법을 고를 수 있다
  const optionLocked = (spec, index) => {
    const part = spec.parts?.[index]
    if (!part || owned.includes(part)) return false
    const anyOwned = spec.parts.some(candidate => candidate && owned.includes(candidate))
    return anyOwned
  }
  const ask = async (input, quick = false) => {
    input = input.trim()
    if (!input || pendingQuestion.current) return
    if (!quick) setQuestion('')
    // 게임 상태로 바로 답할 수 있는 것(시험 중, 지금 설정값)은 규칙으로, 나머지는 Gemini 보이드가 답한다
    let reply = voidReply(input, item, known, facts)
    let fixed = false
    if (phase === 'bench') {
      const nextTest = item.tests.find((_, index) => !verified.includes(index))
      fixed = true
      if (running) reply = { text: '지금 시험 중이야. 장치가 끝까지 움직이는지 먼저 보자.' }
      else if (/지금|현재|설정|어디에|어느 쪽/u.test(input) && !quick) {
        const current = Object.entries(item.controls).map(([id, spec]) => `${spec.label}은 ‘${spec.options[settings[id]]}’`)
        reply = { text: `작업대에서 지금 고른 값이야. ${current.join(', ')}.` }
      }
      else if (quick) {
        reply = { text: nextTest
          ? `‘${nextTest}’부터 해 보자. 부품을 조정한 뒤 실제로 어떻게 움직이는지 확인할 수 있어.`
          : '모든 시험을 통과했어.' }
      } else {
        fixed = false
        reply = { text: trial && !trial.ok ? item.fail + ' 네 가설과 어떻게 달라?' : '네 가설에 따르면 어떤 결과가 나와야 해? 예상해 보고 시험해서 확인해 봐.' }
      }
    }
    if (!fixed && !quick) {
      const controller = new AbortController()
      pendingQuestion.current = controller
      setAsking(true)
      setChat(previous => [...previous.slice(-7), { input, reply: null }])
      const history = chat.slice(-4).map(turn => ({ player: turn.input ?? '', void: turn.reply?.text ?? '' }))
      const result = await askGemini('/api/void-chat', { caseId: item.id, known, question: input, phase, history }, 14000, controller.signal)
      if (controller.signal.aborted) return
      if (result?.reply) reply = { text: result.reply }
      pendingQuestion.current = null
      setAsking(false)
      setChat(previous => [...previous.slice(0, -1), { input, reply }])
      return
    }
    setChat(previous => [...previous.slice(-7), { input, reply }])
  }

  const records6 = REPAIR_CASES.filter(candidate => records[candidate.id])
  const hudSpeaker = <p><b>{speaker ?? G.name}</b>{fact}</p>

  // 게임 화면 배치: 2D 장면이 화면 전체를 채우고, 그 위에
  //  왼쪽 위: 사건 제목과 진행 단계 / 오른쪽: 보이드 대화와 정비 수첩 / 아래: 대사와 조사, 수리 버튼
  return (
    <section className={`repair-case repair-stage${inWorld ? ' in-world' : ' in-desk'}`}>
      <div className="repair-stage-scene">
        <RepairScene item={item} settings={settings} trial={trial} inspected={inspected} field={phase === 'field'} known={known} finished={phase === 'complete' && !trial} stage />
      </div>

      <header className="repair-hud-title">
        {portrait}
        <div>
          <p className="repair-kicker">
            {item.district} <span aria-hidden="true">/</span> {inWorld ? '축제 전 시설 점검' : surface === 'room' ? '첫 자동차 정비' : '마이룸 원격 수리실'}
          </p>
          <h2 ref={titleRef} tabIndex={-1}>{item.title}</h2>
          <ol className="repair-steps" aria-label="수리 진행 단계">
            {STEPS.map((label, index) => (
              <li key={label} aria-current={index === activeStep ? 'step' : undefined} data-done={index < activeStep}>
                <span aria-hidden="true">{index < activeStep ? '✓' : index + 1}</span>{label}
              </li>
            ))}
          </ol>
          {item.problems && working && <Countdown />}
        </div>
      </header>

      <aside className="repair-hud-side">
        <div className="repair-side-tabs" role="tablist" aria-label="보이드 창">
          <button role="tab" aria-selected={sideTab === 'chat'} onClick={() => setSideTab('chat')}>{G.name}와 대화{aiOn && <em className="repair-ai-badge" title="Gemini가 프롬프트 문서대로 답하고 있어요">AI</em>}</button>
          <button role="tab" aria-selected={sideTab === 'notes'} onClick={() => setSideTab('notes')}>정비 수첩 <span>{noteCount}/{item.clueList.length}</span></button>
        </div>
        {sideTab === 'chat' && (
          <section className="repair-conversation" aria-label={`${G.name}와 대화`}>
            <div className="repair-chat-log" ref={chatLogRef} role="log" aria-label={`${G.name} 대화 기록`}>
              {phase === 'field' && <p className="repair-chat-bubble repair-chat-npc"><b>{item.client}</b>{item.request}</p>}
              <p className="repair-chat-bubble">{phase === 'bench' ? item.lines.toBench : phase === 'complete' ? item.lines.success : item.lines.start}</p>
              {chat.map(({ input, reply }, index) => {
                return <div className="repair-chat-turn" key={index}>
                  {input && <p className="repair-chat-bubble repair-chat-player"><b>나</b>{input}</p>}
                  <div className="repair-chat-bubble">
                    <p>{reply?.text ?? `${G.name}가 생각 중…`}</p>
                  </div>
                </div>
              })}
            </div>
            {working && <>
              <button className="repair-chat-prompt" type="button" disabled={asking} onClick={stuck}>막혔어, 도와줘</button>
              <form className="repair-chat" onSubmit={event => {
                event.preventDefault()
                void ask(question)
              }}>
                <textarea ref={questionRef} rows={2} aria-label={`${G.name}에게 질문`} placeholder={'궁금한 점을 물어봐\n(Enter 보내기, Shift+Enter 줄 바꿈)'} value={question} maxLength={300}
                  onChange={event => setQuestion(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      void ask(question)
                    }
                  }} />
                <button className="repair-primary" type="submit" disabled={asking || !question.trim()}>보내기</button>
              </form>
            </>}
          </section>
        )}
        {sideTab === 'notes' && (
          <section className="repair-notes" aria-label="정비 수첩">
            {myHypothesis && <div className="repair-my-hypothesis"><b>내 가설</b><p>{myHypothesis.text}</p></div>}
            {known.length ? <ul className="repair-note-list">{known.map(id => (
              <li key={id}>
                <p className="repair-note-fact">{facts[id]}</p>
                <textarea
                  className="repair-note-thought"
                  aria-label="이 관찰에 대한 내 생각"
                  placeholder="이걸 보고 어떤 생각이 들었어? (예: 왜 그럴까? 다른 곳과 뭐가 달라?)"
                  value={thoughts[id] ?? ''}
                  maxLength={200}
                  rows={2}
                  onChange={event => writeThought(id, event.target.value)}
                  onBlur={keepThoughts}
                />
              </li>
            ))}</ul> : <p>아직 기록이 없어요. 현장에서 직접 살펴보거나 물어본 것을 여기 모아요.</p>}
            {item.id === 'parade' && known.includes('notes') && (
              records6.length
                ? <ul className="repair-note-archive">{records6.map(candidate => <li key={candidate.id}><b>{candidate.district}</b> {candidate.resolution}</li>)}</ul>
                : <p>아직 고친 사건이 없어요.</p>
            )}
          </section>
        )}
      </aside>

      {working && (
        <div className="repair-hud-bottom">
          {/* 대사: 게임 대화창처럼 버튼 바로 위에 띄운다. NPC에게 물었을 때는 그 NPC가 말한다 */}
          <div className={`repair-hud-line${speaker ? ' is-npc' : ''}`} role="status">
            {/* 말하는 인물이 말풍선 왼쪽 위에 서 있다 */}
            <figure className="repair-speaker" key={speaker ?? G.name}>
              {SPEAKER_ART[speaker ?? G.name]
                ? <img src={SPEAKER_ART[speaker ?? G.name]} alt="" />
                : <NpcBadge name={speaker ?? G.name} />}
              <figcaption>{speaker ?? G.name}</figcaption>
            </figure>
            {hudSpeaker}
            {phase === 'field' && inspected && <button className="repair-text-button" onClick={() => setSideTab('notes')}>수첩에 내 생각 적기</button>}
          </div>

          {phase === 'field' && (
            <div className="repair-hud-actions">
              <div className="repair-tabs repair-category-tabs" aria-label="조사 방법">
                {categories.map(type => (
                  <button key={type} data-type={type} aria-pressed={type === category} onClick={() => setCategory(type)}>
                    <span aria-hidden="true">{CATEGORY_ICON[type]}</span>{type}
                  </button>
                ))}
              </div>
              <div className="repair-action-row">
                {item.clueList.filter(clue => clue.type === category && isVisible(clue)).map(clue => (
                  <button key={clue.id} className={`repair-action${clue.npc ? ' repair-action-ask' : ''}`} data-done={known.includes(clue.id)} disabled={running || (clue.id === 'repeat' && !known.includes('run'))} onClick={() => inspect(clue)}>
                    {clue.npc && <small>{clue.npc}에게</small>}
                    {clue.npc ? `“${clue.label}”` : clue.label}{known.includes(clue.id) ? ' ✓' : ''}
                  </button>
                ))}
                <button className="repair-action repair-action-go" disabled={running || !canHypothesize} onClick={() => { setVerdict(null); setGuessing(true) }}
                  title={canHypothesize ? '' : `먼저 ${MIN_OBSERVATIONS}가지 이상 살펴봐요`}>내 가설 말하기 →</button>
              </div>
              <span className="repair-evidence">살펴본 것 {known.length}개</span>
            </div>
          )}

          {phase === 'bench' && myHypothesis && (
            <div className="repair-hud-hypothesis"><b>내 가설</b><span>{myHypothesis.text}</span><button className="repair-text-button" disabled={running} onClick={rethink}>다시 조사하고 고치기</button></div>
          )}
          {phase === 'bench' && (
            <div className="repair-hud-actions">
              {item.problems && <p className="repair-parts">가진 부품: {owned.length ? owned.join(', ') : '없음'}</p>}
              <div className="repair-bench-row">
                {Object.entries(item.controls).map(([id, spec]) => item.id === 'carousel' ? (
                  <label key={id} className="repair-control">{spec.label}
                    <div className="repair-range"><input type="range" min={0} max={spec.options.length - 1} value={settings[id]} disabled={running} aria-valuetext={spec.options[settings[id]]} onChange={event => adjust(id, event.target.value)} /><output>{spec.options[settings[id]]}</output></div>
                  </label>
                ) : (
                  <fieldset key={id} className="repair-control" disabled={running}>
                    <legend>{spec.label}</legend>
                    <div className="repair-chips">{spec.options.map((option, index) => {
                      const locked = optionLocked(spec, index)
                      return <button key={option} type="button" aria-pressed={settings[id] === index} disabled={locked}
                        title={locked ? `${spec.parts[index]} 부품이 필요해요` : undefined} onClick={() => adjust(id, index)}>
                        {locked ? '🔒 ' : ''}{option}
                      </button>
                    })}</div>
                  </fieldset>
                ))}
              </div>
              <div className="repair-action-row" aria-label="시험 운행">
                {item.tests.map((label, index) => {
                  const current = trial?.kind === 'test' && trial.index === index
                  const status = current && running ? '시험 중…' : verified.includes(index) ? '통과' : current && !trial.ok ? '다시 점검' : '시험하기'
                  return <button key={label} className="repair-action repair-test" disabled={running} data-status={status} onClick={() => test(index)}>
                    <strong>{label}</strong><span>{status}</span>
                  </button>
                })}
                <span className="repair-evidence">시험 통과 {verified.length} / {item.tests.length}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 가설 말하기: 장면 위에 뜨는 창. 보이드가 정답, 부분 정답, 오답을 판정한다 */}
      {phase === 'field' && guessing && (
        <div className="repair-overlay" onClick={event => event.target === event.currentTarget && setGuessing(false)}>
          <fieldset className="repair-hypotheses repair-overlay-card">
            <legend>왜 이런 일이 생겼을까?</legend>
            <p className="repair-overlay-line"><b>{G.name}</b>{item.problems
              ? '문제가 여러 개야. 문제마다 무엇 때문에 생겼는지 적어 줘. 줄을 바꿔서 하나씩 적어도 좋아.'
              : '네가 찾은 원인을 말해 줘. 무엇이 무엇 때문에 그렇게 됐는지 한 문장으로!'}</p>
            {item.problems && <ul className="repair-problem-list">{item.problems.map(problem => (
              <li key={problem.id} data-done={solvedProblems.includes(problem.id)}>{solvedProblems.includes(problem.id) ? '✓' : '·'} {problem.name}</li>
            ))}</ul>}
            <textarea className="repair-hypothesis-input" aria-label="내 가설" placeholder="예: ○○ 때문에 △△가 되어서 멈추는 것 같아."
              value={draft} maxLength={400} rows={item.problems ? 5 : 3} autoFocus onChange={event => setDraft(event.target.value)} />
            <p className="repair-overlay-sub">어떤 관찰 때문에 그렇게 생각했어?</p>
            <div className="repair-evidence-pick">
              {known.map(id => (
                <label key={id}>
                  <input type="checkbox" checked={evidence.includes(id)} onChange={() => setEvidence(previous => previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id])} />
                  <span>{facts[id]}{thoughts[id] ? <em> · 내 생각: {thoughts[id]}</em> : null}</span>
                </label>
              ))}
            </div>
            {verdict && <p className={`repair-overlay-line repair-verdict repair-verdict-${verdict.verdict}`} role="status"><b>{G.name}</b>{verdict.text}</p>}
            <div className="repair-overlay-buttons">
              <button className="repair-text-button" onClick={() => setGuessing(false)}>더 조사하기</button>
              <button className="repair-primary" disabled={running || judging} onClick={submitHypothesis}>{judging ? `${G.name}가 생각 중…` : `${G.name}에게 말하기`}</button>
            </div>
          </fieldset>
        </div>
      )}

      {phase === 'complete' && (
        <div className={`repair-overlay${item.problems ? ' repair-ending' : ''}`}>
          {item.problems && <div className="repair-fireworks" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <span key={i} />)}</div>}
          <div className="repair-success repair-overlay-card">
            <img src={image(item.asset)} alt="" />
            <h2>{item.problems ? '축제가 열렸어요!' : '시설이 다시 움직여요!'}</h2>
            <p className="repair-overlay-line"><b>{G.name}</b>{item.lines.success}</p>
            {myHypothesis && !item.problems && <div className="repair-compare">
              <div><b>내가 세운 가설</b><p>{myHypothesis.text}</p></div>
              <div><b>실제로 일어난 일</b><p>{item.resolution}</p></div>
            </div>}
            {(!myHypothesis || item.problems) && <p>{item.resolution}</p>}
            {tries > 1 && <p className="repair-tries">가설을 {tries}번 고쳐 말하며 찾아냈어요!</p>}
            {item.part && <p>정비 인증 스탬프 획득, 해금 부품 <b>{item.part}</b></p>}
            {item.completeNote && <div className="repair-license"><span aria-hidden="true">🪪</span><div><b>{item.completeNote}</b></div></div>}
            {item.problems && (
              <>
                <p className="repair-cheer-title">퍼레이드 길가에서 환호해요!</p>
                <ul className="repair-cheer">{records6.map(candidate => (
                  <li key={candidate.id}><img src={image(candidate.asset)} alt="" /><span>{candidate.client}</span></li>
                ))}</ul>
                <p className="repair-overlay-line"><b>{G.name}</b>{item.lines.final}</p>
              </>
            )}
            {earnedLicense && (
              <div className="repair-license">
                <span aria-hidden="true">🪪</span>
                <div><b>정식 정비사가 됐어요! 원격 수리 자격증을 받았어요</b><p>마이룸 컴퓨터의 ‘원격 수리실’이 열렸어요. 가진 부품으로 새 의뢰를 해결해 봐요.</p></div>
              </div>
            )}
            <button className="repair-primary" onClick={onBack}>{inWorld ? '도로랜드로 돌아가기' : surface === 'room' ? '면허증 받으러 가기' : '작업 목록으로'}</button>
          </div>
        </div>
      )}
    </section>
  )
}

function SavedCase({ item, surface, onBack, onSolved }) {
  const { progress, setProgress } = useStore()
  const records = progress.festivalRepairs ?? emptyRecords
  const investigation = progress.festivalInvestigations?.[item.id] ?? emptyRecords
  return <CasePlay key={item.id} item={item} surface={surface} records={records} investigation={investigation} onBack={onBack}
    save={patch => setProgress(current => ({
      festivalInvestigations: {
        ...current.festivalInvestigations,
        [item.id]: { ...current.festivalInvestigations?.[item.id], ...patch },
      },
    }))}
    onComplete={() => {
      setProgress(current => ({ festivalRepairs: { ...current.festivalRepairs, [item.id]: true } }))
      onSolved?.()
    }}
  />
}

export function FestivalField({ item, onClose }) {
  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !event.isComposing) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <main className="repair-field-screen repair-page" aria-label="보이드와 함께하는 고장 수사대">
      <SavedCase item={item} surface="world" onBack={onClose} />
      <button className="repair-hud-back" onClick={onClose} title="도로랜드로 돌아가기 (Esc)">← 도로랜드로 <kbd>Esc</kbd></button>
      <AssetCredit />
    </main>
  )
}

// 챕터 1 마이룸: 처음 받은 자동차 고치기. 다 고치면 onClear(운전면허증)
export function CarRepairField({ onClose, onClear }) {
  const solved = useRef(false)
  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !event.isComposing) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return (
    <main className="repair-field-screen repair-page" aria-label="자동차 수리">
      <SavedCase item={CAR_CASE} surface="room" onSolved={() => { solved.current = true }} onBack={() => (solved.current ? onClear() : onClose())} />
      <button className="repair-hud-back" onClick={() => (solved.current ? onClear() : onClose())} title="마이룸으로 돌아가기 (Esc)">← 마이룸으로 <kbd>Esc</kbd></button>
      <AssetCredit />
    </main>
  )
}

function AssetCredit() {
  return <footer className="repair-credit">아이콘 <a href="https://openmoji.org/">OpenMoji</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, 배경과 소품 <a href="https://kenney.nl/">Kenney</a> CC0, 버거 재료 <a href="https://davemarian.itch.io/food-and-ingredients-assets-from-gamejam">Dave Marian</a></footer>
}

// 마이룸 컴퓨터의 원격 수리실. 개막 퍼레이드를 마쳐 정식 정비사(원격 수리 자격증)가 되면 열린다.
export function FestivalDesk() {
  const { user, progress } = useStore()
  const [active, setActive] = useState(null)
  const [fixing, setFixing] = useState(null)
  const records = progress.festivalRepairs ?? emptyRecords
  if (!hasRemoteRepairLicense(records)) return null

  const archive = [...REPAIR_CASES, PARADE].filter(candidate => records[candidate.id])
  const item = [WORKSHOP, ...archive].find(candidate => candidate.id === active)
  const faults = progress.carCheckDone ? pendingFaults(user.id, progress.work) : []
  const parts = ownedParts(records)
  return (
    <section className={`repair-page repair-desk${item ? ' has-case' : ''}`}>
      {item ? (
        <>
          <SavedCase item={item} surface="desk" onBack={() => setActive(null)} />
          <button className="repair-hud-back" onClick={() => setActive(null)}>← 원격 수리실</button>
        </>
      ) : (
        <>
          <p className="repair-kicker">DORO OS / 마이룸</p>
          <h2>원격 수리실</h2>
          <div className="repair-license">
            <span aria-hidden="true">🪪</span>
            <div><b>원격 수리 자격증</b><p>{user.name}, 도로랜드 정식 정비사. 정비 인증 스탬프 {countFestivalRepairs(records)}/{REPAIR_CASES.length}, 가진 부품: {parts.join(', ') || '없음'}</p></div>
          </div>
          <h3>원격 의뢰</h3>
          <div className="repair-cards">
            <button className="repair-card" onClick={() => setActive(WORKSHOP.id)}>
              <img src={image(WORKSHOP.asset)} alt="" />
              <strong>{WORKSHOP.title}</strong>
              <span>{records.delivery ? '완료 기록 보기' : progress.festivalInvestigations?.delivery ? '작업 이어하기' : '새 의뢰 시작'}</span>
            </button>
          </div>
          <h3>오늘 고장 난 시설</h3>
          {faults.length ? (
            <div className="repair-cards">
              {faults.map(id => (
                <button key={id} className="repair-card repair-card-fault" onClick={() => setFixing(id)}>
                  <strong>⚠ {BREAKABLE[id].name}</strong>
                  <span>{BREAKABLE[id].fault}</span>
                  <span>원격으로 수리하기</span>
                </button>
              ))}
            </div>
          ) : <p>오늘 고장 난 시설은 모두 고쳤어요.</p>}
          <h3>축제 시설 수리 기록</h3>
          <div className="repair-cards">
            {archive.map(candidate => (
              <button key={candidate.id} className="repair-card" onClick={() => setActive(candidate.id)}>
                <img src={image(candidate.asset)} alt="" />
                <strong>{candidate.title}</strong>
                <span>완료 기록 보기</span>
              </button>
            ))}
          </div>
          {countFestivalRepairs(records) < REPAIR_CASES.length && <p>아직 고치지 않은 축제 시설은 도로랜드에서 직접 조사할 수 있어요.</p>}
        </>
      )}
      {fixing && <FixMission id={fixing} onClose={() => setFixing(null)} onFixed={() => setFixing(null)} />}
      <AssetCredit />
    </section>
  )
}

