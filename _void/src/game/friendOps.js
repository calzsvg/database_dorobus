// 친구가 내 방에서 한 일(방문, 셀 찾기, 실패, 좋아요)을 게임 상태 { cell, owned, progress }에 반영한다.
// 서버(server/auth.mjs)는 DB에 저장된 방 주인 상태에, 방 주인 화면(store.jsx)은 화면 상태에 같은 함수를 쓴다.
// 반영할 수 없으면(이미 방문함, 이미 찾아감, 이미 좋아요) null을 돌려준다.
import { MAX_VISIT_LOG, VISIT_REWARD } from './visits.js'

export const FRIEND_OPS = ['visit', 'found', 'fail', 'like']

export function applyFriendOp(state, kind, payload) {
  const progress = state?.progress || {}
  const mg = progress.minigame
  switch (kind) {
    case 'visit': {
      const visitors = progress.visitors || []
      if (visitors.some((v) => v.fromId === payload.fromId && v.date === payload.date)) return null
      return {
        ...state,
        cell: (state.cell ?? 0) + VISIT_REWARD,
        progress: {
          ...progress,
          visitors: [{ fromId: payload.fromId, from: payload.from, date: payload.date }, ...visitors].slice(0, MAX_VISIT_LOG),
          visitIncome: (progress.visitIncome || 0) + VISIT_REWARD,
        },
      }
    }
    case 'found':
      if (!mg?.stake || mg.foundBy) return null
      return withGame(state, { ...mg, foundBy: payload.by, foundAt: payload.at, plays: (mg.plays || 0) + 1 })
    case 'fail':
      if (!mg) return null
      return withGame(state, { ...mg, fails: (mg.fails || 0) + 1 })
    case 'like':
      if (!mg || mg.likedBy?.includes(payload.userId)) return null
      return withGame(state, { ...mg, likes: (mg.likes || 0) + 1, likedBy: [...(mg.likedBy || []), payload.userId] })
    default:
      return null
  }
}

const withGame = (state, minigame) => ({ ...state, progress: { ...state.progress, minigame } })

// 화면 쪽: 서버가 이미 반영한 일을 화면 상태에 다시 반영한다(반영할 수 없는 일은 건너뜀).
export const applyFriendEvents = (state, events) =>
  events.reduce((s, e) => applyFriendOp(s, e.kind, e.payload) ?? s, state)
