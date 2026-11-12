-- 최종본: 공통 15 + 수리 12 + 운전면허 1 = 28개. 001 다음 실행.
-- 이 패키지의 001_core.sql 다음 실행. 예전 저장소 001_init.sql과 섞어 실행하지 않는다.
-- 공통 15개 + 수리 12개 + 003 면허 1개. 반·수강·과제는 유지하고 수리와 독립시킨다.
-- learning_attempts.assignment_id·player_profiles.selected_class_group_id의 기존 NULL 허용과 FK를 유지.
-- 수리 전용 트리거 1개, 기존 프로필·지갑 트리거 2개. 실제 DB 적용 전 검토용 확장안.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Seoul';

-- 초기 전체조회 담당 developer 역할은 확장 파일에서 추가한다.
ALTER TABLE dorobus.users DROP CONSTRAINT users_role_allowed_check;
ALTER TABLE dorobus.users ADD CONSTRAINT users_role_allowed_check
 CHECK (role IN ('student','teacher','developer'));
COMMENT ON COLUMN dorobus.users.role IS 'student 학생 / teacher 기존 강사 / developer 초기 전체조회 담당. API에서 인증 후 역할 확인';

ALTER TABLE dorobus.contents DROP CONSTRAINT contents_kind_allowed_check;
ALTER TABLE dorobus.contents ADD CONSTRAINT contents_kind_allowed_check
 CHECK (kind IN ('quiz','world','homework','coding_challenge','repair_case'));
COMMENT ON COLUMN dorobus.contents.kind IS 'quiz / world(독립 월드 문제) / homework / coding_challenge / repair_case. 본편 스토리 유형 제외';
ALTER TABLE dorobus.contents DROP CONSTRAINT contents_concept_allowed_check;
ALTER TABLE dorobus.contents ADD CONSTRAINT contents_concept_allowed_check
 CHECK (concept IS NULL OR concept IN ('sequence','condition','loop','variable','sensor','data','ai','sort',
 'weight','slope','balance','friction','connection','integration'));

-- 부품 종류만 별도 표로 관리한다. 학생의 보유 부품은 첫 완료에서 계산한다.
CREATE TABLE dorobus.parts (
 id UUID CONSTRAINT parts_pkey PRIMARY KEY DEFAULT gen_random_uuid(),
 code TEXT NOT NULL CONSTRAINT parts_code_key UNIQUE,
 name TEXT NOT NULL,
 CONSTRAINT parts_code_nonempty CHECK (btrim(code) <> ''),
 CONSTRAINT parts_name_nonempty CHECK (btrim(name) <> '')
);
COMMENT ON TABLE dorobus.parts IS '소모되지 않는 수리 해금 부품의 종류. 학생별 보유 재고가 아님';

-- 콘텐츠 버전의 수리 전용 상세. 이름·본문·판정 규칙은 기존 content_versions 재사용.
CREATE TABLE dorobus.repair_case_versions (
 content_version_id UUID PRIMARY KEY,
 content_id UUID NOT NULL,
 content_kind VARCHAR(30) GENERATED ALWAYS AS ('repair_case'::varchar(30)) STORED NOT NULL,
 case_role TEXT NOT NULL CHECK (case_role IN ('onboarding','festival','finale','remote')),
 source_ref TEXT NOT NULL CHECK (btrim(source_ref) <> ''),
 unlock_part_code TEXT CONSTRAINT repair_unlock_part_fk REFERENCES dorobus.parts(code),
 unlock_license_code TEXT CHECK (unlock_license_code = 'remote_repair'),
 FOREIGN KEY (content_id,content_version_id) REFERENCES dorobus.content_versions(content_id,id),
 CONSTRAINT repair_definition_kind_fk FOREIGN KEY(content_id,content_kind)
  REFERENCES dorobus.contents(id,kind),
 UNIQUE(content_version_id,content_id,case_role),
 CHECK (unlock_part_code IS NULL OR case_role = 'festival'),
 CHECK (unlock_license_code IS NULL OR case_role = 'finale')
);
COMMENT ON TABLE dorobus.repair_case_versions IS '수리 사건의 공개 버전 한 개. content_id는 복합 FK 검증을 위한 중복';
COMMENT ON COLUMN dorobus.repair_case_versions.content_kind IS '자동 계산 repair_case. 수리 정의를 비수리 콘텐츠로 위장하거나 NULL로 우회할 수 없도록 실제 contents.kind와 연결';

-- 같은 run이라는 단서 키라도 사파리와 퍼레이드의 단서는 서로 다르다.
CREATE TABLE dorobus.repair_clues (
 content_version_id UUID NOT NULL REFERENCES dorobus.repair_case_versions(content_version_id),
 clue_key TEXT NOT NULL CHECK (btrim(clue_key) <> ''),
 category TEXT NOT NULL CHECK (category IN ('observation','question','inspection','record')),
 title TEXT NOT NULL CHECK (btrim(title) <> ''),
 fact_text TEXT NOT NULL,
 npc_name TEXT,
 display_order INTEGER NOT NULL CHECK (display_order > 0),
 PRIMARY KEY(content_version_id,clue_key),
 UNIQUE(content_version_id,display_order),
 CONSTRAINT repair_clue_npc_check CHECK (
  (category='question' AND npc_name IS NOT NULL AND btrim(npc_name)<>'')
  OR (category<>'question' AND npc_name IS NULL))
);
COMMENT ON TABLE dorobus.repair_clues IS '사건 버전에 속한 단서 한 개. 학생 기록과 분리된 공통 정의';

-- 사파리는 overload 1행, 퍼레이드는 hill/power/balance/route 4행.
CREATE TABLE dorobus.repair_problems (
 content_version_id UUID NOT NULL REFERENCES dorobus.repair_case_versions(content_version_id),
 problem_key TEXT NOT NULL CHECK (btrim(problem_key) <> ''),
 title TEXT NOT NULL CHECK (btrim(title) <> ''),
 display_order INTEGER NOT NULL CHECK (display_order > 0),
 PRIMARY KEY(content_version_id,problem_key),
 UNIQUE(content_version_id,display_order)
);
COMMENT ON TABLE dorobus.repair_problems IS '설명해야 할 원인 한 개. 판정 알고리즘은 버전별 grading_rule 및 Git 규칙 모듈';

-- 시험마다 다른 조건·문구. dependent_controls는 public_body.controls의 키 목록.
CREATE TABLE dorobus.repair_tests (
 content_version_id UUID NOT NULL REFERENCES dorobus.repair_case_versions(content_version_id),
 test_key TEXT NOT NULL CHECK (btrim(test_key) <> ''),
 title TEXT NOT NULL CHECK (btrim(title) <> ''),
 dependent_controls TEXT[] NOT NULL,
 pass_text TEXT NOT NULL,
 fail_text TEXT NOT NULL,
 display_order INTEGER NOT NULL CHECK (display_order > 0),
 PRIMARY KEY(content_version_id,test_key),
 UNIQUE(content_version_id,display_order),
 CHECK (array_position(dependent_controls,NULL) IS NULL)
);
COMMENT ON TABLE dorobus.repair_tests IS '시험 정의 한 개. 설정 의존 키의 유효성은 콘텐츠 발행 검사에서 확인';

-- 유지: 기획된 오답 유형. NULL 분류도 허용하므로 목록 밖 답변을 억지로 끼워 넣지 않는다.
CREATE TABLE dorobus.repair_wrong_hypotheses (
 content_version_id UUID NOT NULL REFERENCES dorobus.repair_case_versions(content_version_id),
 code TEXT NOT NULL,
 name TEXT NOT NULL,
 refute_clue_key TEXT NOT NULL,
 CONSTRAINT repair_wrong_hypotheses_pkey PRIMARY KEY(content_version_id,code),
 CONSTRAINT repair_wrong_code_nonempty CHECK (btrim(code)<>''),
 CONSTRAINT repair_wrong_name_nonempty CHECK (btrim(name)<>''),
 CONSTRAINT repair_wrong_refute_clue_fk FOREIGN KEY(content_version_id,refute_clue_key)
  REFERENCES dorobus.repair_clues(content_version_id,clue_key)
);
COMMENT ON TABLE dorobus.repair_wrong_hypotheses IS '사건 버전 안의 오답 유형 하나. 최초 판정에서 대표 유형 0~1개를 연결';

-- 한 학생의 한 번의 논리적 도전. 창을 다시 열어도 같은 run을 재개한다.
CREATE TABLE dorobus.repair_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES dorobus.users(id),
 content_id UUID NOT NULL,
 content_version_id UUID NOT NULL,
 case_role TEXT NOT NULL,
 phase TEXT NOT NULL DEFAULT 'investigation' CHECK (phase IN ('investigation','bench','completed')),
 settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
 bench_revision INTEGER NOT NULL DEFAULT 0 CHECK (bench_revision >= 0),
 state_revision BIGINT NOT NULL DEFAULT 0 CHECK (state_revision >= 0),
 draft_text TEXT CHECK (draft_text IS NULL OR char_length(draft_text)<=400),
 start_request_id UUID NOT NULL,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 first_diagnosed_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 completed_at TIMESTAMPTZ,
 FOREIGN KEY (content_version_id,content_id,case_role)
  REFERENCES dorobus.repair_case_versions(content_version_id,content_id,case_role),
 UNIQUE(user_id,start_request_id),
 UNIQUE(id,user_id,content_version_id,case_role),
 UNIQUE(id,content_version_id),
 CONSTRAINT repair_runs_check1 CHECK ((phase = 'completed' AND completed_at IS NOT NULL AND completed_at >= started_at)
     OR (phase <> 'completed' AND completed_at IS NULL)),
 CONSTRAINT repair_run_diagnosis_time_check CHECK (
  first_diagnosed_at IS NULL OR (first_diagnosed_at>=started_at
   AND (completed_at IS NULL OR first_diagnosed_at<=completed_at))),
 CONSTRAINT repair_run_regular_diagnosis_check CHECK (
  phase='investigation' OR first_diagnosed_at IS NOT NULL)
);
CREATE UNIQUE INDEX repair_runs_one_open_regular_idx ON dorobus.repair_runs(user_id,content_id)
 WHERE phase <> 'completed';
CREATE INDEX repair_runs_user_started_idx ON dorobus.repair_runs(user_id,started_at);
COMMENT ON TABLE dorobus.repair_runs IS '한 번의 수리 도전과 현재 상태. 진행 중 도전은 재개하고 명시적 재도전은 새 행';

-- 기존 학습 시도는 한 제출이라는 의미를 유지하고 수리 판정 메타데이터를 추가한다.
ALTER TABLE dorobus.learning_attempts
 ADD COLUMN repair_run_id UUID,
 ADD COLUMN repair_case_role TEXT,
 ADD COLUMN attempt_no INTEGER,
 ADD COLUMN verdict TEXT,
 ADD COLUMN judge_source TEXT,
 ADD COLUMN rule_version TEXT,
 ADD COLUMN prompt_version TEXT,
 ADD COLUMN model_id TEXT,
 ADD COLUMN fallback_reason TEXT,
 ADD COLUMN feedback_text TEXT,
 ADD COLUMN wrong_hypothesis_code TEXT,
 ADD COLUMN answer_redacted_at TIMESTAMPTZ,
 ADD CONSTRAINT attempts_repair_run_owner_version_fk FOREIGN KEY(repair_run_id,user_id,content_version_id,repair_case_role)
  REFERENCES dorobus.repair_runs(id,user_id,content_version_id,case_role),
 ADD CONSTRAINT attempts_repair_identity_key UNIQUE(id,repair_run_id,content_version_id),
 ADD CONSTRAINT attempts_repair_sequence_key UNIQUE(repair_run_id,attempt_no),
 ADD CONSTRAINT attempts_wrong_type_fk FOREIGN KEY(content_version_id,wrong_hypothesis_code)
  REFERENCES dorobus.repair_wrong_hypotheses(content_version_id,code),
 ADD CONSTRAINT attempts_wrong_only_check CHECK (wrong_hypothesis_code IS NULL OR (verdict IS NOT NULL AND verdict='wrong')),
 ADD CONSTRAINT attempts_repair_answer_shape_check CHECK (repair_run_id IS NULL OR COALESCE(
    NOT(answer ? 'option_id') AND (
     (answer_redacted_at IS NULL AND jsonb_typeof(answer->'text')='string'
      AND btrim(answer->>'text')<>'' AND char_length(answer->>'text') BETWEEN 1 AND 400)
     OR (answer_redacted_at IS NOT NULL AND answer_redacted_at>=submitted_at AND NOT(answer ? 'text')))
  ,FALSE)),
 ADD CONSTRAINT attempts_repair_metadata_check CHECK (
  (repair_run_id IS NULL AND repair_case_role IS NULL AND verdict IS NULL AND judge_source IS NULL AND rule_version IS NULL
    AND prompt_version IS NULL AND model_id IS NULL AND fallback_reason IS NULL AND feedback_text IS NULL
    AND attempt_no IS NULL AND wrong_hypothesis_code IS NULL AND answer_redacted_at IS NULL)
  OR
  (repair_run_id IS NOT NULL AND repair_case_role IS NOT NULL
    AND repair_case_role IN ('onboarding','festival','finale','remote') AND verdict IS NOT NULL AND verdict IN ('correct','partial','wrong','needs','unclear')
    AND judge_source IS NOT NULL AND judge_source IN ('rule','model','hybrid')
    AND rule_version IS NOT NULL AND btrim(rule_version) <> ''
    AND attempt_no IS NOT NULL AND attempt_no>=1
    AND is_correct = (verdict = 'correct')
    AND scope = 'activity' AND step_key IS NULL
    AND (judge_source = 'rule' OR (prompt_version IS NOT NULL AND model_id IS NOT NULL)))
 );
CREATE INDEX learning_attempts_repair_time_idx ON dorobus.learning_attempts(repair_run_id,submitted_at,id);
COMMENT ON COLUMN dorobus.learning_attempts.verdict IS '수리 판정. false인 is_correct를 모두 오답으로 집계하면 안 됨';
COMMENT ON COLUMN dorobus.learning_attempts.attempt_no IS 'run 안의 제출 순번. 서버가 run 잠금 뒤 발급. request_id와 역할이 다름';
COMMENT ON COLUMN dorobus.learning_attempts.wrong_hypothesis_code IS '대표 오답 유형. wrong인데 NULL이면 미분류. 원본 규칙/프롬프트 버전과 함께 해석';
COMMENT ON COLUMN dorobus.learning_attempts.answer_redacted_at IS '원문 제거 시각. 보관 기간은 아직 미정이며 자동 삭제 작업은 미구현';

-- 최초 확인만 저장. 다시 본 횟수나 시선·실제 이해도를 뜻하지 않는다.
CREATE TABLE dorobus.repair_clue_discoveries (
 run_id UUID NOT NULL,
 content_version_id UUID NOT NULL,
 clue_key TEXT NOT NULL,
 discovery_order INTEGER NOT NULL CHECK (discovery_order > 0),
 discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 note_text TEXT CHECK (note_text IS NULL OR char_length(note_text)<=200),
 PRIMARY KEY(run_id,clue_key),
 UNIQUE(run_id,discovery_order),
 UNIQUE(run_id,content_version_id,clue_key),
 FOREIGN KEY(run_id,content_version_id) REFERENCES dorobus.repair_runs(id,content_version_id),
 FOREIGN KEY(content_version_id,clue_key) REFERENCES dorobus.repair_clues(content_version_id,clue_key)
);
COMMENT ON TABLE dorobus.repair_clue_discoveries IS '한 도전에서 한 단서를 처음 확인한 사실과 현재 메모';

-- 선택 근거와 확인한 단서는 서로 다른 관계다. 미확인 단서는 FK로 거부한다.
CREATE TABLE dorobus.repair_attempt_evidence (
 attempt_id UUID NOT NULL,
 run_id UUID NOT NULL,
 content_version_id UUID NOT NULL,
 clue_key TEXT NOT NULL,
 PRIMARY KEY(attempt_id,clue_key),
 FOREIGN KEY(attempt_id,run_id,content_version_id)
  REFERENCES dorobus.learning_attempts(id,repair_run_id,content_version_id),
 FOREIGN KEY(run_id,content_version_id,clue_key)
  REFERENCES dorobus.repair_clue_discoveries(run_id,content_version_id,clue_key)
);
COMMENT ON TABLE dorobus.repair_attempt_evidence IS '한 제출에서 학생이 근거로 선택한 단서 한 개. 근거 타당성 점수가 아님';

-- partial이라도 이번에 새로 인정된 문제는 별도 행으로 남긴다.
CREATE TABLE dorobus.repair_problem_solutions (
 run_id UUID NOT NULL,
 content_version_id UUID NOT NULL,
 problem_key TEXT NOT NULL,
 attempt_id UUID NOT NULL,
 solved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(run_id,problem_key),
 FOREIGN KEY(attempt_id,run_id,content_version_id)
  REFERENCES dorobus.learning_attempts(id,repair_run_id,content_version_id),
 FOREIGN KEY(content_version_id,problem_key) REFERENCES dorobus.repair_problems(content_version_id,problem_key)
);
COMMENT ON TABLE dorobus.repair_problem_solutions IS '한 도전에서 한 문제의 원인이 처음 인정된 제출. 재판정 기능은 후속 범위';

-- 결과와 설정 스냅샷은 보존하고, 설정 변경으로 효력이 끝나면 invalidated_at만 기록한다.
CREATE TABLE dorobus.repair_trials (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id UUID NOT NULL,
 content_version_id UUID NOT NULL,
 test_key TEXT NOT NULL,
 request_id UUID NOT NULL,
 bench_revision INTEGER NOT NULL CHECK (bench_revision >= 0),
 settings_snapshot JSONB NOT NULL CHECK (jsonb_typeof(settings_snapshot) = 'object'),
 passed BOOLEAN NOT NULL,
 tested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 invalidated_at TIMESTAMPTZ,
 UNIQUE(run_id,request_id),
 FOREIGN KEY(run_id,content_version_id) REFERENCES dorobus.repair_runs(id,content_version_id),
 FOREIGN KEY(content_version_id,test_key) REFERENCES dorobus.repair_tests(content_version_id,test_key),
 CHECK (invalidated_at IS NULL OR (passed AND invalidated_at >= tested_at))
);
CREATE INDEX repair_trials_run_time_idx ON dorobus.repair_trials(run_id,tested_at,id);
COMMENT ON TABLE dorobus.repair_trials IS '시험 버튼을 눌러 서버가 판정한 한 번. 실패와 나중에 무효가 된 통과도 보존';

-- 도움을 요청한 기록과 자동 노출된 도움을 구분한다. 전체 대화 저장 테이블은 만들지 않는다.
CREATE TABLE dorobus.repair_hint_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id UUID NOT NULL,
 content_version_id UUID NOT NULL,
 triggered_by_attempt_id UUID,
 request_id UUID NOT NULL,
 trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('requested','automatic','judge_feedback')),
 phase TEXT NOT NULL CHECK (phase IN ('investigation','bench')),
 hint_key TEXT,
 hint_text TEXT NOT NULL,
 rule_version TEXT NOT NULL,
 shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(run_id,request_id),
 FOREIGN KEY(run_id,content_version_id) REFERENCES dorobus.repair_runs(id,content_version_id),
 FOREIGN KEY(triggered_by_attempt_id,run_id,content_version_id)
  REFERENCES dorobus.learning_attempts(id,repair_run_id,content_version_id)
);
CREATE INDEX repair_hints_run_time_idx ON dorobus.repair_hint_events(run_id,shown_at,id);
COMMENT ON TABLE dorobus.repair_hint_events IS '서버가 확정한 도움 한 건. 요청·자동·판정중 도움과 표시 확인을 구분';

-- 첫 완료는 기존 표에, 재도전 완료는 runs에 남는다.
ALTER TABLE dorobus.content_completions
 ADD COLUMN source_repair_run_id UUID,
 ADD COLUMN content_kind VARCHAR(30) NOT NULL,
 ADD CONSTRAINT completion_content_kind_fk FOREIGN KEY(content_id,content_kind)
 REFERENCES dorobus.contents(id,kind),
 ADD CONSTRAINT completion_repair_source_required CHECK
 ((content_kind='repair_case') = (source_repair_run_id IS NOT NULL));
ALTER TABLE dorobus.reward_claims
 ADD COLUMN source_repair_run_id UUID,
 ADD CONSTRAINT reward_one_per_repair_run_key UNIQUE(source_repair_run_id);
COMMENT ON COLUMN dorobus.content_completions.content_kind IS '필수 콘텐츠 종류. contents(id,kind) 복합 FK로 실제 정의와 일치. 수리는 완료 도전 필수, 비수리는 도전 없이 기록';
COMMENT ON COLUMN dorobus.content_completions.source_repair_run_id IS '수리 최초 완료는 본인의 같은 콘텐츠·버전 completed 도전 필수. 비수리 완료는 NULL. 재도전으로 덮어쓰지 않음';
COMMENT ON COLUMN dorobus.reward_claims.source_repair_run_id IS '수리 CELL 지급의 원인 도전. 한 run당 하나의 합산 CELL 보상';

-- 유지: 도전의 소유자·버전·시작 시각는 생성 후 고정한다.
CREATE FUNCTION dorobus.guard_repair_run_identity() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF ROW(OLD.id,OLD.user_id,OLD.content_id,OLD.content_version_id,OLD.case_role,
        OLD.start_request_id,OLD.started_at)
 IS DISTINCT FROM
    ROW(NEW.id,NEW.user_id,NEW.content_id,NEW.content_version_id,NEW.case_role,
        NEW.start_request_id,NEW.started_at) THEN
  RAISE EXCEPTION 'repair run identity is immutable' USING ERRCODE='23514';
 END IF;
 IF OLD.first_diagnosed_at IS NOT NULL AND OLD.first_diagnosed_at IS DISTINCT FROM NEW.first_diagnosed_at THEN
  RAISE EXCEPTION 'first diagnosis time is immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER repair_runs_identity_guard BEFORE UPDATE ON dorobus.repair_runs
 FOR EACH ROW EXECUTE FUNCTION dorobus.guard_repair_run_identity();

-- 업무 규칙은 API 트랜잭션에서 검증: 소유권·개발자 조회 권한·공개 버전·단서 확인시각·
-- 판정·모든 문제 인정·현재 유효한 시험 통과·종료·보상. JSON 안의 정답을 브라우저에 보내지 않는다.
-- 일반 가설의 최소 8자·JSON 설정 유효성·최초 진단과 정답 제출의 일치는 API 규칙이다.
-- DB char_length는 Unicode 문자 수다. 기존 화면 UTF-16 길이와 단위 통일은 API 연결 때 검토한다.
-- 보관 정책 실행 시 answer뿐 아니라 draft/note/원문을 인용한 feedback/hint도 처리한다.
-- DB 역할 제한·교차 연결 동시성·삭제 작업은 실제 API 구현 단계에서 검증한다.
-- 정의 표는 005_runtime_permissions.sql에서 API 런타임의 수정 권한을 주지 않는다.
-- updated_at은 API가 상태 변경과 함께 now()로 갱신한다. 이 표의 자동 갱신 트리거는 제거했다.

-- 최종 보완 1/2/3. 새 DB 생성용이며 기존 A안에 중복 실행하지 않는다.
ALTER TABLE dorobus.repair_case_versions
 ADD COLUMN entry_rule JSONB NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(entry_rule)='object'),
 ADD COLUMN reward_cell INTEGER NOT NULL DEFAULT 0 CHECK(reward_cell>=0);
COMMENT ON COLUMN dorobus.repair_case_versions.entry_rule IS '서버가 검사하는 사건 입장 규칙. 예: min_festival_completions, requires_remote_license. 수업/월드 스토리는 참조하지 않음';
COMMENT ON COLUMN dorobus.repair_case_versions.reward_cell IS '완료 보상 CELL. v3의 9개 사건은 모두 0. 양수 보상을 위한 일반 경로는 유지. 서버만 읽고 결정';
ALTER TABLE dorobus.repair_clues
 ADD COLUMN unlock_after_keys TEXT[] NOT NULL DEFAULT '{}'::text[]
 CHECK(array_position(unlock_after_keys,NULL) IS NULL AND NOT(clue_key=ANY(unlock_after_keys)));
COMMENT ON COLUMN dorobus.repair_clues.unlock_after_keys IS '비어 있으면 즉시 표시. 선행 단서 중 하나 이상 확인하면 표시. 도움으로 별도 해금 가능. 같은 버전 키 존재·순환은 발행 검사';
ALTER TABLE dorobus.repair_hint_events
 ADD COLUMN revealed_clue_key TEXT,
 ADD COLUMN issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 ALTER COLUMN shown_at DROP NOT NULL,
 ALTER COLUMN shown_at DROP DEFAULT,
 ADD CONSTRAINT hint_revealed_clue_fk FOREIGN KEY(content_version_id,revealed_clue_key)
 REFERENCES dorobus.repair_clues(content_version_id,clue_key),
 ADD CONSTRAINT hint_display_time_check CHECK(shown_at IS NULL OR shown_at>=issued_at);
COMMENT ON COLUMN dorobus.repair_hint_events.revealed_clue_key IS '이 도움 요청이 미리 연 단서. NULL이면 해금 효과 없는 도움. 재접속 시 이 값을 모아 복원';
COMMENT ON COLUMN dorobus.repair_hint_events.issued_at IS '서버가 도움 응답을 확정한 시각. 실제로 읽었다는 의미가 아님';
COMMENT ON COLUMN dorobus.repair_hint_events.shown_at IS '화면의 표시 확인 응답을 받은 시각. 미확인 NULL, 이해도/효과 측정값이 아님';
ALTER TABLE dorobus.repair_runs ADD COLUMN completion_request_id UUID,
 ADD CONSTRAINT runs_completed_request_check CHECK((phase='completed')=(completion_request_id IS NOT NULL)),
 ADD CONSTRAINT runs_owner_role_phase_key UNIQUE(id,user_id,case_role,phase),
 ADD CONSTRAINT runs_completion_identity_key UNIQUE(id,user_id,content_id,content_version_id,phase),
 ADD CONSTRAINT runs_owner_phase_key UNIQUE(id,user_id,phase);
COMMENT ON COLUMN dorobus.repair_runs.completion_request_id IS '완료 처리의 최초 요청. 이후 완료 재호출은 저장된 결과 반환';
ALTER TABLE dorobus.learning_attempts
 ADD CONSTRAINT attempts_verdict_identity_key UNIQUE(id,repair_run_id,content_version_id,verdict),
 ADD CONSTRAINT repair_without_assignment CHECK(repair_run_id IS NULL OR assignment_id IS NULL);
ALTER TABLE dorobus.repair_problem_solutions
 ADD COLUMN accepted_verdict TEXT NOT NULL CHECK(accepted_verdict IN('correct','partial')),
 ADD CONSTRAINT solutions_accepted_attempt_fk FOREIGN KEY(attempt_id,run_id,content_version_id,accepted_verdict)
 REFERENCES dorobus.learning_attempts(id,repair_run_id,content_version_id,verdict);
COMMENT ON COLUMN dorobus.repair_problem_solutions.accepted_verdict IS '원본 제출의 correct/partial과 일치해야 한다. 해당 원인을 실제로 인정할지는 서버 판정';
ALTER TABLE dorobus.content_completions
 ADD COLUMN source_phase TEXT GENERATED ALWAYS AS (CASE WHEN source_repair_run_id IS NOT NULL THEN 'completed'::text END) STORED,
 ADD CONSTRAINT completion_must_be_finished_fk FOREIGN KEY(source_repair_run_id,user_id,content_id,completed_version_id,source_phase)
 REFERENCES dorobus.repair_runs(id,user_id,content_id,content_version_id,phase);
ALTER TABLE dorobus.reward_claims
 ADD COLUMN source_phase TEXT GENERATED ALWAYS AS (CASE WHEN source_repair_run_id IS NOT NULL THEN 'completed'::text END) STORED,
 ADD CONSTRAINT reward_must_be_finished_fk FOREIGN KEY(source_repair_run_id,user_id,source_phase)
 REFERENCES dorobus.repair_runs(id,user_id,phase);
COMMENT ON COLUMN dorobus.content_completions.source_phase IS '도전이 있으면 자동 completed. 수리는 별도 종류 FK·NOT NULL·CHECK가 NULL 도전 우회를 차단하며 강한 FK가 소유자·콘텐츠·버전·상태를 검증';
COMMENT ON COLUMN dorobus.reward_claims.source_phase IS '자동 계산 completed. 미완료 수리 run을 보상으로 연결할 수 없음';
COMMIT;

