-- 선택 사항: 신규 개발 DB에서만 사용할 가상 데이터입니다.
-- demo-only 인증 식별자는 실제 로그인 계정을 생성하지 않습니다.
-- 처음 한 번만 실행. 재실행 시 중복 오류가 나며 이 파일의 변경은 모두 취소됩니다.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Seoul';

DO $demo$
DECLARE
    student UUID;
    teacher UUID;
    course UUID;
    class_group UUID;
    content UUID;
    content_version UUID;
    assignment UUID;
    story_step UUID;
    item UUID;
    reward_operation UUID := gen_random_uuid();
    purchase_operation UUID := gen_random_uuid();
    price BIGINT;
BEGIN
    INSERT INTO dorobus.users (login_id, display_name, role, auth_subject)
    VALUES ('demo-student', '예시 학생', 'student', 'demo-only:student')
    RETURNING id INTO student;
    INSERT INTO dorobus.users (login_id, display_name, role, auth_subject)
    VALUES ('demo-teacher', '예시 강사', 'teacher', 'demo-only:teacher')
    RETURNING id INTO teacher;

    INSERT INTO dorobus.courses (code, title, track, level)
    VALUES ('demo-l1', '예시 교육 과정', 'spark', 1)
    RETURNING id INTO course;
    INSERT INTO dorobus.class_groups (course_id, teacher_id, name, starts_on, status)
    VALUES (course, teacher, '예시 A반', CURRENT_DATE, 'active')
    RETURNING id INTO class_group;
    INSERT INTO dorobus.enrollments (user_id, class_group_id)
    VALUES (student, class_group);

    INSERT INTO dorobus.contents (code, kind, concept)
    VALUES ('demo-q-sensor', 'quiz', 'sensor') RETURNING id INTO content;
    INSERT INTO dorobus.content_versions
        (content_id, version, title, public_body, grading_rule, published_at)
    VALUES (
        content, 1, '밝기를 재는 센서는?',
        '{"q":"밝기를 재는 센서는?","options":[{"id":"light","label":"조도센서"},{"id":"distance","label":"초음파센서"},{"id":"temperature","label":"온도센서"}]}'::jsonb,
        '{"correct_option_id":"light"}'::jsonb, now()
    ) RETURNING id INTO content_version;
    INSERT INTO dorobus.assignments (class_group_id, content_version_id, assigned_on)
    VALUES (class_group, content_version, CURRENT_DATE) RETURNING id INTO assignment;

    -- 서로 다른 세 번의 제출: 오답 두 번, 정답 한 번.
    INSERT INTO dorobus.learning_attempts
        (user_id, content_version_id, assignment_id, scope, answer, is_correct, request_id)
    VALUES
        (student, content_version, assignment, 'activity', '{"option_id":"distance"}', false, gen_random_uuid()),
        (student, content_version, assignment, 'activity', '{"option_id":"temperature"}', false, gen_random_uuid()),
        (student, content_version, assignment, 'activity', '{"option_id":"light"}', true, gen_random_uuid());
    INSERT INTO dorobus.content_completions (user_id, content_id, completed_version_id)
    VALUES (student, content, content_version);

    INSERT INTO dorobus.story_steps (code, chapter, title)
    VALUES ('demo-car-check', 1, '예시 자동차 점검 완료') RETURNING id INTO story_step;
    INSERT INTO dorobus.user_story_progress (user_id, story_step_id)
    VALUES (student, story_step);
    INSERT INTO dorobus.items (code, name, price_cell, display_meta)
    VALUES ('demo-plant', '예시 화분', 200, '{"color":"#4CAF6E"}') RETURNING id INTO item;
    INSERT INTO dorobus.player_profiles (user_id, selected_class_group_id, goal_item_id, preferences)
    VALUES (student, class_group, item, '{"robot_persona":"kind"}');

    -- 예시 시작 잔액 300. 잔액과 그 근거 내역을 함께 기록합니다.
    INSERT INTO dorobus.wallets (user_id, balance) VALUES (student, 300);
    INSERT INTO dorobus.cell_transactions (user_id, amount, reason, operation_id)
    VALUES (student, 300, 'demo_opening', gen_random_uuid());

    -- 최초 완료 보상 +50. 세 기록은 이 파일의 같은 트랜잭션에 속합니다.
    INSERT INTO dorobus.reward_claims (user_id, reward_key, operation_id, cell_amount)
    VALUES (student, 'content:demo-q-sensor:first-clear', reward_operation, 50);
    UPDATE dorobus.wallets SET balance = balance + 50 WHERE user_id = student;
    INSERT INTO dorobus.cell_transactions (user_id, amount, reason, operation_id)
    VALUES (student, 50, 'content_reward', reward_operation);

    -- 가구 구매 -200. 실제 가격은 DB에서 읽고 잔액이 충분할 때만 차감합니다.
    SELECT price_cell INTO STRICT price FROM dorobus.items WHERE id = item AND is_active;
    UPDATE dorobus.wallets SET balance = balance - price
    WHERE user_id = student AND balance >= price;
    IF NOT FOUND THEN
        RAISE EXCEPTION '예시 구매에 필요한 CELL이 부족합니다.';
    END IF;
    INSERT INTO dorobus.user_items (user_id, item_id, purchase_price_cell)
    VALUES (student, item, price);
    INSERT INTO dorobus.cell_transactions (user_id, amount, reason, operation_id)
    VALUES (student, -price, 'item_purchase', purchase_operation);
    UPDATE dorobus.player_profiles SET goal_item_id = NULL WHERE user_id = student;
END;
$demo$;

COMMIT;
-- 결과: 예시 학생 잔액 150 CELL, 가구 한 개, 풀이 세 번, 최초 완료 한 건.
