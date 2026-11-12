import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { localVoidDemo } from './server/void-demo.mjs'
import { localAuth } from './server/auth.mjs'

// 개발 서버(npm run dev, npm run dev:repair-demo)에서는 Gemini 보이드를 켠다.
// 키는 .env.repair-demo.local(깃에 안 올라감)의 GEMINI_API_KEY. 키가 없거나 빌드된 정적 사이트에서는 게임 규칙만으로 답한다.
export default defineConfig(({ command, mode }) => {
  const serve = command === 'serve'
  const env = serve ? { ...loadEnv('repair-demo', process.cwd(), 'GEMINI_'), ...loadEnv(mode, process.cwd(), ['GEMINI_', 'DOROBUS_']) } : {}
  return {
    // 로그인 DB는 .env.local의 DOROBUS_DATABASE_URL (예: postgresql://dorobus_app_dev@localhost:5432/dorobus_dev). 없으면 브라우저 체험 계정으로 동작
    plugins: [react(), ...(serve ? [localVoidDemo(env.GEMINI_API_KEY, env.GEMINI_MODEL), localAuth(env.DOROBUS_DATABASE_URL)] : [])],
    server: mode === 'repair-demo' ? { port: 5175, host: '127.0.0.1', strictPort: true } : { port: 5173 },
  }
})
