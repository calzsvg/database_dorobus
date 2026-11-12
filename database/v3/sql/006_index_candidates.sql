-- 검토 DB에서 비교 측정할 인덱스 후보. 운영 적용은 실제 데이터 EXPLAIN과 쓰기 비용 확인 후.
BEGIN;
CREATE INDEX repair_runs_version_started_idx
 ON dorobus.repair_runs(content_version_id,started_at,id);
CREATE INDEX repair_solutions_attempt_idx
 ON dorobus.repair_problem_solutions(attempt_id);
COMMIT;
