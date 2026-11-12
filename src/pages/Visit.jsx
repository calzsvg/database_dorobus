import { useEffect, useMemo, useRef, useState } from 'react'
import { PostFX } from '../world/Atmosphere.jsx'
import { Canvas } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useNavigate, useParams } from 'react-router-dom'
import * as THREE from 'three'
import Room from '../myroom/Room.jsx'
import Robot, { INITIAL_VIEW, viewOffset } from '../myroom/Robot.jsx'
import ViewControls from '../myroom/ViewControls.jsx'
import Portal from '../myroom/Portal.jsx'
import Door from '../myroom/Door.jsx'
import Car from '../myroom/Car.jsx'
import { PianoSofa, OwnedFurniture, ComputerDesk } from '../myroom/Furniture.jsx'
import RoomHud from '../components/RoomHud.jsx'
import { useKeyboard } from '../myroom/useKeyboard.js'
import { useProximity } from '../game/useProximity.js'
import { useStore } from '../store.jsx'
import { EXAMPLE_ROOMS, HIDE_SPOTS, SPOT_POS, spotsFor } from '../minigames/treasure.js'
import { DAILY_STEALS, VISITOR_TRIES, raidsOf } from '../game/routine.js'
import { VISIT_REWARD } from '../game/visits.js'

// 친구 마이룸(3D)에 놀러 가서 숨겨진 CELL 찾기. 찾으면 가져오고, 못 찾으면 주인이 지킨 보상을 받는다.
export default function Visit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, progress, setProgress, addCell, otherPlayers, playersReady, friendAction, track } = useStore()

  // 방 정보: 다른 계정(서버 DB) 또는 예시 방
  const loadRoom = () => {
    const ex = EXAMPLE_ROOMS.find((r) => r.id === id)
    if (ex) return { ...ex, minigame: { ...ex.minigame } }
    const p = otherPlayers().find((x) => x.id === id)
    if (!p) return null
    return { id, name: p.name, owned: p.owned || [], minigame: p.progress.minigame }
  }
  const [room, setRoom] = useState(loadRoom)
  const busy = useRef(false)
  // 바로 이 주소로 들어오면 친구 목록이 늦게 올 수 있다
  useEffect(() => {
    if (!room && playersReady) setRoom(loadRoom())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playersReady])
  const [note, setNote] = useState('')
  const [next, setNext] = useState(null) // 결과 뒤 다음 행동: 'found' | 'out' | 'gone' | null
  const posRef = useRef(new THREE.Vector3(0, 0, 3))
  const targetRef = useRef(null)
  const view = useRef({ ...INITIAL_VIEW })

  const raids = raidsOf(progress)
  const mine = raids.rooms[id] || { tries: 0, found: false, searched: [] }
  const mg = room?.minigame
  const hasTreasure = !!(mg?.stake && !mg.foundBy)
  const triesLeft = Math.max(0, VISITOR_TRIES - mine.tries)
  const stealsLeft = Math.max(0, DAILY_STEALS - raids.steals)
  const liked = !!mg?.likedBy?.includes(user.id)
  const spots = useMemo(() => (room ? spotsFor(room.owned) : []), [room])

  useEffect(() => {
    if (!room) return
    track('visit', id, 'unique')
    if (!room.example) friendAction(id, 'visit').then((r) => r.ok && setNote(`방문 인사를 남겼어요. ${room.name}님이 방문 보상 ${VISIT_REWARD} CELL을 받았어요.`))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id])

  const { near, nearRef, onMove } = useProximity(spots.map((s) => ({ id: s, pos: SPOT_POS[s], radius: 2.4 })))

  const saveRaid = (patch, steals = raids.steals) =>
    setProgress({ raids: { ...raids, steals, rooms: { ...raids.rooms, [id]: { ...mine, ...patch } } } })

  // 결과 문장과 함께 다음 행동 버튼을 고른다: found(찾음) · out(오늘 기회 끝) · gone(숨긴 셀 없음) · null(더 살펴보기)
  const tell = (text, kind = null) => {
    setNote(text)
    setNext(kind)
  }

  const search = async (spot) => {
    if (busy.current) return
    if (!hasTreasure) return tell(mg?.foundBy ? `이미 ${mg.foundBy}님이 찾아갔어요. 주인이 다시 숨기면 도전할 수 있어요.` : '이 방에는 아직 숨긴 셀이 없어요.', 'gone')
    if (mine.found) return tell('오늘 이 방의 셀은 이미 찾았어요!', 'found')
    if (triesLeft <= 0) return tell('오늘은 이 방에서 더 살펴볼 수 없어요. 내일 다시 와요!', 'out')
    if (mine.searched?.includes(spot)) return tell('이미 살펴본 곳이에요.')
    const tries = mine.tries + 1
    const searched = [...(mine.searched || []), spot]
    if (spot === mg.hideIn) {
      if (room.example) {
        saveRaid({ tries, searched, found: true })
        return tell(`💎 찾았다! 연습용 예시 방이라 셀은 가져오지 않아요. 진짜 친구 방에서는 ${mg.stake} CELL을 가져와요.`, 'found')
      }
      if (stealsLeft <= 0) {
        saveRaid({ tries, searched, found: true })
        return tell(`💎 찾았다! 하지만 오늘은 이미 ${DAILY_STEALS}번 가져와서 셀은 그대로 두었어요.`, 'out')
      }
      busy.current = true
      const res = await friendAction(id, 'found')
      busy.current = false
      if (!res.ok) {
        if (res.minigame) setRoom((r) => ({ ...r, minigame: res.minigame }))
        return tell('앗, 방금 다른 친구가 먼저 찾아갔어요. 주인이 다시 숨기면 도전할 수 있어요.', 'gone')
      }
      addCell(mg.stake)
      setRoom((r) => ({ ...r, minigame: res.minigame }))
      saveRaid({ tries, searched, found: true }, raids.steals + 1)
      track('steal')
      return tell(`💎 찾았다! ${HIDE_SPOTS[spot].name}에 숨겨진 ${mg.stake} CELL을 가져왔어요!`, 'found')
    }
    saveRaid({ tries, searched })
    if (tries >= VISITOR_TRIES) {
      if (!room.example) friendAction(id, 'fail')
      return tell(`💨 ${HIDE_SPOTS[spot].name}에는 없어요. 기회를 다 썼어요! ${room.name}님이 잘 숨겼네요.`, 'out')
    }
    tell(`💨 ${HIDE_SPOTS[spot].name}에는 없어요. 한 번 더 살펴볼 수 있어요.`)
  }

  const like = () => {
    if (liked || !mg) return
    if (!room.example) friendAction(id, 'like')
    setRoom((r) => ({ ...r, minigame: { ...r.minigame, likes: (r.minigame.likes || 0) + 1, likedBy: [...(r.minigame.likedBy || []), user.id] } }))
    track('like')
  }

  const keys = useKeyboard((code) => {
    if (code === 'KeyE' && nearRef.current) search(nearRef.current)
  })

  if (!room) {
    return (
      <div className="page">
        <p style={{ padding: 40 }}>방을 찾을 수 없어요. <button className="link" onClick={() => navigate('/play')}>미니게임으로</button></p>
      </div>
    )
  }

  const start = posRef.current.clone().add(viewOffset(view.current))
  return (
    <div className="room-page">
      <Canvas shadows="soft" camera={{ position: [start.x, start.y, start.z], fov: 50 }} dpr={[1, 2]}>
        <color attach="background" args={['#1b1410']} />
        <ambientLight intensity={0.75} />
        <hemisphereLight args={['#fff4e6', '#5a3a22', 0.5]} />
        <directionalLight position={[-6, 12, 8]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <ViewControls view={view} />
        <Room />
        <Door locked={false} />
        <PianoSofa position={SPOT_POS.sofa} rotation={[0, Math.PI / 4, 0]} />
        <ComputerDesk position={[-9.25, 0, 0.2]} />
        <OwnedFurniture owned={room.owned} />
        <Car checked />
        <Portal active={false} onClick={() => {}} />
        {spots.map((s) => {
          const searched = mine.searched?.includes(s)
          const found = searched && s === mg?.hideIn && mine.found
          return (
            <Html key={s} position={[SPOT_POS[s][0], 3.2, SPOT_POS[s][2]]} center zIndexRange={[1, 0]}>
              <div className={`spot-tag${found ? ' found' : searched ? ' miss' : ''}`}>{found ? '💎' : searched ? '💨' : '❔'} {HIDE_SPOTS[s].name}</div>
            </Html>
          )
        })}
        <Robot posRef={posRef} targetRef={targetRef} keys={keys} view={view} name={user.name} onMove={onMove} />
        <PostFX bloom={0.5} />
      </Canvas>

      <RoomHud title={`${room.name}의 방`} backTo="/play" backLabel="← 미니게임" />
      <div className="hud raid-hud">
        <b>💎 「{mg?.title || '보물찾기'}」</b>
        <span>{hasTreasure ? `숨겨진 셀 ${mg.stake} CELL` : mg?.foundBy ? `${mg.foundBy}님이 이미 찾아감` : '숨긴 셀 없음'}</span>
        <span>남은 살펴보기 {mine.found ? 0 : triesLeft} / {VISITOR_TRIES}</span>
        <span>오늘 가져온 횟수 {raids.steals} / {DAILY_STEALS}</span>
        <button className="btn-ghost" onClick={like} disabled={liked}>{liked ? '좋아요 완료 ❤️' : '좋아요 ♡'}</button>
      </div>
      {near && (
        <button className="hud prompt" onClick={() => search(near)}>E · {HIDE_SPOTS[near].name} 살펴보기</button>
      )}
      {note && (
        <div className="hud raid-note" role="status">
          <p>{note}</p>
          {next === 'found' && (
            <div className="raid-next">
              <button className="btn-primary" onClick={() => navigate('/myroom', { state: { panel: 'shop' } })}>얻은 CELL로 가구 보기</button>
              <button className="btn-ghost" onClick={() => navigate('/myroom', { state: { panel: 'editor' } })}>나도 셀 숨기기</button>
            </div>
          )}
          {(next === 'out' || next === 'gone') && (
            <div className="raid-next">
              <button className="btn-primary" onClick={() => navigate('/play', { state: { tab: 'friends' } })}>다른 방 도전하기</button>
              {next === 'out' && <span className="raid-later">⏰ 내일 다시 도전하기 · 살펴보기 기회는 매일 다시 채워져요</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
