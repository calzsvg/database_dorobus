// 로그인·회원가입, 로그인 세션, 게임 진행 저장 API. 모든 기억은 서버 DB(dorobus 스키마)에 둔다.
// - DOROBUS_DATABASE_URL이 없으면 createAuth는 null → API는 503 (개발 서버에서만 화면이 브라우저 체험 모드로 동작).
// - pg 패키지는 DB 주소가 있을 때만 불러온다.
// - 비밀번호는 scrypt 해시만, 세션 토큰은 SHA-256 해시만 DB에 둔다. 토큰 원문은 HttpOnly 쿠키로만 오간다.
// - 게임 상태 { cell, owned, progress }는 user_game_states(010)에 계정마다 JSON 한 덩어리로 저장한다.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { validateSignup } from '../src/accounts.js'
import { applyFriendOp, FRIEND_OPS } from '../src/game/friendOps.js'

const scryptAsync = promisify(scrypt)
const N = 16384, R = 8, P = 1, KEY_LENGTH = 32

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : []
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, 'base64')
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
  return timingSafeEqual(key, expected)
}

export const SESSION_COOKIE = 'dorobus_sid'
const SESSION_DAYS = 30
const STATE_LIMIT = 262144 // 게임 상태 JSON 최대 크기(바이트)

const PROFILE_COLUMNS = `u.id AS uid, u.login_id, u.display_name, u.role, u.birth_date::text AS birth_date, a.age`
const PROFILE_SQL = `SELECT ${PROFILE_COLUMNS}, u.password_hash
  FROM dorobus.users u JOIN dorobus.users_with_age a ON a.id = u.id WHERE u.login_id = $1`
const SESSION_SQL = `SELECT ${PROFILE_COLUMNS}, s.last_seen_at < now() - interval '1 hour' AS stale
  FROM dorobus.user_sessions s JOIN dorobus.users u ON u.id = s.user_id JOIN dorobus.users_with_age a ON a.id = u.id
  WHERE s.token_hash = $1 AND s.expires_at > now()`
const toProfile = (row) => ({ id: row.login_id, name: row.display_name, role: row.role, birthDate: row.birth_date, age: row.age })
const text = (v, max) => (typeof v === 'string' && v.length <= max ? v : null)
const tokenHash = (token) => createHash('sha256').update(token).digest()
const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)
const isState = (s) => s && typeof s === 'object' && !Array.isArray(s) && Number.isFinite(s.cell) && Array.isArray(s.owned)
  && s.progress && typeof s.progress === 'object' && !Array.isArray(s.progress)

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

export function createAuth(databaseUrl, { secureCookie = true } = {}) {
  if (!databaseUrl) return null
  let poolPromise
  const pool = () => (poolPromise ??= import('pg').then(({ default: pg }) => new pg.Pool({ connectionString: databaseUrl, max: 6 })))
  const query = async (sql, params) => (await pool()).query(sql, params)
  async function tx(fn) {
    const client = await (await pool()).connect()
    try {
      await client.query('BEGIN')
      const out = await fn(client)
      await client.query(out?.rollback ? 'ROLLBACK' : 'COMMIT')
      return out
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  }

  // 1시간마다: 나이(009) 갱신, 끝난 세션 정리
  const hourly = () => {
    query('SELECT dorobus.refresh_user_ages()').catch(() => {})
    query('DELETE FROM dorobus.user_sessions WHERE expires_at < now()').catch(() => {})
  }
  hourly()
  const timer = setInterval(hourly, 3600_000)
  timer.unref?.()

  const cookie = (token) => token
    ? `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secureCookie ? '; Secure' : ''}`
    : `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie ? '; Secure' : ''}`

  async function sessionUser(token) {
    if (!validToken(token)) return null
    const hash = tokenHash(token)
    const row = (await query(SESSION_SQL, [hash])).rows[0]
    if (!row) return null
    if (row.stale) query(`UPDATE dorobus.user_sessions SET last_seen_at = now(), expires_at = now() + interval '${SESSION_DAYS} days' WHERE token_hash = $1`, [hash]).catch(() => {})
    return row
  }

  // 로그인 직후·새로고침 때 화면에 줄 것: 계정 정보, 저장된 게임 상태(없으면 null), 이미 반영된 친구 일 번호
  async function snapshot(row) {
    const saved = (await query('SELECT state FROM dorobus.user_game_states WHERE user_id = $1', [row.uid])).rows[0]
    const last = (await query('SELECT max(id) AS id FROM dorobus.user_game_events WHERE user_id = $1', [row.uid])).rows[0]
    return { user: toProfile(row), state: saved?.state ?? null, seenEvent: Number(last?.id ?? 0) }
  }

  async function startSession(row) {
    const token = randomBytes(32).toString('base64url')
    await query(`INSERT INTO dorobus.user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [tokenHash(token), row.uid])
    return { status: 200, body: await snapshot(row), cookie: cookie(token) }
  }

  async function login(input) {
    const id = text(input?.id, 50), password = text(input?.password, 200)
    if (!id || !password) return { status: 400, body: { error: '아이디와 비밀번호를 입력해 주세요.' } }
    const row = (await query(PROFILE_SQL, [id.trim().toLowerCase()])).rows[0]
    if (!row || !(await verifyPassword(password, row.password_hash))) return { status: 401, body: { error: '아이디 또는 비밀번호가 맞지 않아요.' } }
    return startSession(row)
  }

  async function signup(input) {
    const form = Object.fromEntries(['id', 'name', 'password', 'passwordConfirm', 'birthDate'].map((k) => [k, text(input?.[k], 200) ?? '']))
    const { error, account } = validateSignup(form, [])
    if (error) return { status: 400, body: { error } }
    try {
      await query('SELECT dorobus.register_local_user($1, $2, $3, $4)',
        [account.id, account.name, account.birthDate, await hashPassword(account.password)])
    } catch (e) {
      if (e.code === '23505') return { status: 409, body: { error: '이미 쓰고 있는 아이디예요.' } }
      if (e.code === '23502' || e.code === '23514') return { status: 400, body: { error: '입력한 내용을 다시 확인해 주세요.' } }
      throw e
    }
    return startSession((await query(PROFILE_SQL, [account.id])).rows[0])
  }

  async function logout(_input, { token }) {
    if (validToken(token)) await query('DELETE FROM dorobus.user_sessions WHERE token_hash = $1', [tokenHash(token)])
    return { status: 200, body: {}, cookie: cookie(null) }
  }

  // 아래는 로그인한 사람만: me = 세션의 계정
  async function session(_input, _ctx, me) {
    return { status: 200, body: await snapshot(me) }
  }

  // 게임 상태 저장. 화면이 아직 모르는 친구 일(seenEvent 이후)은 서버가 저장할 상태에 반영하고 화면에도 돌려준다.
  async function saveState(input, _ctx, me) {
    const state = input?.state
    const seen = Number.isSafeInteger(input?.seenEvent) && input.seenEvent >= 0 ? input.seenEvent : 0
    if (!isState(state) || JSON.stringify(state).length > STATE_LIMIT) return { status: 400, body: {} }
    return tx(async (c) => {
      await c.query('SELECT 1 FROM dorobus.user_game_states WHERE user_id = $1 FOR UPDATE', [me.uid])
      const events = (await c.query('SELECT id, kind, payload FROM dorobus.user_game_events WHERE user_id = $1 ORDER BY id', [me.uid])).rows
        .map((e) => ({ id: Number(e.id), kind: e.kind, payload: e.payload }))
      const fresh = events.filter((e) => e.id > seen)
      const final = fresh.reduce((s, e) => applyFriendOp(s, e.kind, e.payload) ?? s, state)
      await c.query(`INSERT INTO dorobus.user_game_states (user_id, state) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, revision = dorobus.user_game_states.revision + 1, updated_at = now()`, [me.uid, final])
      const top = events.length ? events[events.length - 1].id : 0
      if (top) await c.query('DELETE FROM dorobus.user_game_events WHERE user_id = $1 AND id <= $2', [me.uid, top])
      return { status: 200, body: { events: fresh, seenEvent: Math.max(seen, top) } }
    })
  }

  // 친구 방 목록·순위표에 필요한 것만: 이름, 가구, 보물찾기, 피아노·코딩 기록
  async function players(_input, _ctx, me) {
    const { rows } = await query(`SELECT u.login_id, u.display_name, g.state->'owned' AS owned,
        jsonb_build_object('minigame', g.state->'progress'->'minigame', 'piano', g.state->'progress'->'piano',
          'pianoBest', g.state->'progress'->'pianoBest', 'bestBlocks', g.state->'progress'->'bestBlocks') AS progress
      FROM dorobus.user_game_states g JOIN dorobus.users u ON u.id = g.user_id
      WHERE g.user_id <> $1 ORDER BY u.login_id LIMIT 500`, [me.uid])
    const clean = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null))
    return { status: 200, body: { players: rows.map((r) => ({ id: r.login_id, name: r.display_name, owned: Array.isArray(r.owned) ? r.owned : [], progress: clean(r.progress) })) } }
  }

  // 친구 방에서 한 일: 방 주인 상태에 바로 반영하고 주인 화면이 알 수 있게 기록한다. 이미 된 일이면 409.
  async function friend(input, _ctx, me) {
    const friendId = text(input?.friendId, 50), kind = input?.kind
    if (!friendId || !FRIEND_OPS.includes(kind) || friendId === me.login_id) return { status: 400, body: {} }
    const now = new Date()
    const payload = {
      visit: { fromId: me.login_id, from: me.display_name, date: now.toISOString().slice(0, 10) },
      found: { by: me.display_name, at: now.toISOString() },
      fail: {},
      like: { userId: me.login_id },
    }[kind]
    return tx(async (c) => {
      const row = (await c.query(`SELECT g.user_id, g.state FROM dorobus.user_game_states g JOIN dorobus.users u ON u.id = g.user_id
        WHERE u.login_id = $1 FOR UPDATE OF g`, [friendId])).rows[0]
      if (!row) return { status: 404, body: {}, rollback: true }
      const next = applyFriendOp(row.state, kind, payload)
      if (!next) return { status: 409, body: {}, rollback: true }
      await c.query('UPDATE dorobus.user_game_states SET state = $2, revision = revision + 1, updated_at = now() WHERE user_id = $1', [row.user_id, next])
      await c.query('INSERT INTO dorobus.user_game_events (user_id, kind, payload) VALUES ($1, $2, $3)', [row.user_id, kind, payload])
      return { status: 200, body: { minigame: next.progress?.minigame ?? null } }
    })
  }

  const actions = { login, signup, logout, session, saveState, players, friend }
  // 요청 하나 처리: { status, body, cookie? }
  async function handle(route, input, token) {
    const r = ROUTES[route]
    if (r.signedIn) {
      const me = await sessionUser(token)
      if (!me) return { status: 401, body: {}, cookie: token ? cookie(null) : undefined }
      return actions[r.action](input, { token }, me)
    }
    return actions[r.action](input, { token })
  }

  return { handle, close: async () => { clearInterval(timer); if (poolPromise) await (await poolPromise).end() } }
}

// 경로별: 처리 함수, 로그인 필요 여부, 본문 최대 크기, 요청 수 제한 기준(ip: 접속 주소, session: 세션)
export const ROUTES = {
  '/api/auth/login': { action: 'login', limit: 4096, by: 'ip' },
  '/api/auth/signup': { action: 'signup', limit: 4096, by: 'ip' },
  '/api/auth/logout': { action: 'logout', limit: 1024, by: 'session' },
  '/api/session': { action: 'session', signedIn: true, limit: 1024, by: 'session' },
  '/api/state': { action: 'saveState', signedIn: true, limit: STATE_LIMIT + 1024, by: 'session' },
  '/api/players': { action: 'players', signedIn: true, limit: 1024, by: 'session' },
  '/api/friend': { action: 'friend', signedIn: true, limit: 1024, by: 'session' },
}

// JSON 본문 읽기(크기 제한). 너무 크면 null, JSON이 아니면 예외
export async function readJson(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  return size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}

// 미니PC 서버와 개발 서버가 같이 쓰는 요청 처리. check(req)가 false면 403.
export async function serveAuth(auth, route, req, res, { check = () => true, allow = () => true } = {}) {
  const end = (status, value, setCookie) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(setCookie ? { 'Set-Cookie': setCookie } : {}) })
    res.end(JSON.stringify(value))
  }
  if (req.method !== 'POST') return end(405, {})
  if (!check(req)) return end(403, {})
  if (!auth) return end(503, {})
  if (!req.headers['content-type']?.startsWith('application/json')) return end(415, {})
  const token = readCookie(req.headers.cookie, SESSION_COOKIE)
  if (!allow(req, ROUTES[route], token)) return end(429, {})
  try {
    const input = await readJson(req, ROUTES[route].limit)
    if (!input) return end(413, {})
    const { status, body, cookie } = await auth.handle(route, input, token)
    return end(status, body, cookie)
  } catch {
    return end(503, {})
  }
}

// 개발 서버(npm run dev)용: .env.local의 DOROBUS_DATABASE_URL이 있으면 로컬 DB에 저장한다(없으면 503 → 화면은 브라우저 체험 모드).
export function localAuth(databaseUrl) {
  const auth = createAuth(databaseUrl, { secureCookie: false })
  const check = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    && /^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '') && req.headers.origin === `http://${req.headers.host}`
  return {
    name: 'local-dorobus-auth',
    apply: 'serve',
    configureServer(server) {
      for (const path of Object.keys(ROUTES)) {
        server.middlewares.use(path, (req, res) => void serveAuth(auth, path, req, res, { check }))
      }
    },
  }
}
