// 프로토타입 로그인·회원가입 API. 계정 정보(아이디·이름·역할·생년월일·나이)와 비밀번호 확인을 DB(dorobus.users) 기준으로 한다.
// - DOROBUS_DATABASE_URL이 없으면 null을 돌려준다 → API는 503, 화면은 브라우저에 있는 체험 계정으로 동작한다.
// - pg 패키지는 DB 주소가 있을 때만 불러온다(미니PC처럼 node_modules가 없는 곳에서도 서버가 뜨도록).
// - 비밀번호 원문은 저장하지 않고 scrypt 해시만 DB에 둔다. 세션 토큰·권한 검사는 아직 없다(프로토타입).
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { validateSignup } from '../src/accounts.js'

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

const PROFILE_SQL = `SELECT u.login_id, u.display_name, u.role, u.birth_date::text AS birth_date, a.age, u.password_hash
  FROM dorobus.users u JOIN dorobus.users_with_age a ON a.id = u.id WHERE u.login_id = $1`
const toProfile = (row) => ({ id: row.login_id, name: row.display_name, role: row.role, birthDate: row.birth_date, age: row.age })
const text = (v, max) => (typeof v === 'string' && v.length <= max ? v : null)

export function createAuth(databaseUrl) {
  if (!databaseUrl) return null
  let poolPromise
  const pool = () => (poolPromise ??= import('pg').then(({ default: pg }) => new pg.Pool({ connectionString: databaseUrl, max: 4 })))
  const profile = async (loginId) => (await (await pool()).query(PROFILE_SQL, [loginId])).rows[0]
  // users.age(009)는 저장값이라 생일이 지나면 낡는다. 시작할 때와 1시간마다 갱신한다(009가 없으면 조용히 넘어감).
  const refreshAges = () => pool().then((p) => p.query('SELECT dorobus.refresh_user_ages()')).catch(() => {})
  refreshAges()
  const ageTimer = setInterval(refreshAges, 3600_000)
  ageTimer.unref?.()

  async function login(input) {
    const id = text(input?.id, 50), password = text(input?.password, 200)
    if (!id || !password) return { status: 400, body: { error: '아이디와 비밀번호를 입력해 주세요.' } }
    const row = await profile(id.trim().toLowerCase())
    if (!row || !(await verifyPassword(password, row.password_hash))) return { status: 401, body: { error: '아이디 또는 비밀번호가 맞지 않아요.' } }
    return { status: 200, body: { user: toProfile(row) } }
  }

  async function signup(input) {
    const form = Object.fromEntries(['id', 'name', 'password', 'passwordConfirm', 'birthDate'].map((k) => [k, text(input?.[k], 200) ?? '']))
    const { error, account } = validateSignup(form, [])
    if (error) return { status: 400, body: { error } }
    try {
      await (await pool()).query('SELECT dorobus.register_local_user($1, $2, $3, $4)',
        [account.id, account.name, account.birthDate, await hashPassword(account.password)])
    } catch (e) {
      if (e.code === '23505') return { status: 409, body: { error: '이미 쓰고 있는 아이디예요.' } }
      if (e.code === '23502' || e.code === '23514') return { status: 400, body: { error: '입력한 내용을 다시 확인해 주세요.' } }
      throw e
    }
    return { status: 200, body: { user: toProfile(await profile(account.id)) } }
  }

  return { login, signup, refreshAges, close: async () => { clearInterval(ageTimer); if (poolPromise) await (await poolPromise).end() } }
}

// JSON 본문 읽기(크기 제한). 너무 크면 null
export async function readJson(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export const AUTH_ROUTES = { '/api/auth/login': 'login', '/api/auth/signup': 'signup' }

// 개발 서버(npm run dev)용: .env.local의 DOROBUS_DATABASE_URL이 있으면 로컬 DB로 로그인한다.
export function localAuth(databaseUrl) {
  const auth = createAuth(databaseUrl)
  return {
    name: 'local-dorobus-auth',
    apply: 'serve',
    configureServer(server) {
      for (const [path, action] of Object.entries(AUTH_ROUTES)) {
        server.middlewares.use(path, async (req, res) => {
          const end = (status, value) => {
            res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end(JSON.stringify(value))
          }
          if (req.method !== 'POST') return end(405, {})
          if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return end(403, {})
          if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '') || req.headers.origin !== `http://${req.headers.host}`) return end(403, {})
          if (!auth) return end(503, {})
          if (!req.headers['content-type']?.startsWith('application/json')) return end(415, {})
          try {
            const input = await readJson(req, 4096)
            if (!input) return end(413, {})
            const { status, body } = await auth[action](input)
            return end(status, body)
          } catch {
            return end(503, {})
          }
        })
      }
    },
  }
}
