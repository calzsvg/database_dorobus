-- 개발 DB용 제약조건 검증. 임시 예시 행은 마지막 ROLLBACK으로 모두 취소됩니다.
-- 예시 데이터 파일 실행 여부와 관계없이 실행할 수 있습니다.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Seoul';
DO $checks$
DECLARE
    v_student UUID := gen_random_uuid();
    v_teacher UUID := gen_random_uuid();
    v_course UUID := gen_random_uuid();
    v_group UUID := gen_random_uuid();
    v_content UUID := gen_random_uuid();
    v_other_content UUID := gen_random_uuid();
    v_version UUID := gen_random_uuid();
    v_version2 UUID := gen_random_uuid();
    v_other_version UUID := gen_random_uuid();
    v_assignment UUID := gen_random_uuid();
    v_item UUID := gen_random_uuid();
    v_goal_item UUID := gen_random_uuid();
    v_request UUID := gen_random_uuid();
    v_operation UUID := gen_random_uuid();
    v_login VARCHAR(50) := 'check-' || gen_random_uuid()::text;
    v_missing UUID := gen_random_uuid();
BEGIN
    INSERT INTO dorobus.users (id, login_id, display_name, role, auth_subject)
    VALUES (v_student, v_login, '검증 학생', 'student', 'check:' || v_student::text),
           (v_teacher, 'check-' || v_teacher::text, '검증 강사', 'teacher', 'check:' || v_teacher::text);
    INSERT INTO dorobus.courses (id, code, title, track, level)
    VALUES (v_course, 'check-' || v_course::text, '검증 과정', 'spark', 1);
    INSERT INTO dorobus.class_groups (id, course_id, teacher_id, name, starts_on)
    VALUES (v_group, v_course, v_teacher, '검증 반', DATE '2026-11-02');
    INSERT INTO dorobus.enrollments (user_id, class_group_id) VALUES (v_student, v_group);
    INSERT INTO dorobus.contents (id, code, kind)
    VALUES (v_content, 'check-' || v_content::text, 'quiz'),
           (v_other_content, 'check-' || v_other_content::text, 'quiz');
    INSERT INTO dorobus.content_versions (id, content_id, version, title, public_body, grading_rule)
    VALUES (v_version, v_content, 1, '검증 문제 1판', '{}', '{}'),
           (v_version2, v_content, 2, '검증 문제 2판', '{}', '{}'),
           (v_other_version, v_other_content, 1, '다른 문제', '{}', '{}');
    INSERT INTO dorobus.assignments (id, class_group_id, content_version_id, assigned_on)
    VALUES (v_assignment, v_group, v_version, DATE '2026-11-02');
    INSERT INTO dorobus.learning_attempts
        (user_id, content_version_id, assignment_id, scope, answer, is_correct, request_id)
    VALUES (v_student, v_version, v_assignment, 'activity', '{}', true, v_request);
    INSERT INTO dorobus.content_completions (user_id, content_id, completed_version_id)
    VALUES (v_student, v_content, v_version);
    INSERT INTO dorobus.items (id, code, name, price_cell)
    VALUES (v_item, 'check-' || v_item::text, '검증 상품', 200),
           (v_goal_item, 'check-' || v_goal_item::text, '검증 목표 상품', 100);
    INSERT INTO dorobus.user_items (user_id, item_id) VALUES (v_student, v_item);
    INSERT INTO dorobus.player_profiles (user_id, goal_item_id) VALUES (v_student, v_goal_item);
    INSERT INTO dorobus.wallets (user_id) VALUES (v_student);
    INSERT INTO dorobus.cell_transactions (user_id, amount, reason, operation_id)
    VALUES (v_student, 1, 'check', v_operation);
    INSERT INTO dorobus.reward_claims (user_id, reward_key, operation_id, cell_amount)
    VALUES (v_student, 'check:first-clear', v_operation, 1);

    BEGIN
        UPDATE dorobus.wallets SET balance = -1 WHERE user_id = v_student;
        RAISE EXCEPTION 'FAIL 01: 음수 잔액 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 01: 음수 잔액 금지';
    END;

    BEGIN
        UPDATE dorobus.wallets SET balance = NULL WHERE user_id = v_student;
        RAISE EXCEPTION 'FAIL 02: 필수 잔액 누락 금지';
    EXCEPTION WHEN SQLSTATE '23502' THEN
        RAISE NOTICE 'PASS 02: 필수 잔액 누락 금지';
    END;

    BEGIN
        UPDATE dorobus.items SET price_cell = -1 WHERE id = v_item;
        RAISE EXCEPTION 'FAIL 03: 음수 상품 가격 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 03: 음수 상품 가격 금지';
    END;

    BEGIN
        INSERT INTO dorobus.users (login_id, display_name, role, auth_subject) VALUES (v_login, '중복', 'student', gen_random_uuid()::text);
        RAISE EXCEPTION 'FAIL 04: 로그인 아이디 중복 금지';
    EXCEPTION WHEN SQLSTATE '23505' THEN
        RAISE NOTICE 'PASS 04: 로그인 아이디 중복 금지';
    END;

    BEGIN
        UPDATE dorobus.users SET login_id = ' A1 ' WHERE id = v_student;
        RAISE EXCEPTION 'FAIL 05: 대문자·앞뒤 공백 아이디 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 05: 대문자·앞뒤 공백 아이디 금지';
    END;

    BEGIN
        UPDATE dorobus.users SET role = 'other' WHERE id = v_student;
        RAISE EXCEPTION 'FAIL 06: 정의되지 않은 역할 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 06: 정의되지 않은 역할 금지';
    END;

    BEGIN
        INSERT INTO dorobus.enrollments (user_id, class_group_id) VALUES (v_student, v_group);
        RAISE EXCEPTION 'FAIL 07: 동일 반 중복 수강 금지';
    EXCEPTION WHEN SQLSTATE '23505' THEN
        RAISE NOTICE 'PASS 07: 동일 반 중복 수강 금지';
    END;

    BEGIN
        UPDATE dorobus.enrollments SET status = 'completed' WHERE user_id = v_student;
        RAISE EXCEPTION 'FAIL 08: 수료 시각 없는 수료 상태 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 08: 수료 시각 없는 수료 상태 금지';
    END;

    BEGIN
        INSERT INTO dorobus.enrollments (user_id, class_group_id) VALUES (v_missing, v_group);
        RAISE EXCEPTION 'FAIL 09: 존재하지 않는 사용자 참조 금지';
    EXCEPTION WHEN SQLSTATE '23503' THEN
        RAISE NOTICE 'PASS 09: 존재하지 않는 사용자 참조 금지';
    END;

    BEGIN
        INSERT INTO dorobus.user_items (user_id, item_id) VALUES (v_student, v_item);
        RAISE EXCEPTION 'FAIL 10: 같은 가구 중복 보유 금지';
    EXCEPTION WHEN SQLSTATE '23505' THEN
        RAISE NOTICE 'PASS 10: 같은 가구 중복 보유 금지';
    END;

    BEGIN
        INSERT INTO dorobus.content_completions (user_id, content_id, completed_version_id) VALUES (v_student, v_content, v_version2);
        RAISE EXCEPTION 'FAIL 11: 같은 문제 중복 완료 금지';
    EXCEPTION WHEN SQLSTATE '23505' THEN
        RAISE NOTICE 'PASS 11: 같은 문제 중복 완료 금지';
    END;

    BEGIN
        INSERT INTO dorobus.content_completions (user_id, content_id, completed_version_id) VALUES (v_teacher, v_content, v_other_version);
        RAISE EXCEPTION 'FAIL 12: 완료한 문제와 버전 소속 불일치 금지';
    EXCEPTION WHEN SQLSTATE '23503' THEN
        RAISE NOTICE 'PASS 12: 완료한 문제와 버전 소속 불일치 금지';
    END;

    BEGIN
        INSERT INTO dorobus.learning_attempts (user_id, content_version_id, assignment_id, scope, answer, is_correct, request_id) VALUES (v_student, v_version2, v_assignment, 'activity', '{}', true, gen_random_uuid());
        RAISE EXCEPTION 'FAIL 13: 과제와 제출 버전 불일치 금지';
    EXCEPTION WHEN SQLSTATE '23503' THEN
        RAISE NOTICE 'PASS 13: 과제와 제출 버전 불일치 금지';
    END;

    BEGIN
        INSERT INTO dorobus.learning_attempts (user_id, content_version_id, scope, answer, is_correct, request_id) VALUES (v_student, v_version, 'activity', '{}', true, v_request);
        RAISE EXCEPTION 'FAIL 14: 같은 제출 요청 중복 금지';
    EXCEPTION WHEN SQLSTATE '23505' THEN
        RAISE NOTICE 'PASS 14: 같은 제출 요청 중복 금지';
    END;

    BEGIN
        INSERT INTO dorobus.learning_attempts (user_id, content_version_id, scope, answer, is_correct, request_id) VALUES (v_student, v_version, 'step', '{}', true, gen_random_uuid());
        RAISE EXCEPTION 'FAIL 15: 단계 답변의 단계 키 누락 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 15: 단계 답변의 단계 키 누락 금지';
    END;

    BEGIN
        INSERT INTO dorobus.learning_attempts (user_id, content_version_id, scope, step_key, answer, is_correct, request_id) VALUES (v_student, v_version, 'activity', 'step-1', '{}', true, gen_random_uuid());
        RAISE EXCEPTION 'FAIL 16: 전체 답변과 단계 키 혼용 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 16: 전체 답변과 단계 키 혼용 금지';
    END;

    BEGIN
        INSERT INTO dorobus.learning_attempts (user_id, content_version_id, scope, answer, is_correct, request_id) VALUES (v_student, v_version, 'activity', '[]', true, gen_random_uuid());
        RAISE EXCEPTION 'FAIL 17: 답안 JSON 객체 형식 검사';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 17: 답안 JSON 객체 형식 검사';
    END;

    BEGIN
        UPDATE dorobus.assignments SET due_at = TIMESTAMPTZ '2026-11-01 23:59:59+09' WHERE id = v_assignment;
        RAISE EXCEPTION 'FAIL 18: 출제일 이전 마감 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 18: 출제일 이전 마감 금지';
    END;

    BEGIN
        INSERT INTO dorobus.reward_claims (user_id, reward_key, operation_id) VALUES (v_student, 'check:first-clear', gen_random_uuid());
        RAISE EXCEPTION 'FAIL 19: 동일 보상은 새 요청 번호로도 중복 금지';
    EXCEPTION WHEN SQLSTATE '23505' THEN
        RAISE NOTICE 'PASS 19: 동일 보상은 새 요청 번호로도 중복 금지';
    END;

    BEGIN
        UPDATE dorobus.reward_claims SET cell_amount = -1 WHERE user_id = v_student;
        RAISE EXCEPTION 'FAIL 20: 음수 보상 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 20: 음수 보상 금지';
    END;

    BEGIN
        INSERT INTO dorobus.cell_transactions (user_id, amount, reason, operation_id) VALUES (v_student, 1, 'check', v_operation);
        RAISE EXCEPTION 'FAIL 21: 같은 사용자·작업의 거래 중복 금지';
    EXCEPTION WHEN SQLSTATE '23505' THEN
        RAISE NOTICE 'PASS 21: 같은 사용자·작업의 거래 중복 금지';
    END;

    BEGIN
        INSERT INTO dorobus.cell_transactions (user_id, amount, reason, operation_id) VALUES (v_student, 0, 'check', gen_random_uuid());
        RAISE EXCEPTION 'FAIL 22: 증감 0인 거래 금지';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 22: 증감 0인 거래 금지';
    END;

    BEGIN
        UPDATE dorobus.player_profiles SET preferences = 'null'::jsonb WHERE user_id = v_student;
        RAISE EXCEPTION 'FAIL 23: 설정 JSON 객체 형식 검사';
    EXCEPTION WHEN SQLSTATE '23514' THEN
        RAISE NOTICE 'PASS 23: 설정 JSON 객체 형식 검사';
    END;

    BEGIN
        DELETE FROM dorobus.courses WHERE id = v_course;
        RAISE EXCEPTION 'FAIL 24: 수강 기록이 참조하는 과정 삭제 제한';
    EXCEPTION WHEN SQLSTATE '23503' OR SQLSTATE '23001' THEN
        RAISE NOTICE 'PASS 24: 수강 기록이 참조하는 과정 삭제 제한';
    END;

    -- 허용되어야 할 연결과 트리거도 검사합니다.
    INSERT INTO dorobus.learning_attempts
        (user_id, content_version_id, scope, answer, is_correct, request_id)
    VALUES (v_student, v_version2, 'activity', '{}', true, gen_random_uuid());
    INSERT INTO dorobus.learning_attempts
        (user_id, content_version_id, scope, step_key, answer, is_correct, request_id)
    VALUES (v_student, v_version, 'step', 'step-1', '{}', false, gen_random_uuid());
    INSERT INTO dorobus.content_completions (user_id, content_id, completed_version_id)
    VALUES (v_teacher, v_other_content, v_other_version);
    INSERT INTO dorobus.cell_transactions (user_id, amount, reason, operation_id)
    VALUES (v_teacher, -1, 'check', v_operation);
    UPDATE dorobus.assignments SET due_at = TIMESTAMPTZ '2026-11-02 00:00:00+09'
    WHERE id = v_assignment;
    UPDATE dorobus.wallets SET updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
    WHERE user_id = v_student;
    IF (SELECT updated_at FROM dorobus.wallets WHERE user_id = v_student) <> now() THEN
        RAISE EXCEPTION 'FAIL: wallets updated_at 트리거';
    END IF;
    UPDATE dorobus.player_profiles SET updated_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
    WHERE user_id = v_student;
    IF (SELECT updated_at FROM dorobus.player_profiles WHERE user_id = v_student) <> now() THEN
        RAISE EXCEPTION 'FAIL: player_profiles updated_at 트리거';
    END IF;
    DELETE FROM dorobus.items WHERE id = v_goal_item;
    IF (SELECT goal_item_id FROM dorobus.player_profiles WHERE user_id = v_student) IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: 선택용 FK의 ON DELETE SET NULL';
    END IF;
    RAISE NOTICE 'PASS: 독립 풀이·단계 답변·정상 완료·사용자별 작업 번호·한국 날짜 경계·갱신 트리거·선택 FK';
END;
$checks$;
ROLLBACK;
-- ROLLBACK은 성공한 검증용 임시 행도 남기지 않기 위한 정상 종료입니다.
