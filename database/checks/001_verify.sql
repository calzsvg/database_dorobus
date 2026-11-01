-- 조회만 수행합니다. 예시 데이터를 넣기 전에도 실행할 수 있습니다.
-- 1. 기대 결과: table_count = 17, column_count = 100
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'dorobus' AND table_type = 'BASE TABLE';

SELECT COUNT(*) AS column_count
FROM information_schema.columns WHERE table_schema = 'dorobus';

-- 2. 테이블 목록과 DB에 기록한 설명
SELECT c.relname AS table_name, obj_description(c.oid, 'pg_class') AS description
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'dorobus' AND c.relkind = 'r'
ORDER BY c.relname;

-- 3. PK·FK·중복 방지·CHECK 목록
SELECT tab.relname AS table_name, con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class tab ON tab.oid = con.conrelid
JOIN pg_namespace n ON n.oid = tab.relnamespace
WHERE n.nspname = 'dorobus'
ORDER BY tab.relname, con.conname;

-- 4. updated_at 갱신 트리거: 기대 결과 두 행
SELECT event_object_table AS table_name, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'dorobus'
ORDER BY event_object_table;

-- 5. 예시를 넣었다면: 잔액 150, 거래 합계 150, 차이 0. 넣지 않았다면 0행.
SELECT u.login_id, w.balance,
       COALESCE(SUM(t.amount), 0) AS transaction_total,
       w.balance - COALESCE(SUM(t.amount), 0) AS difference
FROM dorobus.users u
JOIN dorobus.wallets w ON w.user_id = u.id
LEFT JOIN dorobus.cell_transactions t ON t.user_id = u.id
WHERE u.login_id = 'demo-student'
GROUP BY u.login_id, w.balance;

-- 6. 예시를 넣었다면: tries 3, wrong 2
SELECT u.login_id, COUNT(*) AS tries,
       COUNT(*) FILTER (WHERE NOT a.is_correct) AS wrong
FROM dorobus.users u JOIN dorobus.learning_attempts a ON a.user_id = u.id
WHERE u.login_id = 'demo-student'
GROUP BY u.login_id;
