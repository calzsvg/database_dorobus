import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// 007 확장: 생년월일 필수, 나이 계산, 서버용 가입 함수. 각 검사는 롤백한다.
export async function verifyBirthDate({db, check}) {
  const q = async (s, p = []) => (await db.query(s, p)).rows;
  async function tx(fn, role = false) {
    await db.exec('BEGIN');
    try { if (role) await db.exec('SET LOCAL ROLE dorobus_app_runtime'); return await fn(); }
    finally { await db.exec('ROLLBACK'); }
  }
  // 한 트랜잭션 안에서 여러 거부를 확인하므로 SAVEPOINT로 실패 지점만 되돌린다.
  async function rejects(fn, code, constraint) {
    await db.exec('SAVEPOINT expect_error');
    try { await assert.rejects(fn, e => e.code === code && (!constraint || e.constraint === constraint), `expected ${code}`); }
    finally { await db.exec('ROLLBACK TO SAVEPOINT expect_error'); }
  }
  const register = (login, birth) => q('SELECT dorobus.register_user($1,$2,$3,$4) id', [login, '가입 학생', 'signup:' + randomUUID(), birth]);

  await check('생년월일 없이 사용자 직접 INSERT 거부 (NOT NULL)', () => tx(() => rejects(() => q(
    "INSERT INTO dorobus.users(login_id,display_name,role,auth_subject) VALUES($1::text,'x','student',$1::text)", ['nobirth-' + randomUUID()]), '23502')));
  await check('1900-01-01 이전 생년월일 거부', () => tx(() => rejects(() => q(
    "INSERT INTO dorobus.users(login_id,display_name,role,auth_subject,birth_date) VALUES($1::text,'x','student',$1::text,DATE '1899-12-31')", ['old-' + randomUUID()]), '23514', 'users_birth_date_range_check')));
  await check('만 나이 계산: 생일 전날·당일·윤년 2월 29일생', async () => {
    const [r] = await q(`SELECT dorobus.age_on(DATE '2014-05-01', DATE '2026-04-30') before_bday,
      dorobus.age_on(DATE '2014-05-01', DATE '2026-05-01') on_bday,
      dorobus.age_on(DATE '2016-02-29', DATE '2026-02-28') leap_before, dorobus.age_on(DATE '2016-02-29', DATE '2026-03-01') leap_after`);
    assert.deepEqual(r, {before_bday: 11, on_bday: 12, leap_before: 9, leap_after: 10});
  });
  await check('서버 런타임은 users 직접 INSERT 불가, register_user로만 학생 가입', () => tx(async () => {
    await rejects(() => q("INSERT INTO dorobus.users(login_id,display_name,role,auth_subject,birth_date) VALUES('direct','x','student','direct',DATE '2014-01-01')"), '42501');
    const [{id}] = await register('  New-Kid  ', '2014-05-01');
    const [u] = await q('SELECT login_id,display_name,role,birth_date::text birth,age FROM dorobus.users_with_age WHERE id=$1', [id]);
    assert.equal(u.login_id, 'new-kid'); assert.equal(u.role, 'student'); assert.equal(u.birth, '2014-05-01');
    const [{expected}] = await q("SELECT dorobus.age_on(DATE '2014-05-01',(now() AT TIME ZONE 'Asia/Seoul')::date) expected");
    assert.equal(u.age, expected);
  }, true));
  await check('register_user: 생년월일 누락·미래 날짜·아이디 중복 거부', () => tx(async () => {
    await rejects(() => register('nobirth-' + randomUUID().slice(0, 8), null), '23502');
    await rejects(() => q("SELECT dorobus.register_user('future-kid','x','signup:f',((now() AT TIME ZONE 'Asia/Seoul')::date + 1))"), '23514');
    await register('dup-kid', '2015-01-01');
    await rejects(() => register('DUP-KID', '2015-01-01'), '23505', 'users_login_id_key');
  }, true));
  await check('008 register_local_user: 해시·local 주체 저장, 해시 형식 아니면 거부', () => tx(async () => {
    const [{id}] = await q("SELECT dorobus.register_local_user('Local-Kid','로컬 학생',DATE '2015-02-02','scrypt$16384$8$1$c2FsdA==$aGFzaA==') id");
    const [u] = await q('SELECT login_id,auth_subject,password_hash FROM dorobus.users WHERE id=$1', [id]);
    assert.deepEqual(u, {login_id: 'local-kid', auth_subject: 'local:local-kid', password_hash: 'scrypt$16384$8$1$c2FsdA==$aGFzaA=='});
    await rejects(() => q("SELECT dorobus.register_local_user('plain-kid','x',DATE '2015-02-02','1234')"), '23514');
    await rejects(() => q("UPDATE dorobus.users SET password_hash='x' WHERE id=$1", [id]), '42501');
  }, true));
  await check('나이 뷰는 auth_subject를 노출하지 않음', async () => {
    const cols = (await q("SELECT column_name FROM information_schema.columns WHERE table_schema='dorobus' AND table_name='users_with_age'")).map(r => r.column_name);
    assert(cols.includes('age') && cols.includes('birth_date') && !cols.includes('auth_subject'));
  });
}
