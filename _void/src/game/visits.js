// 친구 방 방문: 누군가 내 방에 놀러 오면 방 주인이 CELL을 조금 더 얻는다.
// 좋아요가 많은 방일수록 「랜덤 방문」에서 뽑힐 확률이 높다.
export const VISIT_REWARD = 5 // 방문 1번당 방 주인이 받는 CELL (같은 사람은 하루 1번만)
export const MAX_VISIT_LOG = 20

// 랜덤 방문 가중치: 기본 1 + 좋아요 수
export const visitWeight = (room) => 1 + (room.minigame?.likes || 0)

export function pickRandomRoom(rooms, rand = Math.random) {
  const total = rooms.reduce((s, r) => s + visitWeight(r), 0)
  let n = rand() * total
  for (const r of rooms) {
    n -= visitWeight(r)
    if (n < 0) return r
  }
  return rooms[rooms.length - 1]
}

export const visitChance = (rooms, room) => {
  const total = rooms.reduce((s, r) => s + visitWeight(r), 0)
  return total ? Math.round((visitWeight(room) / total) * 100) : 0
}
