import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ACCOUNTS, DEMO_STAGES, validateSignup } from './accounts.js'
import { INITIAL_PROGRESS, STORY_DONE } from './game/progress.js'
import { applyFriendEvents, applyFriendOp } from './game/friendOps.js'
import { checkInPatch, dailyOf } from './game/routine.js'

// 2D 화면(대시보드, 상점)과 3D 화면(마이룸)이 같이 쓰는 상태.
// 계정별 CELL·가구·진행은 서버 DB(미니PC PostgreSQL)에 저장한다. 브라우저에는 로그인 쿠키만 남는다.
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

// 서버 API(server/auth.mjs). 로그인 세션은 HttpOnly 쿠키, 게임 상태는 서버 DB에 저장한다.
// 서버에 DB API가 없을 때(개발 서버에 DB 주소가 없음, API 없는 정적 사이트)만 브라우저 localStorage 체험 모드로 동작한다.
const DEV = import.meta.env.DEV
const SAVE_DELAY = 1500 // 마지막 변경 뒤 이만큼 기다렸다가 저장 (ms)
const SYNC_EVERY = 60_000 // 친구 방문·좋아요 반영과 친구 목록 갱신 주기 (ms)

async function api(path, body = {}, { keepalive = false } = {}) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      keepalive,
    })
    return { status: res.status, body: await res.json().catch(() => ({})) }
  } catch {
    return { status: 0, body: {} }
  }
}
// DB API가 아예 없는 서버인가 (이때만 브라우저 체험 모드)
const noServer = (status) => status === 404 || status === 405 || (DEV && status === 503)
const OFFLINE = '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// ---- 브라우저 체험 모드 전용 (DB 없는 개발 서버) ----
const SESSION_KEY = 'dorobus.session'
const SIGNUP_KEY = 'dorobus.accounts'
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
const roleError = (u, role) =>
  u.role === role ? null : u.role === 'student' ? '학생 계정이에요. 학생 탭에서 로그인해 주세요.' : '강사 계정이에요. 강사 탭에서 로그인해 주세요.'
const startState = (u) => ({ cell: u.cell ?? 0, owned: [], progress: u.preset })
const normalize = (saved) => ({ cell: saved.cell ?? 0, owned: saved.owned ?? [], progress: { ...INITIAL_PROGRESS, ...saved.progress } })
const loadLocal = (u) => normalize(read(dataKey(u.id)) || startState(u))

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(null)
  const [data, setData] = useState(null)
  const [players, setPlayers] = useState([])
  const [playersReady, setPlayersReady] = useState(false)
  const mode = useRef(null) // 'db' | 'local'
  const seen = useRef(0) // 화면 상태에 이미 반영한 친구 일 번호
  const dataRef = useRef(null)
  const pending = useRef(null) // 아직 저장하지 않은 최신 상태
  const saving = useRef(false)
  const timer = useRef(null)
  const skipSave = useRef(false) // 서버에서 막 받은 상태는 다시 저장하지 않는다
  dataRef.current = data

  const refreshPlayers = async () => {
    if (mode.current !== 'db') return
    const r = await api('/api/players')
    if (r.status === 200) {
      setPlayers(r.body.players || [])
      setPlayersReady(true)
    }
  }

  // 서버가 준 계정·게임 상태로 시작한다. 서버에 상태가 없으면(첫 로그인) 시작 상태를 만들어 바로 저장한다.
  // 예전에 이 브라우저에 남아 있던 진행(localStorage)이 있으면 그것을 서버로 한 번 옮기고 브라우저에서는 지운다.
  const adopt = ({ user: profile, state, seenEvent }) => {
    const u = fromDb(profile)
    const legacy = read(dataKey(u.id))
    mode.current = 'db'
    seen.current = seenEvent || 0
    skipSave.current = !!state
    setUser(u)
    setData(normalize(state || legacy || startState(u)))
    remove(dataKey(u.id))
    remove(SESSION_KEY)
    setPlayersReady(false)
    refreshPlayers()
  }

  // 새로고침: 쿠키 세션이 살아 있으면 서버에서 이어서 불러온다
  useEffect(() => {
    let alive = true
    api('/api/session').then((r) => {
      if (!alive) return
      if (r.status === 200) adopt(r.body)
      else if (noServer(r.status)) {
        mode.current = 'local'
        const saved = read(SESSION_KEY)
        const u = saved && typeof saved === 'object' ? fromDb(saved) : findUser(saved)
        if (u) {
          setUser(u)
          setData(loadLocal(u))
        }
        setPlayersReady(true)
      } else mode.current = 'db'
      setReady(true)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 서버 저장: 한 번에 하나씩, 저장 중에 바뀐 것은 끝난 뒤 이어서 저장한다
  const flush = async ({ keepalive = false } = {}) => {
    clearTimeout(timer.current)
    if (mode.current !== 'db' || saving.current || !pending.current) return
    const state = pending.current
    pending.current = null
    saving.current = true
    const r = await api('/api/state', { state, seenEvent: seen.current }, { keepalive })
    saving.current = false
    if (r.status === 200) {
      seen.current = r.body.seenEvent ?? seen.current
      // 친구가 내 방에서 한 일(서버에는 이미 반영됨)을 화면에도 반영한다
      if (r.body.events?.length) setData((d) => (d ? applyFriendEvents(d, r.body.events) : d))
    } else if (r.status === 401) {
      setUser(null)
      setData(null)
      return
    } else pending.current ??= state // 실패: 잠시 뒤 다시 저장
    if (pending.current) timer.current = setTimeout(flush, r.status === 200 ? SAVE_DELAY : 5000)
  }

  useEffect(() => {
    if (!user || !data) return
    if (mode.current === 'local') return void write(dataKey(user.id), data)
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    pending.current = data
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data])

  // 탭을 닫거나 숨길 때 남은 변경을 바로 보낸다. 1분마다 친구 일 반영·친구 목록 갱신.
  useEffect(() => {
    if (!user) return
    const hide = () => {
      if (document.visibilityState === 'hidden' && pending.current) flush({ keepalive: JSON.stringify(pending.current).length < 60000 })
    }
    const sync = setInterval(() => {
      if (mode.current !== 'db' || document.visibilityState === 'hidden') return
      if (!pending.current && dataRef.current) pending.current = dataRef.current
      flush()
      refreshPlayers()
    }, SYNC_EVERY)
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', hide)
    return () => {
      clearInterval(sync)
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', hide)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const startLocal = (u, session) => {
    mode.current = 'local'
    setUser(u)
    setData(loadLocal(u))
    write(SESSION_KEY, session)
  }

  // 로그인: 서버가 DB의 계정·비밀번호로 확인하고 세션 쿠키를 준다. 성공하면 null, 실패하면 안내 문구.
  const login = async (id, password, role) => {
    const r = await api('/api/auth/login', { id, password })
    if (r.status === 200) {
      const err = roleError(fromDb(r.body.user), role)
      if (err) {
        await api('/api/auth/logout')
        return err
      }
      adopt(r.body)
      return null
    }
    if (!noServer(r.status)) return r.status === 0 || r.status >= 500 ? OFFLINE : r.body.error || '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
    // DB 없는 개발 서버: 브라우저 체험 계정
    const u = findUser(id.trim().toLowerCase())
    if (!u || u.password !== password) return '아이디 또는 비밀번호가 맞지 않아요.'
    const err = roleError(u, role)
    if (err) return err
    startLocal(u, u.id)
    return null
  }

  // 회원가입: 학생 계정만 만든다(강사 계정은 관리자가 등록).
  const signup = async (form) => {
    const checked = validateSignup(form, [])
    if (checked.error) return checked.error
    const r = await api('/api/auth/signup', form)
    if (r.status === 200) {
      adopt(r.body)
      return null
    }
    if (!noServer(r.status)) return r.status === 0 || r.status >= 500 ? OFFLINE : r.body.error || '가입하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
    const { error, account } = validateSignup(form, allAccounts().map((a) => a.id))
    if (error) return error
    write(SIGNUP_KEY, [...signedUpAccounts(), account])
    startLocal(account, account.id)
    return null
  }

  const logout = async () => {
    if (mode.current === 'db') {
      if (pending.current) {
        clearTimeout(timer.current)
        await api('/api/state', { state: pending.current, seenEvent: seen.current })
        pending.current = null
      }
      await api('/api/auth/logout')
    } else remove(SESSION_KEY)
    setUser(null)
    setData(null)
    setPlayers([])
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

  // G · 친구 방: 다른 계정의 이름·가구·보물찾기·순위 기록 (서버 DB, 1분마다 갱신)
  const otherPlayers = () => {
    if (mode.current === 'db') return players.map((p) => ({ ...p, progress: { ...INITIAL_PROGRESS, ...p.progress } }))
    return allAccounts().filter((a) => a.id !== user?.id)
      .map((a) => ({ account: a, data: read(dataKey(a.id)) }))
      .filter((x) => x.data)
      .map(({ account, data: d }) => ({ id: account.id, name: account.name, owned: d.owned || [], progress: { ...INITIAL_PROGRESS, ...d.progress } }))
  }

  // 친구 방에서 한 일: 'visit'(방문 보상, 같은 사람 하루 1번) · 'found'(숨긴 셀 찾음) · 'fail'(못 찾음) · 'like'
  // 서버가 방 주인 상태에 반영한다. 이미 된 일이면 { ok: false }.
  const friendAction = async (friendId, kind) => {
    if (!user) return { ok: false }
    if (mode.current === 'db') {
      const r = await api('/api/friend', { friendId, kind })
      if (r.status !== 200) return { ok: false }
      setPlayers((list) => list.map((p) => (p.id === friendId ? { ...p, progress: { ...p.progress, minigame: r.body.minigame } } : p)))
      return { ok: true, minigame: r.body.minigame }
    }
    const d = read(dataKey(friendId))
    if (!d) return { ok: false }
    const now = new Date()
    const payload = {
      visit: { fromId: user.id, from: user.name, date: now.toISOString().slice(0, 10) },
      found: { by: user.name, at: now.toISOString() },
      fail: {},
      like: { userId: user.id },
    }[kind]
    const next = applyFriendOp({ ...d, progress: { ...INITIAL_PROGRESS, ...d.progress } }, kind, payload)
    if (!next) return { ok: false }
    write(dataKey(friendId), next)
    return { ok: true, minigame: next.progress.minigame }
  }

  if (!ready) return <div className="store-loading">불러오는 중…</div>

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
        playersReady,
        refreshPlayers,
        friendAction,
      }}
    >
      {children}
    </StoreContext.Provider>
  )
}

export const useStore = () => useContext(StoreContext)
