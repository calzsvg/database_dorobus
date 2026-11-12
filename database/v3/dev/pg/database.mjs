// validation/database.mjs와 같은 내보내기(root, read, database, metadata)를 실제 PostgreSQL로 구현한다.
// - db: 스키마 소유자(dorobus_owner) 단일 연결. 시드 적재·직접 SQL 공격 검사에 사용
// - pool: 서버 로그인(dorobus_app_dev, dorobus_app_runtime 권한) 다중 연결 풀. 서비스 호출에 사용
// 결과 파일은 원본 validation/을 덮지 않도록 VERIFY_OUT 폴더에 쓴다.
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import pg from 'pg';
import {metadata as originalMetadata} from '../../validation/database.mjs?orig';

pg.types.setTypeParser(20, v => Number(v)); // int8 → number (PGlite와 같은 형태)

const v3 = fileURLToPath(new URL('../../', import.meta.url));
export const root = resolve(process.env.VERIFY_OUT ?? resolve(v3, 'dev/results'));
await mkdir(resolve(root, 'validation'), {recursive: true});
await mkdir(resolve(root, 'examples'), {recursive: true});
export const read = path => readFile(resolve(v3, path), 'utf8');
export const metadata = originalMetadata;

const base = {host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE};

export async function database() {
  const notices = [];
  const owner = new pg.Client({...base, user: 'dorobus_owner'});
  owner.on('notice', n => notices.push(n.message));
  await owner.connect();
  for (const file of ['001_core', '002_repair', '003_license', '004_license_issuer', '005_runtime_permissions', '007_user_birth_date', '008_user_password'])
    await owner.query(await read('sql/' + file + '.sql'));
  await owner.query(await read('examples/001_content.sql'));
  // 소유자 연결에서 SET LOCAL ROLE dorobus_app_runtime 공격 검사를 하려면 SET 권한이 필요하다(PG16 CREATEROLE 기본값은 SET FALSE).
  await owner.query('GRANT dorobus_app_runtime TO dorobus_owner WITH SET TRUE, INHERIT FALSE');
  // 서버 로그인 역할: 런타임 권한만 상속. setup-dev-db.sh의 dorobus_app_dev와 같은 형태
  await owner.query('CREATE ROLE dorobus_app_dev LOGIN IN ROLE dorobus_app_runtime');
  const pool = new pg.Pool({...base, user: 'dorobus_app_dev', max: 10});
  const db = {
    async query(sql, args) { return owner.query(sql, args); },
    async exec(sql) { const r = await owner.query(sql); return Array.isArray(r) ? r : [r]; },
    async close() { await pool.end(); await owner.end(); },
  };
  return {db, pool, notices};
}
