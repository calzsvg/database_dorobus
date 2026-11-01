-- 도로버스 초기 스키마 · PostgreSQL 16 이상 · 신규 개발 DB에 한 번 실행
-- 테이블 정의서의 17개 테이블·100개 컬럼. 데이터 삭제/초기화 명령 없음.
-- 이미 dorobus 스키마가 있으면 오류로 중단하며 기존 구조를 덮어쓰지 않습니다.
-- GUI에서는 파일 전체 실행. psql에서는 -X -v ON_ERROR_STOP=1 -f 옵션 사용.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Seoul';
CREATE SCHEMA dorobus;
COMMENT ON SCHEMA dorobus IS '도로버스 학습·스토리·CELL·상점 핵심 데이터';

-- 01. 사용자
CREATE TABLE dorobus.users (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    login_id VARCHAR(50) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,
    auth_subject TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_login_id_key UNIQUE (login_id),
    CONSTRAINT users_auth_subject_key UNIQUE (auth_subject),
    CONSTRAINT users_login_id_normalized_check CHECK (login_id <> '' AND login_id = lower(btrim(login_id))),
    CONSTRAINT users_display_name_nonempty_check CHECK (btrim(display_name) <> ''),
    CONSTRAINT users_role_allowed_check CHECK (role IN ('student', 'teacher')),
    CONSTRAINT users_auth_subject_nonempty_check CHECK (btrim(auth_subject) <> '')
);
COMMENT ON TABLE dorobus.users IS '사용자';
COMMENT ON COLUMN dorobus.users.id IS '사용자 고유 번호. 이름이 같은 사람이 있어도 이 값으로 구별';
COMMENT ON COLUMN dorobus.users.login_id IS '로그인용 아이디. 예: a1. 등록 전에 앞뒤 공백 제거·영문 소문자화';
COMMENT ON COLUMN dorobus.users.display_name IS '화면에 보여 줄 이름. 예: 김도로. 동명이인 허용';
COMMENT ON COLUMN dorobus.users.role IS '역할. student는 학생, teacher는 강사. 서버가 부여';
COMMENT ON COLUMN dorobus.users.auth_subject IS '인증 서비스가 발급한 사용자 식별자. 비밀번호나 로그인 토큰이 아님';
COMMENT ON COLUMN dorobus.users.created_at IS '사용자 계정 기록을 만든 시각';

-- 02. 교육 과정
CREATE TABLE dorobus.courses (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    track VARCHAR(20) NOT NULL,
    level SMALLINT NOT NULL,
    description TEXT DEFAULT NULL,
    display_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT courses_pkey PRIMARY KEY (id),
    CONSTRAINT courses_code_key UNIQUE (code),
    CONSTRAINT courses_code_nonempty_check CHECK (btrim(code) <> ''),
    CONSTRAINT courses_title_nonempty_check CHECK (btrim(title) <> ''),
    CONSTRAINT courses_track_allowed_check CHECK (track IN ('spark', 'awake')),
    CONSTRAINT courses_level_range_check CHECK (level BETWEEN 1 AND 8),
    CONSTRAINT courses_display_meta_object_check CHECK (jsonb_typeof(display_meta) = 'object')
);
COMMENT ON TABLE dorobus.courses IS '교육 과정';
COMMENT ON COLUMN dorobus.courses.id IS '교육 과정 고유 번호';
COMMENT ON COLUMN dorobus.courses.code IS '코드에서 사용하는 고정 이름. 예: l1';
COMMENT ON COLUMN dorobus.courses.title IS '과정명. 예: AI K-POP 프로듀싱 작전';
COMMENT ON COLUMN dorobus.courses.track IS '과정 계열. spark 또는 awake';
COMMENT ON COLUMN dorobus.courses.level IS '현재 프로그램의 교육 레벨. 1~8';
COMMENT ON COLUMN dorobus.courses.description IS '과정의 자세한 소개';
COMMENT ON COLUMN dorobus.courses.display_meta IS '과정 소개용 아이콘·미션 문구·도구·키트·결과물 안내 묶음';
COMMENT ON COLUMN dorobus.courses.is_active IS '새로 제공할 수 있는 과정인지. false라도 과거 기록은 유지';

-- 03. 문제·학습 활동
CREATE TABLE dorobus.contents (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    concept VARCHAR(30) DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT contents_pkey PRIMARY KEY (id),
    CONSTRAINT contents_code_key UNIQUE (code),
    CONSTRAINT contents_code_nonempty_check CHECK (btrim(code) <> ''),
    CONSTRAINT contents_kind_allowed_check CHECK (kind IN ('quiz', 'world', 'story_mission', 'homework', 'coding_challenge')),
    CONSTRAINT contents_concept_allowed_check CHECK (concept IS NULL OR concept IN ('sequence', 'condition', 'loop', 'variable', 'sensor', 'data', 'ai', 'sort'))
);
COMMENT ON TABLE dorobus.contents IS '문제·학습 활동';
COMMENT ON COLUMN dorobus.contents.id IS '문제·활동 고유 번호';
COMMENT ON COLUMN dorobus.contents.code IS '코드상의 고정 식별자. 예: q-sensor, w-condition';
COMMENT ON COLUMN dorobus.contents.kind IS 'quiz 일반 문제 / world 월드 문제. 확장값: story_mission, homework, coding_challenge';
COMMENT ON COLUMN dorobus.contents.concept IS '학습 개념. 예: sensor 센서, condition 조건. 해당 없으면 비워 둠';
COMMENT ON COLUMN dorobus.contents.is_active IS '새 출제에 사용할 수 있는 활동인지';

-- 04. 스토리 단계
CREATE TABLE dorobus.story_steps (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL,
    chapter SMALLINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT story_steps_pkey PRIMARY KEY (id),
    CONSTRAINT story_steps_code_key UNIQUE (code),
    CONSTRAINT story_steps_code_nonempty_check CHECK (btrim(code) <> ''),
    CONSTRAINT story_steps_title_nonempty_check CHECK (btrim(title) <> ''),
    CONSTRAINT story_steps_chapter_nonnegative_check CHECK (chapter >= 0),
    CONSTRAINT story_steps_sort_order_nonnegative_check CHECK (sort_order >= 0)
);
COMMENT ON TABLE dorobus.story_steps IS '스토리 단계';
COMMENT ON COLUMN dorobus.story_steps.id IS '스토리 단계 고유 번호';
COMMENT ON COLUMN dorobus.story_steps.code IS '코드에서 사용할 고정 이름. 예: carCheckDone';
COMMENT ON COLUMN dorobus.story_steps.chapter IS '단계가 속한 챕터 번호. 예: 1. 도입부는 0';
COMMENT ON COLUMN dorobus.story_steps.title IS '사람이 읽는 단계 이름. 예: 자동차 출발 점검 완료';
COMMENT ON COLUMN dorobus.story_steps.sort_order IS '같은 챕터 안의 표시 순서';

-- 05. 상점 가구
CREATE TABLE dorobus.items (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT NULL,
    price_cell BIGINT NOT NULL,
    display_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT items_pkey PRIMARY KEY (id),
    CONSTRAINT items_code_key UNIQUE (code),
    CONSTRAINT items_code_nonempty_check CHECK (btrim(code) <> ''),
    CONSTRAINT items_name_nonempty_check CHECK (btrim(name) <> ''),
    CONSTRAINT items_price_nonnegative_check CHECK (price_cell >= 0),
    CONSTRAINT items_display_meta_object_check CHECK (jsonb_typeof(display_meta) = 'object')
);
COMMENT ON TABLE dorobus.items IS '상점 가구';
COMMENT ON COLUMN dorobus.items.id IS '가구 종류 고유 번호';
COMMENT ON COLUMN dorobus.items.code IS '기존 화면·3D 모델과 연결할 고정 이름. 예: plant';
COMMENT ON COLUMN dorobus.items.name IS '상품 이름. 예: 몬스테라 화분';
COMMENT ON COLUMN dorobus.items.description IS '상품 소개 문구';
COMMENT ON COLUMN dorobus.items.price_cell IS '현재 판매 가격. 예: 200';
COMMENT ON COLUMN dorobus.items.display_meta IS '표시 색상·아이콘·모델 연결 키 등. 예: {"color":"#4CAF6E"}';
COMMENT ON COLUMN dorobus.items.is_active IS '판매 중인지. 판매 중단해도 기존 보유 기록은 유지';

-- 06. 개설 반
CREATE TABLE dorobus.class_groups (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    teacher_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    starts_on DATE NOT NULL,
    ends_on DATE DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'planned',
    CONSTRAINT class_groups_pkey PRIMARY KEY (id),
    CONSTRAINT class_groups_course_id_fkey FOREIGN KEY (course_id)
        REFERENCES dorobus.courses (id) ON DELETE RESTRICT,
    CONSTRAINT class_groups_teacher_id_fkey FOREIGN KEY (teacher_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT class_groups_name_nonempty_check CHECK (btrim(name) <> ''),
    CONSTRAINT class_groups_date_order_check CHECK (ends_on IS NULL OR ends_on >= starts_on),
    CONSTRAINT class_groups_status_allowed_check CHECK (status IN ('planned', 'active', 'completed', 'cancelled'))
);
COMMENT ON TABLE dorobus.class_groups IS '개설 반';
COMMENT ON COLUMN dorobus.class_groups.id IS '반 고유 번호';
COMMENT ON COLUMN dorobus.class_groups.course_id IS '이 반이 사용하는 교육 과정';
COMMENT ON COLUMN dorobus.class_groups.teacher_id IS '담당 강사의 사용자 번호';
COMMENT ON COLUMN dorobus.class_groups.name IS '반 이름. 예: K-POP 월요일 A반';
COMMENT ON COLUMN dorobus.class_groups.starts_on IS '수업 운영 시작일';
COMMENT ON COLUMN dorobus.class_groups.ends_on IS '운영 종료일. 미정이면 비워 둠';
COMMENT ON COLUMN dorobus.class_groups.status IS 'planned 준비 중 / active 운영 중 / completed 종료 / cancelled 취소';

-- 07. 수강 기록
CREATE TABLE dorobus.enrollments (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    class_group_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT enrollments_pkey PRIMARY KEY (id),
    CONSTRAINT enrollments_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT enrollments_class_group_id_fkey FOREIGN KEY (class_group_id)
        REFERENCES dorobus.class_groups (id) ON DELETE RESTRICT,
    CONSTRAINT enrollments_user_class_key UNIQUE (user_id, class_group_id),
    CONSTRAINT enrollments_status_allowed_check CHECK (status IN ('active', 'completed', 'withdrawn')),
    CONSTRAINT enrollments_completion_state_check CHECK ((status = 'completed' AND completed_at IS NOT NULL AND completed_at >= enrolled_at) OR (status <> 'completed' AND completed_at IS NULL))
);
COMMENT ON TABLE dorobus.enrollments IS '수강 기록';
COMMENT ON COLUMN dorobus.enrollments.id IS '수강 기록 고유 번호';
COMMENT ON COLUMN dorobus.enrollments.user_id IS '수강하는 학생';
COMMENT ON COLUMN dorobus.enrollments.class_group_id IS '수강하는 반';
COMMENT ON COLUMN dorobus.enrollments.status IS 'active 수강 중 / completed 수료 / withdrawn 중도 취소';
COMMENT ON COLUMN dorobus.enrollments.enrolled_at IS '수강 등록 시각';
COMMENT ON COLUMN dorobus.enrollments.completed_at IS '수료 시각. 수강 중·중도 취소이면 비워 둠';

-- 08. 문제 버전
CREATE TABLE dorobus.content_versions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    content_id UUID NOT NULL,
    version INTEGER NOT NULL,
    title VARCHAR(200) NOT NULL,
    public_body JSONB NOT NULL,
    grading_rule JSONB NOT NULL,
    published_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT content_versions_pkey PRIMARY KEY (id),
    CONSTRAINT content_versions_content_id_fkey FOREIGN KEY (content_id)
        REFERENCES dorobus.contents (id) ON DELETE RESTRICT,
    CONSTRAINT content_versions_content_version_key UNIQUE (content_id, version),
    CONSTRAINT content_versions_content_id_id_key UNIQUE (content_id, id),
    CONSTRAINT content_versions_version_positive_check CHECK (version >= 1),
    CONSTRAINT content_versions_title_nonempty_check CHECK (btrim(title) <> ''),
    CONSTRAINT content_versions_public_body_object_check CHECK (jsonb_typeof(public_body) = 'object'),
    CONSTRAINT content_versions_grading_rule_object_check CHECK (jsonb_typeof(grading_rule) = 'object')
);
COMMENT ON TABLE dorobus.content_versions IS '문제 버전';
COMMENT ON COLUMN dorobus.content_versions.id IS '특정 문제 버전의 고유 번호';
COMMENT ON COLUMN dorobus.content_versions.content_id IS '원래 어떤 문제의 버전인지';
COMMENT ON COLUMN dorobus.content_versions.version IS '버전 번호. 첫 버전은 1. 같은 문제 안에서 순서대로 부여';
COMMENT ON COLUMN dorobus.content_versions.title IS '해당 버전의 문제 제목';
COMMENT ON COLUMN dorobus.content_versions.public_body IS '학생에게 보여 줄 질문·보기·단계·공개 힌트';
COMMENT ON COLUMN dorobus.content_versions.grading_rule IS '서버가 채점할 정답·정답 순서·판정 규칙. 공개 응답에서 제외';
COMMENT ON COLUMN dorobus.content_versions.published_at IS '공개 시각. NULL이면 작성 중인 버전';

-- 09. 과제 배정
CREATE TABLE dorobus.assignments (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    class_group_id UUID NOT NULL,
    content_version_id UUID NOT NULL,
    assigned_on DATE NOT NULL,
    due_at TIMESTAMPTZ DEFAULT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT assignments_pkey PRIMARY KEY (id),
    CONSTRAINT assignments_class_group_id_fkey FOREIGN KEY (class_group_id)
        REFERENCES dorobus.class_groups (id) ON DELETE RESTRICT,
    CONSTRAINT assignments_content_version_id_fkey FOREIGN KEY (content_version_id)
        REFERENCES dorobus.content_versions (id) ON DELETE RESTRICT,
    CONSTRAINT assignments_class_content_date_key UNIQUE (class_group_id, content_version_id, assigned_on),
    CONSTRAINT assignments_id_version_key UNIQUE (id, content_version_id),
    CONSTRAINT assignments_sort_order_nonnegative_check CHECK (sort_order >= 0),
    CONSTRAINT assignments_due_after_assigned_check CHECK (due_at IS NULL OR due_at >= (assigned_on::timestamp AT TIME ZONE 'Asia/Seoul'))
);
COMMENT ON TABLE dorobus.assignments IS '과제 배정';
COMMENT ON COLUMN dorobus.assignments.id IS '과제 배정 고유 번호';
COMMENT ON COLUMN dorobus.assignments.class_group_id IS '과제를 받은 반';
COMMENT ON COLUMN dorobus.assignments.content_version_id IS '출제한 문제의 정확한 버전';
COMMENT ON COLUMN dorobus.assignments.assigned_on IS '과제 출제일. 현재 ASSIGN의 날짜에 대응';
COMMENT ON COLUMN dorobus.assignments.due_at IS '마감 시각. 마감이 없으면 비워 둠';
COMMENT ON COLUMN dorobus.assignments.sort_order IS '과제 목록 표시 순서. 작은 숫자를 먼저 표시';

-- 10. 풀이 시도
CREATE TABLE dorobus.learning_attempts (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    content_version_id UUID NOT NULL,
    assignment_id UUID DEFAULT NULL,
    step_key VARCHAR(100) DEFAULT NULL,
    scope VARCHAR(20) NOT NULL,
    answer JSONB NOT NULL,
    is_correct BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_id UUID NOT NULL,
    CONSTRAINT learning_attempts_pkey PRIMARY KEY (id),
    CONSTRAINT learning_attempts_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT learning_attempts_content_version_id_fkey FOREIGN KEY (content_version_id)
        REFERENCES dorobus.content_versions (id) ON DELETE RESTRICT,
    CONSTRAINT learning_attempts_user_request_key UNIQUE (user_id, request_id),
    CONSTRAINT learning_attempts_scope_step_consistent_check CHECK ((scope = 'step' AND step_key IS NOT NULL AND btrim(step_key) <> '') OR (scope = 'activity' AND step_key IS NULL)),
    CONSTRAINT learning_attempts_answer_object_check CHECK (jsonb_typeof(answer) = 'object'),
    CONSTRAINT learning_attempts_assignment_version_fkey
        FOREIGN KEY (assignment_id, content_version_id)
        REFERENCES dorobus.assignments (id, content_version_id) MATCH SIMPLE ON DELETE RESTRICT
);
COMMENT ON TABLE dorobus.learning_attempts IS '풀이 시도';
COMMENT ON COLUMN dorobus.learning_attempts.id IS '제출 기록 고유 번호';
COMMENT ON COLUMN dorobus.learning_attempts.user_id IS '답안을 제출한 사용자';
COMMENT ON COLUMN dorobus.learning_attempts.content_version_id IS '실제로 푼 문제 버전';
COMMENT ON COLUMN dorobus.learning_attempts.assignment_id IS '어느 과제를 보고 풀었는지. 독립적으로 풀면 비워 둠';
COMMENT ON COLUMN dorobus.learning_attempts.step_key IS '여러 단계 중 답변한 단계의 고정 이름. 예: step-1';
COMMENT ON COLUMN dorobus.learning_attempts.scope IS 'step은 단계 답변, activity는 전체 활동 답안';
COMMENT ON COLUMN dorobus.learning_attempts.answer IS '학생이 제출한 보기 ID·순서·블록 목록 등. 예: {"option_id":"light"}';
COMMENT ON COLUMN dorobus.learning_attempts.is_correct IS '서버 채점 결과. 정답 true / 오답 false';
COMMENT ON COLUMN dorobus.learning_attempts.submitted_at IS '서버가 제출을 접수한 시각';
COMMENT ON COLUMN dorobus.learning_attempts.request_id IS '같은 제출 요청의 재전송을 식별하는 번호. 재시도 때 같은 값을 재사용';

-- 11. 문제 완료
CREATE TABLE dorobus.content_completions (
    user_id UUID NOT NULL,
    content_id UUID NOT NULL,
    completed_version_id UUID NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT content_completions_pkey PRIMARY KEY (user_id, content_id),
    CONSTRAINT content_completions_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT content_completions_content_id_fkey FOREIGN KEY (content_id)
        REFERENCES dorobus.contents (id) ON DELETE RESTRICT,
    CONSTRAINT content_completions_content_version_fkey
        FOREIGN KEY (content_id, completed_version_id)
        REFERENCES dorobus.content_versions (content_id, id) ON DELETE RESTRICT
);
COMMENT ON TABLE dorobus.content_completions IS '문제 완료';
COMMENT ON COLUMN dorobus.content_completions.user_id IS '문제를 완료한 사용자';
COMMENT ON COLUMN dorobus.content_completions.content_id IS '완료한 문제. 수업별이 아닌 문제 자체를 가리킴';
COMMENT ON COLUMN dorobus.content_completions.completed_version_id IS '최초 완료할 때 풀었던 문제 버전';
COMMENT ON COLUMN dorobus.content_completions.completed_at IS '최초 완료를 확정한 시각';

-- 12. 사용자별 스토리 완료
CREATE TABLE dorobus.user_story_progress (
    user_id UUID NOT NULL,
    story_step_id UUID NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    response JSONB DEFAULT NULL,
    CONSTRAINT user_story_progress_pkey PRIMARY KEY (user_id, story_step_id),
    CONSTRAINT user_story_progress_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT user_story_progress_story_step_id_fkey FOREIGN KEY (story_step_id)
        REFERENCES dorobus.story_steps (id) ON DELETE RESTRICT,
    CONSTRAINT user_story_progress_response_object_check CHECK (response IS NULL OR jsonb_typeof(response) = 'object')
);
COMMENT ON TABLE dorobus.user_story_progress IS '사용자별 스토리 완료';
COMMENT ON COLUMN dorobus.user_story_progress.user_id IS '단계를 완료한 사용자';
COMMENT ON COLUMN dorobus.user_story_progress.story_step_id IS '완료한 단계';
COMMENT ON COLUMN dorobus.user_story_progress.completed_at IS '완료를 확정한 시각';
COMMENT ON COLUMN dorobus.user_story_progress.response IS '단계에서 받은 자유 응답 등. 예: {"future_answer":"모두가 즐기는 도로랜드"}';

-- 13. 현재 선택·게임 설정
CREATE TABLE dorobus.player_profiles (
    user_id UUID NOT NULL,
    selected_class_group_id UUID DEFAULT NULL,
    active_world_content_version_id UUID DEFAULT NULL,
    goal_item_id UUID DEFAULT NULL,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT player_profiles_pkey PRIMARY KEY (user_id),
    CONSTRAINT player_profiles_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT player_profiles_selected_class_group_id_fkey FOREIGN KEY (selected_class_group_id)
        REFERENCES dorobus.class_groups (id) ON DELETE SET NULL,
    CONSTRAINT player_profiles_active_world_content_version_id_fkey FOREIGN KEY (active_world_content_version_id)
        REFERENCES dorobus.content_versions (id) ON DELETE SET NULL,
    CONSTRAINT player_profiles_goal_item_id_fkey FOREIGN KEY (goal_item_id)
        REFERENCES dorobus.items (id) ON DELETE SET NULL,
    CONSTRAINT player_profiles_preferences_object_check CHECK (jsonb_typeof(preferences) = 'object')
);
COMMENT ON TABLE dorobus.player_profiles IS '현재 선택·게임 설정';
COMMENT ON COLUMN dorobus.player_profiles.user_id IS '설정의 주인인 사용자';
COMMENT ON COLUMN dorobus.player_profiles.selected_class_group_id IS '현재 화면에서 선택한 반. 수강 이력 전체를 뜻하지 않음';
COMMENT ON COLUMN dorobus.player_profiles.active_world_content_version_id IS '현재 도로랜드에서 수행하려고 선택한 문제 버전';
COMMENT ON COLUMN dorobus.player_profiles.goal_item_id IS '구매 목표로 정한 가구';
COMMENT ON COLUMN dorobus.player_profiles.preferences IS '보이드 성격·음량 같은 설정. 예: {"robot_persona":"kind"}';
COMMENT ON COLUMN dorobus.player_profiles.updated_at IS '설정을 마지막으로 바꾼 시각';

-- 14. CELL 지갑
CREATE TABLE dorobus.wallets (
    user_id UUID NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT wallets_pkey PRIMARY KEY (user_id),
    CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT wallets_balance_nonnegative_check CHECK (balance >= 0)
);
COMMENT ON TABLE dorobus.wallets IS 'CELL 지갑';
COMMENT ON COLUMN dorobus.wallets.user_id IS '지갑 주인';
COMMENT ON COLUMN dorobus.wallets.balance IS '현재 사용 가능한 CELL. 예: 350';
COMMENT ON COLUMN dorobus.wallets.updated_at IS '잔액을 마지막으로 바꾼 시각';

-- 15. CELL 거래 내역
CREATE TABLE dorobus.cell_transactions (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    amount BIGINT NOT NULL,
    reason VARCHAR(50) NOT NULL,
    operation_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT cell_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT cell_transactions_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT cell_transactions_user_operation_key UNIQUE (user_id, operation_id),
    CONSTRAINT cell_transactions_amount_nonzero_check CHECK (amount <> 0),
    CONSTRAINT cell_transactions_reason_nonempty_check CHECK (btrim(reason) <> '')
);
COMMENT ON TABLE dorobus.cell_transactions IS 'CELL 거래 내역';
COMMENT ON COLUMN dorobus.cell_transactions.id IS '거래 내역 고유 번호';
COMMENT ON COLUMN dorobus.cell_transactions.user_id IS '잔액이 바뀐 사용자';
COMMENT ON COLUMN dorobus.cell_transactions.amount IS 'CELL 증감량. 보상 +50, 가구 구매 -200';
COMMENT ON COLUMN dorobus.cell_transactions.reason IS '발생 사유 코드. 예: content_reward, item_purchase, migration_opening';
COMMENT ON COLUMN dorobus.cell_transactions.operation_id IS '서버가 처리하는 업무 한 건의 식별자. 같은 요청 재처리 시 재사용';
COMMENT ON COLUMN dorobus.cell_transactions.created_at IS '거래를 기록한 시각';

-- 16. 보유 가구
CREATE TABLE dorobus.user_items (
    user_id UUID NOT NULL,
    item_id UUID NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    purchase_price_cell BIGINT DEFAULT NULL,
    CONSTRAINT user_items_pkey PRIMARY KEY (user_id, item_id),
    CONSTRAINT user_items_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT user_items_item_id_fkey FOREIGN KEY (item_id)
        REFERENCES dorobus.items (id) ON DELETE RESTRICT,
    CONSTRAINT user_items_purchase_price_nonnegative_check CHECK (purchase_price_cell IS NULL OR purchase_price_cell >= 0)
);
COMMENT ON TABLE dorobus.user_items IS '보유 가구';
COMMENT ON COLUMN dorobus.user_items.user_id IS '가구 소유자';
COMMENT ON COLUMN dorobus.user_items.item_id IS '보유한 가구 종류';
COMMENT ON COLUMN dorobus.user_items.acquired_at IS '가구를 얻은 시각';
COMMENT ON COLUMN dorobus.user_items.purchase_price_cell IS '실제 구매 당시 가격. 구매 이력이 없거나 이관 시 가격을 모르면 NULL';

-- 17. 보상 수령
CREATE TABLE dorobus.reward_claims (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    reward_key VARCHAR(200) NOT NULL,
    operation_id UUID NOT NULL,
    cell_amount BIGINT NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reward_claims_pkey PRIMARY KEY (id),
    CONSTRAINT reward_claims_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES dorobus.users (id) ON DELETE RESTRICT,
    CONSTRAINT reward_claims_user_reward_key UNIQUE (user_id, reward_key),
    CONSTRAINT reward_claims_reward_key_nonempty_check CHECK (btrim(reward_key) <> ''),
    CONSTRAINT reward_claims_cell_amount_nonnegative_check CHECK (cell_amount >= 0)
);
COMMENT ON TABLE dorobus.reward_claims IS '보상 수령';
COMMENT ON COLUMN dorobus.reward_claims.id IS '보상 수령 기록 고유 번호';
COMMENT ON COLUMN dorobus.reward_claims.user_id IS '보상을 받은 사용자';
COMMENT ON COLUMN dorobus.reward_claims.reward_key IS '어떤 보상인지 구별하는 고정 키. 예: content:q-sensor:first-clear';
COMMENT ON COLUMN dorobus.reward_claims.operation_id IS '보상 지급 업무 번호. CELL 내역과 같은 번호 사용';
COMMENT ON COLUMN dorobus.reward_claims.cell_amount IS '실제 지급한 CELL. 스탬프 등만 지급했다면 0';
COMMENT ON COLUMN dorobus.reward_claims.claimed_at IS '보상 수령을 확정한 시각';

-- updated_at은 DEFAULT만으로 갱신되지 않으므로 두 테이블에 공통 트리거 적용
CREATE FUNCTION dorobus.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$function$;
CREATE TRIGGER player_profiles_touch_updated_at
BEFORE UPDATE ON dorobus.player_profiles
FOR EACH ROW EXECUTE FUNCTION dorobus.touch_updated_at();
CREATE TRIGGER wallets_touch_updated_at
BEFORE UPDATE ON dorobus.wallets
FOR EACH ROW EXECUTE FUNCTION dorobus.touch_updated_at();

-- 우선 사용하는 조회 인덱스. PK/UNIQUE로 생성되는 인덱스와 중복하지 않음.
CREATE INDEX class_groups_teacher_status_idx ON dorobus.class_groups (teacher_id, status);
CREATE INDEX enrollments_class_status_idx ON dorobus.enrollments (class_group_id, status);
CREATE INDEX assignments_class_date_idx ON dorobus.assignments (class_group_id, assigned_on);
CREATE INDEX learning_attempts_user_submitted_idx ON dorobus.learning_attempts (user_id, submitted_at);
CREATE INDEX learning_attempts_assignment_submitted_idx ON dorobus.learning_attempts (assignment_id, submitted_at);
CREATE INDEX cell_transactions_user_created_idx ON dorobus.cell_transactions (user_id, created_at);
CREATE INDEX reward_claims_user_operation_idx ON dorobus.reward_claims (user_id, operation_id);

COMMIT;
