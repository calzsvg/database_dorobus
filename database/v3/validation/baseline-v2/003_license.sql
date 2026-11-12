-- 최종본 3/5 · 자동차 도입 사건 예외 + 완료 근거가 있는 면허
BEGIN;
CREATE TABLE dorobus.driving_licenses (
 user_id UUID PRIMARY KEY REFERENCES dorobus.users(id) ON DELETE RESTRICT,
 source_run_id UUID NOT NULL UNIQUE,
 source_case_role TEXT GENERATED ALWAYS AS ('onboarding'::text) STORED,
 source_phase TEXT GENERATED ALWAYS AS ('completed'::text) STORED,
 issued_at TIMESTAMPTZ NOT NULL,
 request_id UUID NOT NULL UNIQUE,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT license_verified_run_fk FOREIGN KEY(source_run_id,user_id,source_case_role,source_phase)
 REFERENCES dorobus.repair_runs(id,user_id,case_role,phase) ON DELETE RESTRICT
);
COMMENT ON TABLE dorobus.driving_licenses IS '자동차 도입 수리 완료로 발급하는 게임 운전면허. 퍼레이드의 원격수리 자격과 별개';
COMMENT ON COLUMN dorobus.driving_licenses.user_id IS '면허 소유 사용자. 한 사람당 하나';
COMMENT ON COLUMN dorobus.driving_licenses.source_run_id IS '면허를 발급한 본인의 완료된 도입 사건. 복합 FK가 소유자·유형·완료 상태를 검사';
COMMENT ON COLUMN dorobus.driving_licenses.source_case_role IS '자동 계산 onboarding. 임의 다른 사건으로 면허 발급 불가';
COMMENT ON COLUMN dorobus.driving_licenses.source_phase IS '자동 계산 completed. 미완료 자동차로 면허 발급 불가';
COMMENT ON COLUMN dorobus.driving_licenses.issued_at IS '서버가 확정한 자동차 완료 시각';
COMMENT ON COLUMN dorobus.driving_licenses.request_id IS '최초 발급 요청. 재전송/재도전에서 면허를 중복 발급하지 않음';
COMMENT ON COLUMN dorobus.driving_licenses.recorded_at IS '면허 행을 등록한 시각';
ALTER TABLE dorobus.repair_runs
 ADD COLUMN license_holder_id UUID GENERATED ALWAYS AS
 (CASE WHEN case_role='onboarding' THEN NULL ELSE user_id END) STORED,
 ADD CONSTRAINT run_conditional_license_fk FOREIGN KEY(license_holder_id)
 REFERENCES dorobus.driving_licenses(user_id) ON DELETE RESTRICT;
COMMENT ON COLUMN dorobus.repair_runs.license_holder_id IS '도입 사건이면 NULL, 그 외에는 자동으로 본인 ID. 학생이 NULL/타인 ID로 입장 조건 우회 불가';
-- 면허 존재는 FK, 취득시각<=시작시각은 서버 start 처리 책임. 추가 입장 트리거 없음.
-- 실제 기존 DB/면허 이관이 확정되지 않아 임의 approved_migration 발급 경로는 두지 않는다.
COMMIT;
