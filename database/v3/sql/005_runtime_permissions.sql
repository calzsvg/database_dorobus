-- 최종본 신규 개발 DB 전용. 실제 서버 계정·비밀번호·연결을 생성하지 않는다.
-- NOLOGIN 권한 묶음이며, 실제 API 로그인 계정 연결은 후속 구현이다.
-- 스키마 소유자와 API 런타임을 분리해야 아래 제한이 의미가 있다.
BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='dorobus_app_runtime') THEN CREATE ROLE dorobus_app_runtime NOLOGIN; ELSE RAISE EXCEPTION 'dorobus_app_runtime already exists: review role grants before running'; END IF; END $$;
GRANT USAGE ON SCHEMA dorobus TO dorobus_app_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA dorobus TO dorobus_app_runtime;
-- driving_licenses는 SELECT만 허용. 004의 제한된 발급 함수만 호출할 수 있다.
GRANT INSERT ON dorobus.repair_runs,dorobus.learning_attempts,dorobus.repair_clue_discoveries,
 dorobus.repair_attempt_evidence,dorobus.repair_problem_solutions,dorobus.repair_trials,
 dorobus.repair_hint_events,dorobus.content_completions,dorobus.reward_claims,
 dorobus.cell_transactions,dorobus.wallets TO dorobus_app_runtime;
GRANT UPDATE(phase,settings,bench_revision,state_revision,draft_text,first_diagnosed_at,updated_at,completed_at,completion_request_id)
 ON dorobus.repair_runs TO dorobus_app_runtime;
GRANT UPDATE(note_text) ON dorobus.repair_clue_discoveries TO dorobus_app_runtime;
GRANT UPDATE(invalidated_at) ON dorobus.repair_trials TO dorobus_app_runtime;
GRANT UPDATE(balance,updated_at) ON dorobus.wallets TO dorobus_app_runtime;
GRANT UPDATE(shown_at) ON dorobus.repair_hint_events TO dorobus_app_runtime;
GRANT EXECUTE ON FUNCTION dorobus.issue_driving_license(UUID,UUID) TO dorobus_app_runtime;
-- 정의·사용자 역할·제출 원문 UPDATE/DELETE/TRUNCATE, 스키마 CREATE 권한을 부여하지 않는다.
-- 런타임은 서버용이다. 이 역할을 학생 브라우저에 제공하지 않는다.
-- developer가 전체 학생을 볼 수 있는지와 student의 본인 조회는 API 인증으로 따로 검사한다.
-- 원문 제거는 보관 정책 확정 뒤 별도 유지관리 계정/작업으로 수행한다.
COMMIT;
