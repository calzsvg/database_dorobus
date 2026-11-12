-- 호출은 서버의 완료 트랜잭션 안에서만. 사용자 인증은 서버 책임.
BEGIN;
CREATE FUNCTION dorobus.issue_driving_license(p_user UUID,p_run UUID) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,dorobus AS $fn$
DECLARE r dorobus.repair_runs%ROWTYPE; n INTEGER;
BEGIN
 SELECT * INTO r FROM dorobus.repair_runs WHERE id=p_run AND user_id=p_user FOR UPDATE;
 IF NOT FOUND OR r.case_role<>'onboarding' OR r.phase<>'completed' THEN
  RAISE EXCEPTION 'completed own onboarding required' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT FROM dorobus.contents WHERE id=r.content_id AND code='repair:car') THEN
  RAISE EXCEPTION 'only registered car onboarding issues driving license' USING ERRCODE='23514';
 END IF;
 SELECT count(*) INTO n FROM dorobus.repair_problems WHERE content_version_id=r.content_version_id;
 IF n=0 OR EXISTS(SELECT FROM dorobus.repair_problems p WHERE p.content_version_id=r.content_version_id AND NOT EXISTS
  (SELECT FROM dorobus.repair_problem_solutions s WHERE s.run_id=r.id AND s.problem_key=p.problem_key)) THEN
  RAISE EXCEPTION 'onboarding causes not complete' USING ERRCODE='23514';
 END IF;
 SELECT count(*) INTO n FROM dorobus.repair_tests WHERE content_version_id=r.content_version_id;
 IF n=0 OR EXISTS(SELECT FROM dorobus.repair_tests t WHERE t.content_version_id=r.content_version_id AND NOT EXISTS
  (SELECT FROM dorobus.repair_trials a WHERE a.run_id=r.id AND a.test_key=t.test_key AND a.passed AND a.invalidated_at IS NULL)) THEN
  RAISE EXCEPTION 'onboarding tests not complete' USING ERRCODE='23514';
 END IF;
 INSERT INTO dorobus.driving_licenses(user_id,source_run_id,issued_at,request_id)
 VALUES(r.user_id,r.id,r.completed_at,r.completion_request_id) ON CONFLICT(user_id) DO NOTHING;
 RETURN p_user;
END;
$fn$;
REVOKE ALL ON FUNCTION dorobus.issue_driving_license(UUID,UUID) FROM PUBLIC;
COMMENT ON FUNCTION dorobus.issue_driving_license(UUID,UUID) IS '서버 완료 트랜잭션용 제한 발급. 본인 자동차 완료·원인·시험 확인 후 한 번만 발급';
COMMIT;
