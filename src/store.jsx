import { createContext, useContext, useEffect, useState } from 'react'
import { ACCOUNTS, DEMO_STAGES, validateSignup } from './accounts.js'
import { INITIAL_PROGRESS, STORY_DONE } from './game/progress.js'
import { MAX_VISIT_LOG, VISIT_REWARD } from './game/visits.js'
import { checkInPatch, dailyOf } from './game/routine.js'

// 2D 화면(대시보드, 상점)과 3D 화면(마이룸)이 같이 쓰는 상태.
// 계정별 CELL·가구는 브라우저 localStorage에 저장한다.
// 나중에 DB(Supabase 등)로 옮길 때 이 파일만 바꾸면 된다.
export const SHOP_ITEMS = [
  { id: 'plant', name: '몬스테라 화분', price: 200, desc: '초록 잎이 무성한 화분', color: '#4CAF6E' },
  { id: 'lamp', name: '스탠드 조명', price: 300, desc: '방을 따뜻하게 밝혀요', color: '#F5B841' },
  { id: 'rug', name: '동그란 러그', price: 150, desc: '푹신한 원형 러그', color: '#E57E9A' },
  { id: 'shelf', name: '책장', price: 400, desc: '수업 기록을 꽂아둘 책장', color: '#8B5E3C' },
  { id: 'poster', name: '도로랜드 포스터', price: 100, desc: '벽에 붙이는 하모니아 포스터', color: '#4E8BFF' },
  { id: 'clock', name: '벽시계', price: 150, desc: '째깍째깍 파란 벽시계', color: '#7FB4EA' },
  { id: 'beanbag', name: '빈백 소파', price: 250, desc: '푹 파묻히는 노란 빈백', color: '#F5B841' },
  { id: 'guitar', name: '통기타', price: 350, desc: '벽에 기대 둔 통기타', color: '#C8714A' },
  { id: 'aquarium', name: '어항', price: 450, desc: '물고기 세 마리가 사는 어항', color: '#5AC8FA' },
  { id: 'tv', name: 'TV', price: 500, desc: '빈백 앞에 놓는 큰 TV', color: '#2B2F3A' },
  { id: 'bed', name: '침대', price: 600, desc: '하늘색 이불 침대', color: '#7FB4EA' },
]

const SESSION_KEY = 'dorobus.session'
const SIGNUP_KEY = 'dorobus.accounts' // 회원가입으로 만든 계정 목록 (체험판: 이 브라우저에만 저장)
const dataKey = (id) => `dorobus.data.${id}`

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장이 막힌 브라우저에서는 새로고침 시 초기화된다 */
  }
}
const remove = (key) => {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 무시 */
  }
}

const signedUpAccounts = () => {
  const list = read(SIGNUP_KEY)
  return Array.isArray(list) ? list : []
}
const allAccounts = () => [...ACCOUNTS, ...signedUpAccounts()]
const findUser = (id) => allAccounts().find((a) => a.id === id) || null

// DB에서 받은 계정 정보(아이디·이름·역할·생년월일·나이)에 게임 설정(level·cell·preset)만 덧붙인다.
// accounts.js에 없는 계정(회원가입)은 기본값을 쓴다. 비밀번호는 화면 상태에 두지 않는다.
const fromDb = (profile) => {
  const { password: _password, ...game } = ACCOUNTS.find((a) => a.id === profile.id) || { level: 1, cell: 0 }
  return { ...game, ...profile, source: 'db' }
}
// 저장된 세션: DB 로그인이면 계정 정보 객체, 브라우저 체험 계정이면 아이디 문자열
const restoreUser = () => {
  const saved = read(SESSION_KEY)
  return saved && typeof saved === 'object' ? fromDb(saved) : findUser(saved)
}

// 로그인·회원가입 API. DB가 연결되지 않은 서버(503)나 API가 없는 정적 사이트에서는 null → 브라우저 체험 계정으로 처리
async function callAuth(path, body) {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if ([403, 404, 405, 503].includes(res.status)) return null
    return { status: res.status, body: await res.json().catch(() => ({})) }
  } catch {
    return null
  }
}
const roleError = (u, role) =>
  u.role === role ? null : u.role === 'student' ? '학생 계정이에요. 학생 탭에서 로그인해 주세요.' : '강사 계정이에요. 강사 탭에서 로그인해 주세요.'
const loadData = (u) => {
  const saved = read(dataKey(u.id)) || { cell: u.cell, owned: [], progress: u.preset }
  return { ...saved, progress: { ...INITIAL_PROGRESS, ...saved.progress } }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [user, setUser] = useState(restoreUser)
  const [data, setData] = useState(() => (user ? loadData(user) : null))

  useEffect(() => {
    if (user && data) write(dataKey(user.id), data)
  }, [user, data])

  const start = (u, session) => {
    setUser(u)
    setData(loadData(u))
    write(SESSION_KEY, session)
  }

  // 로그인: DB가 연결돼 있으면 서버가 DB의 계정·비밀번호로 확인하고, 이름·역할·생년월일은 DB 값을 쓴다.
  // 성공하면 null, 실패하면 안내 문구를 돌려준다.
  const login = async (id, password, role) => {
    const res = await callAuth('/api/auth/login', { id, password })
    if (res) {
      if (res.status !== 200) return res.body.error || '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
      const u = fromDb(res.body.user)
      const err = roleError(u, role)
      if (err) return err
      start(u, res.body.user)
      return null
    }
    // DB 미연결: 브라우저 체험 계정
    const u = findUser(id.trim().toLowerCase())
    if (!u || u.password !== password) return '아이디 또는 비밀번호가 맞지 않아요.'
    const err = roleError(u, role)
    if (err) return err
    start(u, u.id)
    return null
  }

  // 회원가입: 학생 계정만 만든다(강사 계정은 관리자가 등록). DB가 연결돼 있으면 DB에 저장한다.
  const signup = async (form) => {
    const checked = validateSignup(form, [])
    if (checked.error) return checked.error
    const res = await callAuth('/api/auth/signup', form)
    if (res) {
      if (res.status !== 200) return res.body.error || '가입하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
      start(fromDb(res.body.user), res.body.user)
      return null
    }
    // DB 미연결: 이 브라우저에만 저장
    const { error, account } = validateSignup(form, allAccounts().map((a) => a.id))
    if (error) return error
    write(SIGNUP_KEY, [...signedUpAccounts(), account])
    start(account, account.id)
    return null
  }

  const logout = () => {
    remove(SESSION_KEY)
    setUser(null)
    setData(null)
  }

  const buy = (item) => {
    if (!data || data.owned.includes(item.id) || data.cell < item.price) return false
    setData((d) => ({
      ...d,
      cell: d.cell - item.price,
      owned: [...d.owned, item.id],
      // 구매 목표를 샀으면 목표를 비운다
      progress: d.progress.goalItem === item.id ? { ...d.progress, goalItem: null } : d.progress,
    }))
    return true
  }

  const setProgress = (patch) => setData((d) => ({
    ...d,
    progress: { ...d.progress, ...(typeof patch === 'function' ? patch(d.progress) : patch) },
  }))
  // 시연 도구: 진행 상태를 통째로 바꾼다 (CELL, 가구는 그대로)
  const replaceProgress = (progress) => setData((d) => ({ ...d, progress }))

  // 시설 설치·강화: CELL 차감과 진행 상태 변경을 한 번에 처리한다 (DB라면 한 트랜잭션)
  const spendCell = (cost, patch) => {
    if (!data || data.cell < cost) return false
    setData((d) => ({ ...d, cell: d.cell - cost, progress: { ...d.progress, ...patch } }))
    return true
  }

  // 일일 퀘스트용 활동 기록. mode: 'add'(횟수) · 'unique'(같은 대상은 한 번만) · 'max'(최고 점수)
  const track = (ev, value = 1, mode = 'add') =>
    setData((d) => {
      if (!d) return d
      const daily = dailyOf(d.progress)
      const counts = { ...daily.counts }
      const seen = { ...daily.seen }
      if (mode === 'unique') {
        const list = seen[ev] || []
        if (list.includes(value)) return d
        seen[ev] = [...list, value]
        counts[ev] = (counts[ev] || 0) + 1
      } else if (mode === 'max') counts[ev] = Math.max(counts[ev] || 0, value)
      else counts[ev] = (counts[ev] || 0) + value
      return { ...d, progress: { ...d.progress, daily: { ...daily, counts, seen } } }
    })

  // 오늘 첫 접속이면 출석 도장을 찍는다
  const checkIn = () =>
    setData((d) => {
      if (!d) return d
      const patch = checkInPatch(d.progress)
      return patch ? { ...d, progress: { ...d.progress, ...patch } } : d
    })

  // 미션 보상 등으로 CELL을 받는다
  const addCell = (n) => setData((d) => ({ ...d, cell: d.cell + n }))

  // 미션 시도 기록. DB로 옮기면 MISSION_ATTEMPT 테이블의 한 줄이 된다.
  const recordAttempt = (mission, correct) =>
    setData((d) => {
      const prev = d.progress.attempts[mission] || { tries: 0, wrong: 0 }
      const next = { tries: prev.tries + 1, wrong: prev.wrong + (correct ? 0 : 1) }
      return { ...d, progress: { ...d.progress, attempts: { ...d.progress.attempts, [mission]: next } } }
    })

  // 시연 계정(preset 있음)은 CELL·가구까지 시연 상태로 되돌린다. stage: DEMO_STAGES의 이름 (없으면 시작 상태)
  const resetProgress = (stage) =>
    setData((d) =>
      user?.preset
        ? { cell: user.cell, owned: [], progress: { ...INITIAL_PROGRESS, ...(DEMO_STAGES[stage] || user.preset) } }
        : { ...d, progress: { ...INITIAL_PROGRESS } },
    )

  // 체험용: 메인 스토리를 모두 마친 상태로 바꾼다 (스토리 이후 콘텐츠 확인용)
  const skipStory = () => setData((d) => ({ ...d, progress: { ...d.progress, ...STORY_DONE } }))

  // G · 친구 방 미니게임: 같은 브라우저에서 플레이한 다른 계정의 데이터를 읽고, 플레이 수·좋아요를 남긴다
  const otherPlayers = () =>
    allAccounts().filter((a) => a.id !== user?.id)
      .map((a) => ({ account: a, data: read(dataKey(a.id)) }))
      .filter((x) => x.data)
      .map(({ account, data: d }) => ({ id: account.id, name: account.name, progress: { ...INITIAL_PROGRESS, ...d.progress } }))

  // 친구 방 방문: 방 주인의 저장 데이터에 방문 기록과 CELL을 더한다. 같은 사람은 하루 1번만 보상.
  const visitFriend = (friendId) => {
    const d = read(dataKey(friendId))
    if (!d || !user) return false
    const p = { ...INITIAL_PROGRESS, ...d.progress }
    const date = new Date().toISOString().slice(0, 10)
    if (p.visitors.some((v) => v.fromId === user.id && v.date === date)) return false
    d.cell = (d.cell ?? 0) + VISIT_REWARD
    d.progress = {
      ...d.progress,
      visitors: [{ fromId: user.id, from: user.name, date }, ...p.visitors].slice(0, MAX_VISIT_LOG),
      visitIncome: p.visitIncome + VISIT_REWARD,
    }
    write(dataKey(friendId), d)
    return true
  }

  const updateFriendGame = (friendId, change) => {
    const d = read(dataKey(friendId))
    if (!d?.progress?.minigame) return
    d.progress.minigame = change(d.progress.minigame)
    write(dataKey(friendId), d)
  }

  return (
    <StoreContext.Provider
      value={{
        user,
        cell: data?.cell ?? 0,
        owned: data?.owned ?? [],
        progress: data?.progress ?? INITIAL_PROGRESS,
        buy,
        login,
        signup,
        logout,
        setProgress,
        addCell,
        spendCell,
        track,
        checkIn,
        recordAttempt,
        resetProgress,
        replaceProgress,
        skipStory,
        otherPlayers,
        updateFriendGame,
        visitFriend,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export const useStore = () => useContext(StoreContext)
