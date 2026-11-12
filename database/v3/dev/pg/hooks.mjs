// validation/*.mjs가 import하는 ./database.mjs(PGlite)를 실제 PostgreSQL 어댑터로 바꿔 끼운다.
// 원본 검증 코드는 수정하지 않는다. '?orig'가 붙은 import는 원본 그대로 연결한다.
import {registerHooks} from 'node:module';
const adapter = new URL('./database.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    const result = next(specifier, context);
    if (/\/validation\/database\.mjs$/.test(result.url)) return {...result, url: adapter, shortCircuit: true};
    return result;
  },
});
