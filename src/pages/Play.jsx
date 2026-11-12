import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import GridProgram from '../missions/GridProgram.jsx'
import PianoGame from '../minigames/PianoGame.jsx'
import { useStore } from '../store.jsx'
import { EXAMPLE_ROOMS, HIDE_SPOTS, spotsFor } from '../minigames/treasure.js'
import { ACCOUNTS } from '../accounts.js'
import { VISIT_REWARD, pickRandomRoom, visitChance } from '../game/visits.js'
import { DAILY_STEALS, VISITOR_TRIES, guardEarned, raidsOf } from '../game/routine.js'

// 미니게임 허브: E 코딩 챌린지 · G 친구 방 보물찾기 · H 피아노 기억 게임
const LEVELS = [
  { id: 'lv1', name: '1단계 · 광장 산책', level: { cols: 4, rows: 3, start: [0, 2], goal: [3, 0], rocks: [[1, 1], [2, 0]], max: 8 }, best: 5 },
  { id: 'lv2', name: '2단계 · 동굴 미로', level: { cols: 5, rows: 4, start: [0, 3], goal: [4, 0], rocks: [[1, 2], [2, 2], [3, 0], [3, 1], [1, 0]], max: 10 }, best: 7 },
  // 정답 예: ↑ ↑ → → → → ↑ ↑ (8개)
  { id: 'lv3', name: '3단계 · 사파리 대탈출', level: { cols: 5, rows: 5, start: [0, 4], goal: [4, 0], rocks: [[1, 4], [1, 3], [2, 1], [3, 1], [3, 3], [4, 3], [1, 0]], max: 12 }, best: 8 },
]
// 같은 브라우저에 기록이 없어도 랭킹을 볼 수 있게 넣은 예시 기록
const EXAMPLE_RECORDS = { lv1: [['예시 · 도로 친구 하나', 6]], lv2: [['예시 · 도로 친구 하나', 8], ['예시 · 도로 친구 둘', 9]], lv3: [['예시 · 도로 친구 둘', 12]] }

export function Challenge() {
  const { user, progress, setProgress, otherPlayers, recordAttempt } = useStore()
  const [lv, setLv] = useState('lv1')
  const [msg, setMsg] = useState('')
  const L = LEVELS.find((x) => x.id === lv)
  const board = useMemo(() => {
    const rows = []
    if (progress.bestBlocks[lv]) rows.push({ name: `${user.name} (나)`, n: progress.bestBlocks[lv], me: true })
    otherPlayers().forEach((p) => p.progress.bestBlocks?.[lv] && rows.push({ name: p.name, n: p.progress.bestBlocks[lv] }))
    EXAMPLE_RECORDS[lv].forEach(([name, n]) => rows.push({ name, n, example: true }))
    return rows.sort((a, b) => a.n - b.n)
  }, [lv, progress.bestBlocks, otherPlayers, user.name])

  const onResult = (ok, n) => {
    recordAttempt(`challenge-${lv}`, ok)
    if (!ok) return
    const prev = progress.bestBlocks[lv]
    if (!prev || n < prev) {
      setProgress({ bestBlocks: { ...progress.bestBlocks, [lv]: n } })
      setMsg(`새 기록! 블록 ${n}개로 도착했어요.${n <= L.best ? ' 최소 블록 달성 🏆' : ` (최소 기록은 ${L.best}개)`}`)
    } else setMsg(`도착! 블록 ${n}개. 내 최고 기록은 ${prev}개예요.`)
  }

  return (
    <div className="play-grid">
      <section className="card play-card">
        <div className="tabs-inline">
          {LEVELS.map((x) => (
            <button key={x.id} className={lv === x.id ? 'chip on' : 'chip'} aria-pressed={lv === x.id} onClick={() => { setLv(x.id); setMsg('') }}>{x.name}</button>
          ))}
        </div>
        <p className="q">보이드를 ★까지 보내요. 블록을 적게 쓸수록 순위가 올라가요.</p>
        <GridProgram key={lv} level={L.level} onResult={onResult} />
        {msg && <p className="feedback good">{msg}</p>}
      </section>
      <section className="card play-card">
        <h3>🏆 {L.name} 랭킹</h3>
        <ol className="rank">
          {board.map((r, i) => (
            <li key={r.name + i} className={r.me ? 'me' : ''}>
              <b>{i + 1}</b><span>{r.name}</span><em>{r.n}블록</em>
            </li>
          ))}
          {board.length === 0 && <li className="small">아직 기록이 없어요.</li>}
        </ol>
        <p className="small">이 브라우저에서 플레이한 계정의 기록과 예시 기록이에요. 서버(DB)를 연결하면 모두의 기록이 모여요.</p>
      </section>
    </div>
  )
}

function FriendRooms() {
  const navigate = useNavigate()
  const { owned, otherPlayers, progress } = useStore()
  const raids = raidsOf(progress)
  const mine = progress.minigame
  const earned = guardEarned(mine)

  const rooms = [
    ...otherPlayers()
      .filter((p) => p.progress.minigame)
      .map((p) => ({ id: p.id, name: p.name, owned: p.owned || [], minigame: p.progress.minigame })),
    ...EXAMPLE_ROOMS,
  ]
  const go = (r) => navigate(`/visit/${r.id}`)
  const status = (mg) => (mg.stake && !mg.foundBy ? `💎 ${mg.stake} CELL 숨겨짐` : mg.foundBy ? '이미 누가 찾아감' : '숨긴 셀 없음')

  return (
    <div className="play-grid">
      <section className="card play-card">
        <h3>친구 방에서 셀 찾기</h3>
        <p className="small">친구 마이룸에 들어가 가구를 살펴봐요. 숨긴 셀을 찾으면 가져오고, 못 찾으면 친구가 지킨 보상을 받아요. 한 방에서 하루 {VISITOR_TRIES}번 살펴볼 수 있고, 하루 {DAILY_STEALS}번까지 가져올 수 있어요. (오늘 {raids.steals}/{DAILY_STEALS})</p>
        <div className="random-visit">
          <button className="btn-primary" onClick={() => go(pickRandomRoom(rooms))}>🎲 랜덤 방문</button>
          <small>좋아요가 많은 방일수록 자주 뽑혀요. 놀러 가면 방 주인이 {VISIT_REWARD} CELL을 받아요.</small>
        </div>
        <ul className="rooms">
          {rooms.map((r) => (
            <li key={r.id}>
              <span>
                <b>{r.name}</b>
                <small>「{r.minigame.title}」 · {status(r.minigame)} · ❤️ {r.minigame.likes} · 랜덤 방문 확률 {visitChance(rooms, r)}%</small>
              </span>
              <button className="btn-ghost" onClick={() => go(r)}>놀러가기</button>
            </li>
          ))}
        </ul>
        <p className="small">같은 브라우저에서 다른 체험 계정({ACCOUNTS.length}개)으로 셀을 숨기면 여기에 나타나요. 예시 방은 연습용이라 셀을 가져오지 않아요.</p>
      </section>
      <section className="card play-card">
        <h3>내 방에 숨긴 셀</h3>
        {mine?.stake ? (
          <p>
            {mine.foundBy ? `${mine.foundBy}님이 ${mine.stake} CELL을 찾아갔어요. 다시 숨겨 봐요!` : `「${mine.title}」 · ${HIDE_SPOTS[mine.hideIn]?.name}에 ${mine.stake} CELL 숨기는 중`}
            <br />못 찾고 돌아간 친구 {mine.fails || 0}명 · 받을 수 있는 지킨 보상 {earned} CELL
          </p>
        ) : (
          <p>아직 숨긴 셀이 없어요.</p>
        )}
        <div className="raid-next start">
          <button className="btn-primary" onClick={() => navigate('/myroom', { state: { panel: 'editor' } })}>{mine?.stake ? '숨김 위치 바꾸기' : '셀 숨기러 가기'}</button>
          <button className="btn-ghost" onClick={() => navigate('/myroom', { state: { panel: 'shop' } })}>내 방 꾸미기</button>
        </div>
        <div className="visit-log">
          <b>내 방 방문 기록 · 방문 수익 +{progress.visitIncome} CELL</b>
          {progress.visitors.length ? (
            <ul>
              {progress.visitors.slice(0, 5).map((v, i) => <li key={i}>{v.date} · {v.from}님이 놀러 왔어요 (+{VISIT_REWARD} CELL)</li>)}
            </ul>
          ) : (
            <small>아직 놀러 온 친구가 없어요. 좋아요를 많이 받으면 랜덤 방문에 더 자주 나와요.</small>
          )}
        </div>
        <p className="small">마이룸의 「🎮 셀 숨기기」에서 내 가구({spotsFor(owned).length}곳)에 셀을 숨기고 지킨 보상을 받을 수 있어요.</p>
      </section>
    </div>
  )
}

export default function Play() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState(location.state?.tab || 'challenge')
  const [piano, setPiano] = useState(false)
  return (
    <div className="page">
      <Header active="미니게임" />
      <main className="container play">
        <div className="play-head">
          <h1>미니게임</h1>
          <div className="tabs-inline">
            <button className={tab === 'challenge' ? 'chip on' : 'chip'} aria-pressed={tab === 'challenge'} onClick={() => setTab('challenge')}>코딩 챌린지</button>
            <button className={tab === 'friends' ? 'chip on' : 'chip'} aria-pressed={tab === 'friends'} onClick={() => setTab('friends')}>친구 방 셀 찾기</button>
            <button className="chip" onClick={() => setPiano(true)}>🎹 피아노 게임</button>
            <button className="chip" onClick={() => navigate('/myroom')}>마이룸 가기</button>
          </div>
        </div>
        {tab === 'challenge' ? <Challenge /> : <FriendRooms />}
      </main>
      {piano && <PianoGame onClose={() => setPiano(false)} />}
    </div>
  )
}
