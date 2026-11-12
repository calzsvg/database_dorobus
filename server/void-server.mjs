// 미니PC용 서버: 빌드된 화면(dist)과 Gemini 보이드 API(/api/void-chat, /api/void-judge)를 한 포트로 내보낸다.
// Caddy(HTTPS) 뒤의 127.0.0.1에서만 받는다. 의존성 없이 Node 표준 모듈만 쓴다(DB 주소를 설정했을 때만 pg를 불러온다).
//
// 환경 변수 (systemd: server/systemd/dorobus.service)
//   PORT             기본 8795
//   DOROBUS_DIST     빌드 결과 폴더, 기본 ~/dorobus/dist
//   DOROBUS_ORIGINS  API를 부를 수 있는 사이트 주소(쉼표 구분), 기본 https://a1doro.duckdns.org
//   GEMINI_API_KEY   Gemini 키 (~/.config/dorobus-gemini/env, 권한 600). 없으면 API는 503 → 게임은 규칙만으로 동작
//   GEMINI_MODEL     선택
//   DOROBUS_DATABASE_URL  로그인·회원가입용 PostgreSQL 주소(선택). 없으면 /api/auth/*는 503 → 화면은 브라우저 체험 계정으로 동작
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { voidChat, judgeHypothesis, DEFAULT_MODEL } from './void-demo.mjs'
import { AUTH_ROUTES, createAuth, readJson } from './auth.mjs'

const PORT = Number(process.env.PORT || 8795)
const DIST = resolve(process.env.DOROBUS_DIST || join(homedir(), 'dorobus', 'dist'))
const ORIGINS = (process.env.DOROBUS_ORIGINS || 'https://a1doro.duckdns.org').split(',').map(origin => origin.trim()).filter(Boolean)
const API_KEY = process.env.GEMINI_API_KEY || ''
const MODEL = process.env.GEMINI_MODEL || DEFAULT_MODEL
const AUTH = createAuth(process.env.DOROBUS_DATABASE_URL)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.hdr': 'application/octet-stream',
}

// 같은 사람(접속 주소)이 너무 많이 부르지 못하게: 5분에 30번, 전체 1시간에 1500번
const perClient = new Map()
let globalWindow = { start: Date.now(), count: 0 }
function allowed(ip) {
  const now = Date.now()
  if (now - globalWindow.start > 3600_000) globalWindow = { start: now, count: 0 }
  if (globalWindow.count >= 1500) return false
  const recent = (perClient.get(ip) ?? []).filter(t => now - t < 300_000)
  if (recent.length >= 30) { perClient.set(ip, recent); return false }
  recent.push(now)
  perClient.set(ip, recent)
  globalWindow.count++
  if (perClient.size > 5000) perClient.clear()
  return true
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers })
  res.end(body)
}
const json = (res, status, value) => send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' })

const ROUTES = { '/api/void-chat': voidChat, '/api/void-judge': judgeHypothesis }
let inFlight = 0

async function api(req, res, handler) {
  if (req.method !== 'POST') return json(res, 405, {})
  if (!ORIGINS.includes(req.headers.origin)) return json(res, 403, {})
  if (!API_KEY) return json(res, 503, {})
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, {})
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  if (!allowed(ip)) return json(res, 429, {})
  if (inFlight >= 6) return json(res, 429, {})
  inFlight++
  try {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > 8192) return json(res, 413, {})
      chunks.push(chunk)
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const result = await handler({ apiKey: API_KEY, model: MODEL, input })
    return json(res, result ? 200 : 422, result ?? {})
  } catch {
    return json(res, 502, {})
  } finally {
    inFlight--
  }
}

// 로그인·회원가입: Gemini 키와 무관하게 DB만 있으면 동작한다
async function authApi(req, res, action) {
  if (req.method !== 'POST') return json(res, 405, {})
  if (!ORIGINS.includes(req.headers.origin)) return json(res, 403, {})
  if (!AUTH) return json(res, 503, {})
  if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, {})
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  if (!allowed(ip)) return json(res, 429, {})
  if (inFlight >= 6) return json(res, 429, {})
  inFlight++
  try {
    const input = await readJson(req, 4096)
    if (!input) return json(res, 413, {})
    const { status, body } = await AUTH[action](input)
    return json(res, status, body)
  } catch {
    return json(res, 503, {})
  } finally {
    inFlight--
  }
}

async function file(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '')
  let path
  try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { return send(res, 400, '') }
  if (path.endsWith('/')) path += 'index.html'
  const full = resolve(DIST, '.' + normalize(path))
  if (full !== DIST && !full.startsWith(DIST + sep)) return send(res, 404, '')
  try {
    const info = await stat(full)
    if (!info.isFile()) return send(res, 404, '')
    const body = await readFile(full)
    const type = TYPES[extname(full).toLowerCase()] || 'application/octet-stream'
    // 빌드 파일 이름에 해시가 붙는 assets/는 오래 캐시, 나머지는 매번 확인
    const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' })
  }
}

createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0]
  const handler = ROUTES[pathname]
  if (handler) return void api(req, res, handler)
  if (AUTH_ROUTES[pathname]) return void authApi(req, res, AUTH_ROUTES[pathname])
  return void file(req, res)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`DOROBUS http://127.0.0.1:${PORT} dist=${DIST} gemini=${API_KEY ? 'on' : 'off'} model=${MODEL} db=${AUTH ? 'on' : 'off'}`)
})
