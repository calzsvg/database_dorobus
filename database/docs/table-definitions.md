# 도로버스 테이블 정의서

작성일: 2026-11-02 · 버전: 1.0 · 상태: 팀 검토용 초안

앞서 제안한 ERD의 핵심 17개 테이블을 대상으로 한다. 자료형은 PostgreSQL 기준으로 구체화했으며, DB 제품 선택은 아직 확정하지 않은 것으로 가정한다. 문자 길이·상태 코드·정책은 이번 정의서의 제안값이다. DB 생성이나 기존 코드 수정은 수행하지 않았다.

출석·퀘스트·스탬프·탈것·수집 부품·시설 운영·친구 방·보물찾기·미니게임 점수·채팅은 별도 확장 테이블의 대상이다. 이 문서만으로 현재 모든 게임 기능의 저장 구조가 완성되는 것은 아니다.

## 읽는 방법

| 표기 | 쉬운 설명 |
|---|---|
| 컬럼 | 표의 한 열. 이름·가격처럼 하나의 정보를 저장하는 칸 |
| PK | 기본키. 각 행을 구별하는 고유한 값 |
| FK → 테이블.컬럼 | 외래키. 다른 표에 있는 데이터를 가리키는 연결 값 |
| UK | 중복 금지. 같은 값을 두 행에 저장할 수 없음 |
| 복합 PK | 두 개 이상의 컬럼을 합쳐 행을 구별함. 각 컬럼을 따로 중복 금지하는 것은 아님 |
| 필수 O | NULL을 허용하지 않음. 자동값이 있으면 사용자가 직접 입력하지 않아도 됨 |
| 필수 X | NULL 허용. 아직 값이 없거나 해당 사항이 없을 때 비워 둘 수 있음 |
| 기본값 없음 | 자동으로 채워 주는 값이 없음. 필수 컬럼이면 서버가 반드시 값을 전달해야 함 |

### 사용한 자료형

| 자료형 | 의미 | 사용 예 |
|---|---|---|
| UUID | 자동 생성할 수 있는 고유 식별자 | 사용자·수업·문제 번호 |
| VARCHAR(n) | 최대 n자까지의 문자열 | 로그인 아이디, 제목, 상태 코드 |
| TEXT | 이 설계에서 길이 상한을 별도로 지정하지 않은 문자열 | 설명, 인증 식별자 |
| SMALLINT | 작은 범위의 정수 | 레벨, 챕터 |
| INTEGER | 정수 | 버전 번호, 표시 순서 |
| BIGINT | 더 큰 범위의 정수 | CELL 잔액, 거래 금액 |
| BOOLEAN | true 또는 false | 활성 여부, 정답 여부 |
| DATE | 시각 없이 날짜만 | 반 시작일, 과제 출제일 |
| TIMESTAMPTZ | 실제 발생한 날짜·시각 | 가입·제출·구매 시각 |
| JSONB | 구조가 있는 묶음 데이터 | 문제 보기, 제출한 블록 목록, 화면 설정 |

UUID의 `gen_random_uuid()`는 새 번호를 만드는 기본값이고, `now()`는 기록을 넣는 시점의 트랜잭션 시각을 채우는 기본값이다. 기존 데이터 이관 시에는 확인 가능한 실제 시각을 명시적으로 전달한다. 알 수 없는 과거 시각을 새로 만든 시각으로 가장하지 않는다.

TIMESTAMPTZ는 원래 입력한 시간대 이름까지 보관하는 형식은 아니다. 표시·날짜 경계 계산은 서비스 시간대인 Asia/Seoul로 통일한다. 자료형과 시간 처리의 의미는 [PostgreSQL 자료형 문서](https://www.postgresql.org/docs/current/datatype.html), [날짜·시간 문서](https://www.postgresql.org/docs/current/datatype-datetime.html), [UUID 함수 문서](https://www.postgresql.org/docs/current/functions-uuid.html)를 기준으로 확인했다.

## 전체 테이블 목록

| 번호 | 테이블 | 한 행이 뜻하는 것 |
|---|---|---|
| 1 | users | 사용자 한 명 |
| 2 | courses | 교육 과정 하나 |
| 3 | class_groups | 실제 운영하는 반 하나 |
| 4 | enrollments | 학생 한 명의 특정 반 수강 기록 |
| 5 | contents | 재사용하는 문제·학습 활동 하나 |
| 6 | content_versions | 문제의 특정 버전 하나 |
| 7 | assignments | 한 반에 문제 버전을 출제한 기록 하나 |
| 8 | learning_attempts | 학생의 답안 제출 한 번 |
| 9 | content_completions | 학생 한 명의 문제 최초 완료 기록 |
| 10 | story_steps | 스토리 단계 하나 |
| 11 | user_story_progress | 학생 한 명의 스토리 단계 완료 기록 |
| 12 | player_profiles | 사용자 한 명의 현재 선택·설정 |
| 13 | wallets | 사용자 한 명의 현재 CELL 지갑 |
| 14 | cell_transactions | 사용자 한 명의 CELL 증감 내역 하나 |
| 15 | items | 상점 가구 한 종류 |
| 16 | user_items | 사용자 한 명의 특정 가구 보유 기록 |
| 17 | reward_claims | 사용자 한 명의 특정 보상 수령 기록 |

## 1. users — 사용자

학생과 강사를 함께 저장한다. 실제 로그인 인증은 단일 인증 서비스에 연결하는 방식을 가정하며, 비밀번호 자체는 이 테이블에 저장하지 않는다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 사용자 고유 번호. 이름이 같은 사람이 있어도 이 값으로 구별 |
| login_id | VARCHAR(50) | UK | O | 없음 | 로그인용 아이디. 예: a1. 등록 전에 앞뒤 공백 제거·영문 소문자화 |
| display_name | VARCHAR(50) | — | O | 없음 | 화면에 보여 줄 이름. 예: 김도로. 동명이인 허용 |
| role | VARCHAR(20) | — | O | 없음 | 역할. student는 학생, teacher는 강사. 서버가 부여 |
| auth_subject | TEXT | UK | O | 없음 | 인증 서비스가 발급한 사용자 식별자. 비밀번호나 로그인 토큰이 아님 |
| created_at | TIMESTAMPTZ | — | O | now() | 사용자 계정 기록을 만든 시각 |

규칙: role은 student/teacher만 허용한다. login_id와 display_name은 공백만 있는 값을 금지한다. 인증 서비스가 여러 개가 되면 공급자 구분도 추가해야 한다. 테이블 내부 UUID와 인증 서비스 식별자는 서로 다른 용도다.

## 2. courses — 교육 과정

‘어떤 내용을 가르치는가’를 저장한다. 특정 요일·담당 강사는 다음 class_groups에서 관리한다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 교육 과정 고유 번호 |
| code | VARCHAR(50) | UK | O | 없음 | 코드에서 사용하는 고정 이름. 예: l1 |
| title | VARCHAR(200) | — | O | 없음 | 과정명. 예: AI K-POP 프로듀싱 작전 |
| track | VARCHAR(20) | — | O | 없음 | 과정 계열. spark 또는 awake |
| level | SMALLINT | — | O | 없음 | 현재 프로그램의 교육 레벨. 1~8 |
| description | TEXT | — | X | NULL | 과정의 자세한 소개 |
| display_meta | JSONB | — | O | '{}'::jsonb | 과정 소개용 아이콘·미션 문구·도구·키트·결과물 안내 묶음 |
| is_active | BOOLEAN | — | O | true | 새로 제공할 수 있는 과정인지. false라도 과거 기록은 유지 |

규칙: 현재 기준으로 track은 spark/awake, level은 1~8이다. code와 title은 빈 값을 금지한다. display_meta는 JSON 객체로 제한한다. 예: `{"icon":"🎤","tools":["Suno"],"kit":"초음파 피아노"}`. 자주 검색·관리하는 정보가 되면 해당 항목을 정식 컬럼이나 별도 테이블로 분리한다.

## 3. class_groups — 개설 반

같은 과정을 서로 다른 기간이나 강사가 운영할 수 있게 한다. 예: ‘K-POP 월요일 A반’.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 반 고유 번호 |
| course_id | UUID | FK → courses.id | O | 없음 | 이 반이 사용하는 교육 과정 |
| teacher_id | UUID | FK → users.id | O | 없음 | 담당 강사의 사용자 번호 |
| name | VARCHAR(100) | — | O | 없음 | 반 이름. 예: K-POP 월요일 A반 |
| starts_on | DATE | — | O | 없음 | 수업 운영 시작일 |
| ends_on | DATE | — | X | NULL | 운영 종료일. 미정이면 비워 둠 |
| status | VARCHAR(20) | — | O | 'planned' | planned 준비 중 / active 운영 중 / completed 종료 / cancelled 취소 |

규칙: 종료일은 시작일보다 빠를 수 없다. teacher_id가 존재하는지뿐 아니라 해당 사용자가 teacher인지 서버가 확인한다. 강사 한 명이 반 여러 개를 담당할 수 있다. 수강 인원은 enrollments에서 계산한다.

## 4. enrollments — 수강 기록

학생과 반을 연결한다. ‘김도로가 월요일 A반을 수강한다’는 사실 하나가 한 행이다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 수강 기록 고유 번호 |
| user_id | UUID | FK → users.id | O | 없음 | 수강하는 학생 |
| class_group_id | UUID | FK → class_groups.id | O | 없음 | 수강하는 반 |
| status | VARCHAR(20) | — | O | 'active' | active 수강 중 / completed 수료 / withdrawn 중도 취소 |
| enrolled_at | TIMESTAMPTZ | — | O | now() | 수강 등록 시각 |
| completed_at | TIMESTAMPTZ | — | X | NULL | 수료 시각. 수강 중·중도 취소이면 비워 둠 |

규칙: `(user_id, class_group_id)`는 함께 중복 금지다. status가 completed일 때만 completed_at을 채우며, 그 시각은 enrolled_at 이상이다. 학생 역할과 수강 가능한 반인지 서버가 확인한다. 취소 후 같은 반에 재등록하면 현재 제안에서는 기존 행 상태를 변경하며, 여러 차례 등록 이력까지 필요하면 별도 이력 구조를 추가한다.

## 5. contents — 문제·학습 활동

문제가 어느 수업에 쓰이는지와 별개로, 재사용 가능한 학습 활동 자체를 구별한다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 문제·활동 고유 번호 |
| code | VARCHAR(100) | UK | O | 없음 | 코드상의 고정 식별자. 예: q-sensor, w-condition |
| kind | VARCHAR(30) | — | O | 없음 | quiz 일반 문제 / world 월드 문제. 확장값: story_mission, homework, coding_challenge |
| concept | VARCHAR(30) | — | X | NULL | 학습 개념. 예: sensor 센서, condition 조건. 해당 없으면 비워 둠 |
| is_active | BOOLEAN | — | O | true | 새 출제에 사용할 수 있는 활동인지 |

규칙: kind는 표의 다섯 값만 허용한다. concept는 현재 sequence/condition/loop/variable/sensor/data/ai/sort 중 하나 또는 NULL이다. 문제 본문을 바꾸어도 같은 문제로 취급한다면 id와 code를 유지한다. 새로 완료해야 하는 별개 문제라면 새 contents를 만든다.

## 6. content_versions — 문제 버전

학생이 풀었던 당시의 문제와 채점 기준을 보관한다. 공개된 버전은 수정하지 않고 새 버전을 만든다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 특정 문제 버전의 고유 번호 |
| content_id | UUID | FK → contents.id | O | 없음 | 원래 어떤 문제의 버전인지 |
| version | INTEGER | — | O | 없음 | 버전 번호. 첫 버전은 1. 같은 문제 안에서 순서대로 부여 |
| title | VARCHAR(200) | — | O | 없음 | 해당 버전의 문제 제목 |
| public_body | JSONB | — | O | 없음 | 학생에게 보여 줄 질문·보기·단계·공개 힌트 |
| grading_rule | JSONB | — | O | 없음 | 서버가 채점할 정답·정답 순서·판정 규칙. 공개 응답에서 제외 |
| published_at | TIMESTAMPTZ | — | X | NULL | 공개 시각. NULL이면 작성 중인 버전 |

규칙: `(content_id, version)` 중복 금지, version >= 1이다. public_body와 grading_rule은 JSON 객체다. 실제 과제 배정·풀이에는 공개된 버전만 사용한다. 서버는 미래 공개 시각도 검사한다. 기존 content.js의 answer/ok/정답 순서 등을 public_body에 그대로 복사하지 않고 채점용 정보로 분리한다.

예: public_body가 `{"q":"밝기를 재는 센서는?","options":[{"id":"light","label":"조도센서"},{"id":"distance","label":"초음파센서"}]}`이면 grading_rule은 `{"correct_option_id":"light"}`처럼 저장한다. 보기 표시 순서가 바뀌어도 안정적인 보기 ID로 답을 판정한다. JSONB의 저장 의미는 [PostgreSQL JSON 문서](https://www.postgresql.org/docs/current/datatype-json.html)를 참고했다.

## 7. assignments — 과제 배정

반과 문제 버전을 연결한다. 같은 문제를 두 반에 내면 이 테이블에는 두 행이 생긴다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 과제 배정 고유 번호 |
| class_group_id | UUID | FK → class_groups.id | O | 없음 | 과제를 받은 반 |
| content_version_id | UUID | FK → content_versions.id | O | 없음 | 출제한 문제의 정확한 버전 |
| assigned_on | DATE | — | O | 없음 | 과제 출제일. 현재 ASSIGN의 날짜에 대응 |
| due_at | TIMESTAMPTZ | — | X | NULL | 마감 시각. 마감이 없으면 비워 둠 |
| sort_order | INTEGER | — | O | 0 | 과제 목록 표시 순서. 작은 숫자를 먼저 표시 |

규칙: 현재 초안은 `(class_group_id, content_version_id, assigned_on)` 중복을 금지하고 sort_order >= 0으로 한다. 같은 날 같은 버전을 여러 번 내야 한다면 출제 회차 컬럼을 추가한다. due_at이 있으면 한국 날짜 기준 출제일 시작 이후여야 한다. assigned_on은 마감일이 아니다. 반 담당 강사가 출제 가능한지 서버가 확인한다.

## 8. learning_attempts — 풀이 시도

답안을 제출할 때마다 한 행을 추가한다. 오답을 정답으로 덮어쓰지 않는다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 제출 기록 고유 번호 |
| user_id | UUID | FK → users.id | O | 없음 | 답안을 제출한 사용자 |
| content_version_id | UUID | FK → content_versions.id | O | 없음 | 실제로 푼 문제 버전 |
| assignment_id | UUID | FK → assignments.id | X | NULL | 어느 과제를 보고 풀었는지. 독립적으로 풀면 비워 둠 |
| step_key | VARCHAR(100) | — | X | NULL | 여러 단계 중 답변한 단계의 고정 이름. 예: step-1 |
| scope | VARCHAR(20) | — | O | 없음 | step은 단계 답변, activity는 전체 활동 답안 |
| answer | JSONB | — | O | 없음 | 학생이 제출한 보기 ID·순서·블록 목록 등. 예: {"option_id":"light"} |
| is_correct | BOOLEAN | — | O | 없음 | 서버 채점 결과. 정답 true / 오답 false |
| submitted_at | TIMESTAMPTZ | — | O | now() | 서버가 제출을 접수한 시각 |
| request_id | UUID | — | O | 없음 | 같은 제출 요청의 재전송을 식별하는 번호. 재시도 때 같은 값을 재사용 |

규칙: `(user_id, request_id)` 중복 금지다. request_id에 새 자동 기본값을 두면 재전송을 구별할 수 없으므로 요청 계층이 전달한다. scope=step이면 step_key가 필수이고 scope=activity이면 step_key는 NULL이다. answer는 JSON 객체로 제한한다. assignment_id가 있으면 그 과제의 문제 버전과 content_version_id가 일치해야 한다. 사용자의 과제 접근 권한, 단계 존재 여부, 정답 여부는 서버가 확인한다.

현재 범위는 즉시 정답/오답을 판정하는 활동이다. 수동 채점이 필요해지면 is_correct를 임의로 false로 넣지 말고 채점 상태·채점 시각 등의 구조를 확장한다. 단계별 제출 횟수와 전체 활동 횟수는 scope를 나누어 집계한다.

## 9. content_completions — 문제 완료

현재 프로젝트처럼 같은 문제의 완료를 수업 간 공유한다. 완료 여부와 보상 수령 여부는 별개다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| user_id | UUID | 복합 PK, FK → users.id | O | 없음 | 문제를 완료한 사용자 |
| content_id | UUID | 복합 PK, FK → contents.id | O | 없음 | 완료한 문제. 수업별이 아닌 문제 자체를 가리킴 |
| completed_version_id | UUID | FK → content_versions.id | O | 없음 | 최초 완료할 때 풀었던 문제 버전 |
| completed_at | TIMESTAMPTZ | — | O | now() | 최초 완료를 확정한 시각 |

규칙: PK는 `(user_id, content_id)`다. 한 학생이 여러 문제를 완료할 수 있고, 한 문제도 여러 학생이 완료할 수 있다. 같은 학생·같은 문제 조합은 한 번만 저장한다. completed_version_id는 반드시 content_id에 속하는 버전이어야 한다. 재풀이 기록은 learning_attempts에 추가하고 최초 완료 기록은 유지한다. 완료 정책을 수업별로 바꾸면 별도 제출 완료 구조가 필요하다.

## 10. story_steps — 스토리 단계

학생마다 공통으로 사용하는 스토리 단계 목록이다. 문제의 정답을 맞히는 것과 스토리 단계가 끝나는 것은 별도로 판정한다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 스토리 단계 고유 번호 |
| code | VARCHAR(100) | UK | O | 없음 | 코드에서 사용할 고정 이름. 예: carCheckDone |
| chapter | SMALLINT | — | O | 없음 | 단계가 속한 챕터 번호. 예: 1. 도입부는 0 |
| title | VARCHAR(200) | — | O | 없음 | 사람이 읽는 단계 이름. 예: 자동차 출발 점검 완료 |
| sort_order | INTEGER | — | O | 0 | 같은 챕터 안의 표시 순서 |

규칙: chapter >= 0, sort_order >= 0이다. sort_order만으로 선행 조건을 모두 표현하지 않는다. 어떤 수업·부품·다른 단계가 필요한지는 초기에는 서버의 스토리 규칙으로 검증한다. 운영자가 선행 조건을 편집해야 하면 별도 연결 구조를 추가한다.

## 11. user_story_progress — 사용자별 스토리 완료

사용자와 완료한 스토리 단계를 연결한다. 행이 없으면 아직 완료하지 않은 것으로 본다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| user_id | UUID | 복합 PK, FK → users.id | O | 없음 | 단계를 완료한 사용자 |
| story_step_id | UUID | 복합 PK, FK → story_steps.id | O | 없음 | 완료한 단계 |
| completed_at | TIMESTAMPTZ | — | O | now() | 완료를 확정한 시각 |
| response | JSONB | — | X | NULL | 단계에서 받은 자유 응답 등. 예: {"future_answer":"모두가 즐기는 도로랜드"} |

규칙: PK는 `(user_id, story_step_id)`다. response가 있으면 JSON 객체로 저장한다. 자유 응답은 실제로 입력한 단계에만 붙인다. 미완료/진행 중/실패 상태와 임시 답안까지 필요해지면 현재 ‘완료 기록’의 의미를 유지하면서 별도 진행 상태를 추가한다.

## 12. player_profiles — 현재 선택·게임 설정

사용자 한 명당 최대 한 행이다. 계속 쌓이는 이력과 현재 선택을 구분하기 위해 둔다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| user_id | UUID | PK, FK → users.id | O | 없음 | 설정의 주인인 사용자 |
| selected_class_group_id | UUID | FK → class_groups.id | X | NULL | 현재 화면에서 선택한 반. 수강 이력 전체를 뜻하지 않음 |
| active_world_content_version_id | UUID | FK → content_versions.id | X | NULL | 현재 도로랜드에서 수행하려고 선택한 문제 버전 |
| goal_item_id | UUID | FK → items.id | X | NULL | 구매 목표로 정한 가구 |
| preferences | JSONB | — | O | '{}'::jsonb | 보이드 성격·음량 같은 설정. 예: {"robot_persona":"kind"} |
| updated_at | TIMESTAMPTZ | — | O | now() | 설정을 마지막으로 바꾼 시각 |

규칙: preferences는 JSON 객체다. CELL·문제 완료·구매 내역·스탬프 같은 핵심 기록을 여기에 넣지 않는다. 선택한 반을 볼 권한과 선택한 문제가 world 유형인지 서버가 확인한다. updated_at은 생성 시 기본값만으로 자동 갱신되지 않으므로 변경 시 서버 또는 트리거가 갱신한다.

## 13. wallets — CELL 지갑

사용자의 현재 잔액이다. 사용자가 게임 경제 기능을 처음 사용하기 전에 지갑을 생성한다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| user_id | UUID | PK, FK → users.id | O | 없음 | 지갑 주인 |
| balance | BIGINT | — | O | 0 | 현재 사용 가능한 CELL. 예: 350 |
| updated_at | TIMESTAMPTZ | — | O | now() | 잔액을 마지막으로 바꾼 시각 |

규칙: balance >= 0이며 정수다. 관련 거래 내역과 같은 트랜잭션에서 갱신한다. 동시 구매에는 행 잠금이나 잔액 조건부 갱신을 적용한다. updated_at도 함께 갱신한다. 금액을 웹 화면에 전달할 때는 큰 정수의 정밀도가 손실되지 않도록 문자열 전달 또는 허용 상한 정책을 사용한다.

## 14. cell_transactions — CELL 거래 내역

사용자별로 CELL이 왜 늘거나 줄었는지 저장한다. 최초 잔액 지급·이관도 내역으로 남겨 잔액을 설명할 수 있게 한다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 거래 내역 고유 번호 |
| user_id | UUID | FK → users.id | O | 없음 | 잔액이 바뀐 사용자 |
| amount | BIGINT | — | O | 없음 | CELL 증감량. 보상 +50, 가구 구매 -200 |
| reason | VARCHAR(50) | — | O | 없음 | 발생 사유 코드. 예: content_reward, item_purchase, migration_opening |
| operation_id | UUID | — | O | 없음 | 서버가 처리하는 업무 한 건의 식별자. 같은 요청 재처리 시 재사용 |
| created_at | TIMESTAMPTZ | — | O | now() | 거래를 기록한 시각 |

규칙: amount != 0이고 `(user_id, operation_id)` 중복 금지다. 같은 업무에서 한 사용자의 증감이 여러 개면 해당 사용자에게 적용할 순증감 한 행으로 기록한다. 사용자 간 이동은 같은 operation_id로 서로 다른 사용자 내역을 만들 수 있다. 단순 잔액 덮어쓰기나 기존 확정 내역 수정 대신 새 보정 내역을 기록한다.

operation_id는 이 17개 테이블 안에서는 다른 테이블을 직접 가리키는 FK가 아니다. reward_claims의 같은 값과 지급 작업을 묶어 추적하지만, 값이 같다는 사실만으로 DB가 두 기록의 일치를 보장하지 않는다. 서버가 지갑·내역·보상 기록을 같은 트랜잭션으로 처리한다.

## 15. items — 상점 가구

가구의 공통 상품 정보다. 가구가 누구에게 있는지는 user_items에 저장한다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 가구 종류 고유 번호 |
| code | VARCHAR(50) | UK | O | 없음 | 기존 화면·3D 모델과 연결할 고정 이름. 예: plant |
| name | VARCHAR(100) | — | O | 없음 | 상품 이름. 예: 몬스테라 화분 |
| description | TEXT | — | X | NULL | 상품 소개 문구 |
| price_cell | BIGINT | — | O | 없음 | 현재 판매 가격. 예: 200 |
| display_meta | JSONB | — | O | '{}'::jsonb | 표시 색상·아이콘·모델 연결 키 등. 예: {"color":"#4CAF6E"} |
| is_active | BOOLEAN | — | O | true | 판매 중인지. 판매 중단해도 기존 보유 기록은 유지 |

규칙: price_cell >= 0, display_meta는 JSON 객체다. 구매 가격은 클라이언트가 보낸 값을 신뢰하지 않고 서버가 이 테이블에서 읽는다. 색상·모델 등은 등록 가능한 값만 검증한다. 현재 정의는 가구용이며 탈것·배지를 자동으로 같은 상품으로 취급하지 않는다.

## 16. user_items — 보유 가구

누가 어떤 가구를 보유하는지 저장한다. 현재 코드처럼 같은 가구 종류는 사용자당 하나만 보유한다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| user_id | UUID | 복합 PK, FK → users.id | O | 없음 | 가구 소유자 |
| item_id | UUID | 복합 PK, FK → items.id | O | 없음 | 보유한 가구 종류 |
| acquired_at | TIMESTAMPTZ | — | O | now() | 가구를 얻은 시각 |
| purchase_price_cell | BIGINT | — | X | NULL | 실제 구매 당시 가격. 구매 이력이 없거나 이관 시 가격을 모르면 NULL |

규칙: PK는 `(user_id, item_id)`다. purchase_price_cell은 NULL 또는 0 이상이다. 가격이 0인 구매와 구매 가격을 모르는 경우는 각각 0과 NULL로 구별한다. 상품의 현재 가격이 바뀌어도 이 값은 유지한다. 수량·여러 개 배치·개별 가구의 고장 상태가 필요하면 가구 개체별 번호를 두는 구조로 확장한다.

## 17. reward_claims — 보상 수령

‘이 학생이 이 보상을 이미 받았는가’를 판정하는 기록이다. 문제 완료와 동시에 받거나 나중에 별도로 받을 수 있다.

| 컬럼 | 자료형 | 키·연결 | 필수 | 기본값 | 쉬운 설명·예시 |
|---|---|---|---|---|---|
| id | UUID | PK | O | gen_random_uuid() | 보상 수령 기록 고유 번호 |
| user_id | UUID | FK → users.id | O | 없음 | 보상을 받은 사용자 |
| reward_key | VARCHAR(200) | — | O | 없음 | 어떤 보상인지 구별하는 고정 키. 예: content:q-sensor:first-clear |
| operation_id | UUID | — | O | 없음 | 보상 지급 업무 번호. CELL 내역과 같은 번호 사용 |
| cell_amount | BIGINT | — | O | 0 | 실제 지급한 CELL. 스탬프 등만 지급했다면 0 |
| claimed_at | TIMESTAMPTZ | — | O | now() | 보상 수령을 확정한 시각 |

규칙: `(user_id, reward_key)` 중복 금지, cell_amount >= 0이다. 같은 요청을 새 operation_id로 보내도 reward_key가 같으면 다시 지급하지 않는다. 같은 업무에서 여러 종류의 보상을 지급할 수 있어 operation_id 자체에는 단독 고유 제약을 두지 않는다. 향후 스탬프·아이템 보상은 각각의 지급 기록도 같은 트랜잭션에 포함한다. cell_amount만으로 모든 보상의 상세 내용을 표현하지는 않는다.

## 함께 적용할 연결·제약조건

PK·FK·중복 금지·값 범위 제약의 의미는 [PostgreSQL 제약조건 문서](https://www.postgresql.org/docs/current/ddl-constraints.html)를 기준으로 한다. 아래 제약은 구현 시 DB와 서버에 실제로 추가해야 하며, 문서 작성만으로 적용되지는 않는다.

| 대상 | 권장 적용 방식 |
|---|---|
| PK, FK, UK, 복합 PK·고유키 | DB 제약조건 |
| 잔액·가격·버전·순서의 범위 | DB CHECK와 NOT NULL |
| 상태·역할 코드의 허용값 | 초기에는 VARCHAR + CHECK. 변경 시 마이그레이션 |
| 종료일·수료 시각·scope와 step_key 관계 | 같은 행을 비교하는 DB CHECK |
| JSONB 객체 형식 | DB에서 jsonb_typeof(...) = 'object' 검사. 필드별 내용은 서버 검증 |
| 풀이의 과제와 문제 버전 일치 | 복합 FK `(assignment_id, content_version_id)` → assignments `(id, content_version_id)` 권장 |
| 완료 버전이 완료 문제에 속함 | 복합 FK `(content_id, completed_version_id)` → content_versions `(content_id, id)` 권장 |
| 반 담당자가 실제 강사인지 | 서버 권한·역할 검사. 단순 FK만으로는 확인 불가 |
| 사용자의 반·과제 접근 권한 | 서버 검사. FK는 수강 자격까지 보장하지 않음 |
| 선행 스토리 충족, 정답 판정, 보상 조건 | 서버 업무 규칙 |
| 지갑·거래·보상·가구의 동시 확정 | DB 트랜잭션과 잠금·조건부 갱신 |

복합 FK를 사용하려면 참조 대상에 assignments `(id, content_version_id)`, content_versions `(content_id, id)`의 UNIQUE 제약을 함께 둔다. assignment_id가 NULL이면 과제 맥락의 복합 FK 검사는 건너뛰되, content_version_id의 개별 FK는 유지한다.

참조되는 사용자·문제·과정·상품은 초기에는 물리 삭제를 제한하고, 제공 중단은 is_active나 상태값으로 처리한다. player_profiles의 선택용 FK는 대상 삭제 시 NULL 처리할 수 있다. 실제 계정 삭제·익명화·보존 기간은 운영 정책을 정한 뒤 별도 반영한다.

### 우선 필요한 조회 인덱스

| 테이블 | 후보 인덱스 | 목적 |
|---|---|---|
| class_groups | (teacher_id, status) | 강사의 담당 반 목록 |
| enrollments | (class_group_id, status) | 반의 수강생·수강 인원 |
| assignments | (class_group_id, assigned_on) | 반의 과제 목록 |
| learning_attempts | (user_id, submitted_at) | 학생별 시간순 풀이 기록 |
| learning_attempts | (assignment_id, submitted_at) | 과제별 제출 기록 |
| cell_transactions | (user_id, created_at) | 사용자의 CELL 이용 내역 |
| reward_claims | (user_id, operation_id) | 지급 작업별 보상 확인 |

PK·고유 제약으로 이미 지원되는 조회에는 같은 인덱스를 중복 생성하지 않는다. 필요에 따라 다른 FK 조회·삭제 검사 인덱스를 추가한다.

## 예시: 학생 한 명의 활동이 기록되는 방식

아래 A·B·C 등은 이해를 위한 별칭이며 실제 컬럼에는 UUID가 들어간다.

1. **가입:** users에 학생 A를 만들고 player_profiles와 잔액 0인 wallets를 준비한다.
2. **수강:** enrollments에 ‘학생 A, 반 B’를 저장한다.
3. **출제:** assignments에 ‘반 B, 센서 문제 버전 C’를 저장한다.
4. **풀이:** 두 번 틀리고 한 번 맞혔다면 learning_attempts에 3행을 추가한다. 각각 다른 request_id를 사용한다.
5. **완료:** content_completions에 ‘학생 A, 센서 문제’를 1행 저장한다. 완료한 버전은 C다.
6. **보상:** reward_claims에 첫 완료 보상을 저장하고, cell_transactions에 +50, wallets에 잔액 +50을 함께 반영한다.
7. **구매:** 잔액이 충분한 상태에서 화분을 사면 user_items에 보유 기록, cell_transactions에 -200을 넣고 wallets에서 200을 차감한다. 구매 당시 가격도 200으로 남긴다.

같은 보상 버튼을 다시 눌러도 `(user_id, reward_key)`가 겹쳐 추가 지급하지 않는다. 화분도 `(user_id, item_id)`가 겹쳐 같은 종류를 중복 보유하지 않는다.

## 기존 설계에서 구체화한 사항

- 모든 고유 번호와 연결 번호를 UUID로 통일했다. 기존 l1·q-sensor·plant는 code로 유지한다.
- 기존 표의 핵심 컬럼을 유지하고, 과정·상품의 현재 소개 내용을 담기 위한 display_meta와 상품 설명을 추가했다.
- NULL 여부, 기본값, 상태 코드, 중복 방지 범위, 시각의 의미를 구체화했다.
- ‘문제 최초 완료는 수업 간 공유’, ‘동일 가구는 한 개 보유’, ‘단일 인증 서비스 연결’을 기본 정책으로 삼았다.
- 학생 레벨과 CELL·가구·설정의 기존 체험용 값은 신뢰 가능한 서버 기록으로 자동 인정하지 않는다. 필요한 경우 검증한 초기 데이터로 이관한다.
- 기존 누적 시도 수·이관 시각 미상·과거 출석 등은 복원 가능한 범위와 별도 집계 보존 방식을 정한 뒤 이관한다. 오래된 기록을 임의로 새 제출·새 완료로 만들지 않는다.

기존 논리 설계와 코드 근거는 [도로버스 DB 설계 제안서](design-proposal.md)에 정리되어 있다.


## SQL 구현과의 대응

생성 SQL은 [001_init.sql](../migrations/001_init.sql)이다. 모든 테이블은 dorobus 스키마에 생성한다. DB CHECK와 복합 FK, 일곱 조회 인덱스를 포함한다. player_profiles와 wallets의 updated_at은 UPDATE 트리거로 자동 갱신하도록 구체화했다. 나머지 권한·채점·보상 업무 규칙은 서버 구현 대상이다.
