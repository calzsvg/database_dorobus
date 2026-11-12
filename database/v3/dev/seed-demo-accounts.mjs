// src/accounts.js의 체험 계정(a1~a5, t1, d1, d2)을 개발 DB(dorobus.users)에 넣는다. 여러 번 실행해도 된다.
// - 이름·역할·생년월일·비밀번호(scrypt 해시)를 accounts.js와 같게 맞춘다. 비밀번호 원문은 저장하지 않는다.
// - 강사 계정도 넣어야 하므로 런타임 계정이 아닌 스키마 소유자(dorobus_owner)로 접속한다.
// 사용: npm run db:seed-demo   (DOROBUS_OWNER_URL로 접속 주소 변경 가능)
import pg from 'pg'
import { ACCOUNTS } from '../../../src/accounts.js'
import { hashPassword } from '../../../server/auth.mjs'

const url = process.env.DOROBUS_OWNER_URL || 'postgresql://dorobus_owner@localhost:5432/dorobus_dev'
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query('BEGIN')
  for (const a of ACCOUNTS) {
    await client.query(
      `INSERT INTO dorobus.users (login_id, display_name, role, auth_subject, birth_date, password_hash)
       VALUES ($1::text, $2, $3, 'local:' || $1::text, $4, $5)
       ON CONFLICT (login_id) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role,
         auth_subject = EXCLUDED.auth_subject, birth_date = EXCLUDED.birth_date, password_hash = EXCLUDED.password_hash`,
      [a.id, a.name, a.role, a.birthDate, await hashPassword(a.password)])
  }
  await client.query('COMMIT')
  const { rows } = await client.query(
    `SELECT login_id, display_name, role, birth_date::text, age FROM dorobus.users_with_age WHERE login_id = ANY($1) ORDER BY login_id`,
    [ACCOUNTS.map((a) => a.id)])
  console.table(rows)
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  await client.end()
}
