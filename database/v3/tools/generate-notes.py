"""실행 결과와 DB 메타데이터를 읽어 v3 안내 문서 생성. 예상 집계는 기록하지 않는다."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
def load(p):return json.loads((R/p).read_text(encoding='utf8'))
def write(p,s):(R/p).write_text(s.strip()+'\n',encoding='utf8')
result=load('validation/results.json');comparison=load('validation/schema-comparison.json');m=load('validation/schema-metadata.json');seed=load('validation/seed-validation.json')
assert result['failed']==comparison['failed']==0
b=comparison['before'];a=comparison['after']
assert (m['table_count'],m['column_count'])==(a['tables'],a['columns'])
fields=[('테이블','tables'),('컬럼','columns'),('PK','primary_keys'),('UNIQUE 제약','unique_constraints'),('FK','foreign_keys'),('CHECK','checks'),('PK/UNIQUE/FK/CHECK 합계','constraints_excluding_not_null'),('NOT NULL 컬럼','not_null_columns'),('NOT NULL 포함 pg_constraint 행','catalog_constraints_including_not_null'),('기본 인덱스','indexes'),('선택 006 적용 후 인덱스','indexes_with_optional'),('사용자 정의 트리거','user_triggers'),('수리 사건','repair_cases')]
counts='\n'.join(f'- {label}: {b[key]} → {a[key]}' for label,key in fields)
passes=f"SQL·서비스 시나리오 {result['passed']}개 PASS / {result['failed']}개 FAIL, 독립 v2/v3 스키마 비교 {comparison['passed']}개 PASS / {comparison['failed']}개 FAIL, 시드 발행 검사 {len(seed['checks'])}개 PASS."
engine=f"PGlite 0.5.14, 단일 연결. 실제 version(): {result['engine']}"
limits='이번 v3는 실제 PostgreSQL 16.15 서버에서 재실행하지 않았다. 실제 PostgreSQL 다중 연결의 경쟁·교착·장애 복구, 실제 로그인 권한 배포, 인증·HTTP·프론트엔드·Gemini 연동, 운영 DB 이관·배포는 미실행이다. Promise.all 재시도는 단일 연결 어댑터가 직렬화하며 다중 연결 동시성 통과로 세지 않는다.'
write('docs/v3-changes.txt',f'''도로버스 v2 → v3 변경·실측 보고 / 2026-11-12

결정
이전의 일일 수리 유지 결정을 철회한다. v3에서는 일일 수리를 설계 범위에서 제외한다. 이 결정이 과거 유지 문구보다 우선한다. 원본 v2 폴더·ZIP·ZIP 해시는 보존하고 별도 v3 폴더와 ZIP을 만든다.

실제 변경
- sql/002_repair.sql: case_role은 onboarding/festival/finale/remote만 허용. business_date, 날짜 CHECK, attempts_daily_verdict_check, repair_runs_daily_once_idx를 삭제했다.
- CHECK 4개에서 daily 허용/예외와 option_id 선택형 답안 허용 분기를 제거했다. option_id 키를 거부하는 일반 가설 검사는 유지한다. repair_runs_one_open_regular_idx는 phase<>'completed' 조건만 쓴다. 식별자 보호 함수는 business_date 비교만 제거했다.
- 기존 완료 시각 CHECK는 repair_runs_check1이라는 v2 이름을 명시하여, 앞의 일일 CHECK 삭제에 따른 자동 이름 변경까지 방지했다.
- daily:carousel, daily:ferris, daily:coaster, daily:sign, daily:harmonia의 contents/content_versions/repair_case_versions를 삭제했다. source의 일일 스냅샷·보상값·ID와 시드 생성 분기도 제거했다.
- 서버의 dailyIds/dailyTargets/daily-choice-v1와 start/help/submit/rethink/adjust/test/complete의 일일 분기를 제거했다. 답안은 text와 evidence이며 optionId/option_id를 서비스에서도 거부한다.
- Q05 일일 집계 삭제 후 뒤 번호를 당겨 분석 조회문은 7개다. 일일 대상·날짜 경계·다음 날 지급·일일 중복 지급 시나리오를 제거했다.
- README, 설계 노트 5절, 실행 안내 E절, HTML, SVG/Mermaid ERD를 v3 실행 메타데이터와 결과로 다시 생성했다. 프론트 후속 제거 목록은 설계 노트 7절에만 적었다.

그대로 유지
공통 15 + 수리 정의 6 + 수리 기록 6 + 면허 1 테이블 구조, 면허 FK/발급 함수/런타임 권한, content_kind FK·completion_repair_source_required·completion_must_be_finished_fk, wallets/cell_transactions/reward_claims, reward_claims.source_repair_run_id·reward_must_be_finished_fk·run당 보상 UNIQUE, repair_case_versions.reward_cell을 유지했다.
남은 사건 9개는 모두 reward_cell=0이다. complete는 reward_cell>0이고 최초 완료일 때 지급하는 일반 경로를 유지한다. 자동차 이외의 사건은 운전면허, 축제 4종 후 퍼레이드, 퍼레이드 후 원격 자격 규칙이 같다.
sql/001_core.sql은 스키마 COMMENT의 일일 유지 문구만 제외 결정으로 바꿨다. 003_license.sql, 004_license_issuer.sql, 005_runtime_permissions.sql, 006_index_candidates.sql은 v2 원문과 바이트 단위로 동일하다.

실측 v2 → v3 (이번 실행에서 두 독립 DB에 각 버전 SQL·시드 적재 후 카탈로그 조회)
{counts}
- repair_runs UNIQUE: {b['repair_runs']['unique_constraints']} → {a['repair_runs']['unique_constraints']}
- repair_runs 기본 인덱스: {b['repair_runs']['indexes']} → {a['repair_runs']['indexes']}
- repair_runs 선택 포함 인덱스: {b['repair_runs']['indexes_with_optional']} → {a['repair_runs']['indexes_with_optional']}
인덱스 수는 PK/UNIQUE 지원 인덱스와 부분 인덱스를 포함한다. NOT NULL 컬럼과 pg_constraint 행은 다른 집계다. 특히 PostgreSQL 16과 이번 엔진의 NOT NULL 카탈로그 표현을 동일시하지 않는다. 성능 개선 측정값이 아니다.

실행 검증
{passes}
daily 정의 INSERT CHECK 거부, daily 도전 INSERT 역할 FK 거부, option_id 단독·text 혼합 답안 DB 거부와 서비스 거부를 확인했다. v2의 자동차/면허/부품 6종/축제 3종 거부·4종 입장/퍼레이드·원격/최초 완료 우회 차단 회귀 검증을 실행했다.
실제 9종을 완료하면 보상·원장이 생기지 않음을 확인했다. 양수 보상 경로는 검증 DB에서 자동차 reward_cell을 임시 17로 설정하여 원장 직후 강제 실패 시 도전·최초 완료·면허·보상·원장·지갑 롤백을 확인했다. 정상 지급·재호출 중복 방지·재도전 추가 지급 없음도 확인하고 finally에서 0으로 복구했다. 이 17 CELL은 배포 시드나 운영 정책이 아니다.
일일 관련 CHECK 2개 삭제·4개 변경 외 모든 PK/UNIQUE/FK/CHECK의 이름과 정의가 동일하다. 일일 인덱스 삭제·진행 중 도전 인덱스 조건 변경 외 인덱스도 동일하다. 남은 9개 사건의 식별자·규칙·보상·부품·단서·시험 정의는 v2와 동일하다.

검증 엔진과 한계
{engine}
같은 프로젝트에 이미 설치된 고정 0.5.14 모듈을 PGLITE_MODULE로 지정해 npm test를 실행했다. 이번에는 npm ci 신규 설치를 수행하지 않았다.
사용자가 제공한 기준 상태: v2는 실제 PostgreSQL 16.15에서 적재와 수리 최초 완료 우회 차단을 확인했다. 이번 v3 실행 결과와 별개인 기존 검증 이력이다.
{limits}
게임 프론트엔드 및 운영 DB는 수정하지 않았다. 새 개발 DB 생성용이며 기존 DB에 덮어쓰는 마이그레이션이 아니다.

근거 파일
validation/results.json, validation/schema-comparison.json, validation/schema-metadata.json, validation/schema-metadata-v2.json, validation/seed-validation.json, examples/verified-play.json.
validation/baseline-v2/의 일일 SQL·시드는 비교 전용 원본이다. v3 설치에는 실행하지 않는다. docs/v2-to-v3.diff에는 삭제 전후 기록이 있으므로 과거 일일 문구가 남아 있다.
qa/browser-audit.json은 오프라인 화면 검증, qa/package-audit.json과 MANIFEST.sha256은 링크·ERD·원본 보존·ZIP 바이트 검증을 기록한다. 이 검사를 DB 시나리오 수에 합산하지 않는다.
''')
write('README.txt',f'''도로버스 최종 DB 설계 · 팀원 공유본 v3 · 2026-11-12

먼저 ZIP을 풀고 상세설명.html을 열어 주세요. 인터넷 없이 설명·검색·ERD·테이블 명세를 볼 수 있습니다.

최종 결정
- 이전의 일일 수리 유지 결정을 철회합니다. v3에서는 일일 수리를 설계 범위에서 제외하며 이 결정이 과거 유지 문구보다 우선합니다.
- 본편 스토리 제외, 자동차는 독립 도입 사건. 자동차 이외 사건은 운전면허로 입장합니다.
- 축제 4종 후 퍼레이드, 퍼레이드 후 원격 자격. 부품 6종과 교육 영역은 유지합니다.
- v2 최초 완료 보장, 면허, 권한, 공통 보상 구조를 유지합니다. 남은 9개 사건의 reward_cell은 모두 0입니다.
- 실제 적재: {a['tables']}개 테이블 / {a['columns']}개 컬럼 / {a['repair_cases']}개 사건.

읽는 순서와 파일
1. 상세설명.html: 범위 → v2/v3 실측 비교 → 전체 ERD → 테이블 명세 → 구현 순서.
2. docs/v3-changes.txt: 변경 목록·실측 수치·검증 엔진·미실행 범위.
3. docs/design-notes.txt, docs/runtime-guide.txt: 설계 이유, 후속 작업, 서버 연결 계약.
4. sql/001~005: 새 개발 DB 정의. examples/001_content.sql: 사건 9개 시드.
5. server/repair-service.mjs: 인증 서버에서 사용할 참조 구현.
6. examples/002_analysis.sql: 분석 조회문 7개. examples/verified-play.json: 가상 학생 실제 검증 결과.
7. validation/: 실행 결과·메타데이터·재현 검사. baseline-v2/는 비교 전용 과거 SQL·시드이며 설치하지 않습니다.
8. erd/full-erd.svg, full-erd.mmd, progression.svg: 실제 v3 컬럼·FK와 진행 관계.
9. docs/v2-to-v3.diff: v2와의 소스·문서 차이. 실행용 마이그레이션이 아닙니다.
10. source/: v3에 남은 스냅샷·시드·ID·원본 파일 근거. tools/: 재생성 도구.
11. qa/: 화면·링크·원본 보존·압축 검증. MANIFEST.sha256: ZIP 내부 파일 해시.

새 개발 DB 적용 순서
스키마 소유자/역할 생성 권한을 가진 개발 관리자 계정에서 sql/001_core.sql → sql/002_repair.sql → sql/003_license.sql → sql/004_license_issuer.sql → sql/005_runtime_permissions.sql → examples/001_content.sql 순서로 전체 실행합니다.
선택: sql/006_index_candidates.sql은 실제 조회 계획과 쓰기 비용을 확인한 뒤 적용합니다.
기존 dorobus 스키마나 런타임 역할이 있으면 중단합니다. 이전 SQL과 섞거나 기존 운영 DB에 덮어쓰지 않습니다.

재현
Node.js 환경에서 npm ci --ignore-scripts → npm test.
실제 서버 접속 없이 독립 메모리 PGlite DB를 만듭니다. 기존 설치를 쓰려면 PGLITE_MODULE을 @electric-sql/pglite/dist/index.js 절대 경로로 설정합니다.
실행 결과: {passes}
{engine}
{limits}
v2의 PostgreSQL 16.15 검증은 사용자가 제공한 이전 이력이며 v3 실행 실적으로 옮겨 적지 않았습니다.

재생성 순서
python tools/generate-seed.py → npm test → python tools/generate-notes.py → python tools/build-docs.py → node tools/verify-browser.mjs → python tools/package.py
화면 검사에는 Playwright/Chromium이 필요하며 PLAYWRIGHT_MODULE로 설치 경로를 지정할 수 있습니다. 이번 의존성 신규 설치는 수행하지 않았습니다.
포장에는 원본 보존 확인과 diff 재생성을 위해 같은 상위 폴더의 v2 원본·ZIP이 필요합니다.
게임 소스와 운영 DB는 수정하지 않았습니다. 원본 v2 폴더·ZIP을 그대로 두고 v3를 별도 제공합니다.
''')
write('docs/design-notes.txt',f'''도로버스 최종 DB 설계 v3 / 2026-11-12

1. 최종 범위
이전의 일일 수리 유지 결정을 철회한다. v3에서는 일일 수리를 설계 범위에서 제외하며 이 결정이 과거 유지 문구보다 우선한다. 본편 스토리와 story_steps/user_story_progress는 제외하고 자동차 수리는 독립 도입 사건으로 유지한다. 과정·반·수강·과제는 유지하되 수리 입장·진행·답안 조건에 연결하지 않는다.
기준은 dorobus-db-final-2026-11-12-v2, 콘텐츠 커밋 8366c216195fb184d3cf8722fce003fbe2d5e53f이다. 남은 9개 사건의 UUID·게임 규칙은 v2와 같다. 게임 소스·운영 DB에는 적용하지 않았다.

2. 면허·단서·완료의 처리
onboarding인 자동차만 license_holder_id가 자동 NULL이다. 다른 사건은 본인 user_id로 자동 계산되어 운전면허 FK를 검사한다. driving_licenses.source_run_id는 본인의 완료된 도입 사건을 참조하고, issue_driving_license 함수가 repair:car·원인 해결·시험 통과를 재검사한다. 자동차 완료와 면허 발급은 같은 트랜잭션이다.
unlock_after_keys는 같은 버전의 선행 단서 중 하나를 관찰하면 조사를 연다(OR). revealed_clue_key는 도움으로 미리 열린 단서다. 표시된 버튼·관찰한 사실·답안의 선택 근거를 구별하며 issued_at·shown_at도 구별한다. 응답 유실 뒤 resume으로 복원한다.
서버는 사용자 자문 잠금 → 도전 행 잠금 → 지갑 갱신 순서로 처리한다. 완료·최초 완료·면허·보상·원장·지갑은 한 트랜잭션이며 실패하면 함께 취소한다. 해시 충돌은 대기를 늘릴 수 있지만 다른 사용자의 권한을 허용하지 않는다.

3. 유지한 테이블 구조
공통 15개 + 수리 정의 6개 + 수리 기록 6개 + 운전면허 1개, 합계 {a['tables']}개 테이블을 유지한다. 수리 정의는 parts, repair_case_versions, repair_clues, repair_problems, repair_tests, repair_wrong_hypotheses다. 기록은 repair_runs, repair_clue_discoveries, repair_attempt_evidence, repair_problem_solutions, repair_trials, repair_hint_events다.
콘텐츠·버전, 관찰·선택 근거, 최초 완료·재도전, 원인 해결·시험을 구별한다. learning_attempts의 수리 과제 연결 금지와 판정 메타데이터도 그대로다. 이번 컬럼 변화는 repair_runs.business_date 한 개 삭제뿐이다. 사용자 정의 트리거 {a['user_triggers']}개를 유지한다.

4. 부품과 자격 해금
회전목마 → 높이 조절 받침대(height_support), 사파리 → 컨베이어 벨트(conveyor), 푸드코트 → 분기 레일(branch_rail), 바이킹 → 균형추(counterweight), 롤러코스터 → 판자(plank), 전광판 → 전선 블록(wire).
부품은 수량을 소모하는 재고가 아니라 해결 방법을 여는 영구 권한이다. 실제 repair_case 정의와 본인·콘텐츠·버전이 일치하는 completed 도전을 JOIN한 최초 완료만 사용한다. 재도전으로 최초 완료 버전의 해금을 덮어쓰지 않는다.
서로 다른 축제 사건 4개를 완료하면 퍼레이드, 퍼레이드를 완료하면 remote_repair 자격으로 원격 배송 수리에 입장한다. 운전면허와 원격 자격은 별개다. 원본 UI의 대체 부품 fallback 규칙도 v2와 동일하다.

5. 일일 수리 제외 결정과 남은 보상 경로
일일 수리를 설계에서 완전히 제외한다. daily 역할·업무일·일일 전용 제약/인덱스·대상 선정·선택형 판정 엔진·5개 시드·집계와 시나리오를 제거했다. 수리 답안은 자유 가설 text와 관찰 근거 evidence이며 option_id 형식은 거부한다.
공통 wallets/cell_transactions/reward_claims와 reward_claims.source_repair_run_id, reward_must_be_finished_fk, run당 보상 UNIQUE, repair_case_versions.reward_cell은 유지한다. 남은 9개 사건의 reward_cell은 모두 0이다. complete는 양수 보상이며 최초 완료일 때만 공통 지급 경로를 실행한다. 지급 시 보상 수령·원장·지갑을 함께 기록하며 재호출·재도전으로 중복 지급하지 않는다.
검증 전용 DB에서만 임시 17 CELL 정의로 양수 경로·강제 실패 롤백을 검사하고 0으로 복구했다. 이것은 새 콘텐츠 정책이 아니다.

6. DB 제약과 서버의 책임
DB는 소유자·도전·버전·콘텐츠 종류·완료 상태 연결, 면허, 수리 과제 연결 금지, 원인 해결의 correct/partial 연결, 보상/원장 중복 방지를 보장한다. 서버는 인증·조회 범위·의미 판정·관찰 상태·부품·입장 자격·유효 시험·공개 버전·금액·원자적 저장을 책임진다.
서버 런타임에 RLS는 없다. 서버용 역할로 passed/verdict/phase를 거짓 입력하는 모든 공격을 DB가 자동 차단한다고 주장하지 않는다. 공개 정의는 수정하지 않고 새 버전을 발행한다. 기존 run은 시작 버전을 유지한다.

7. 구현 범위와 후속 작업
구현: 신규 DB SQL, {a['repair_cases']}개 시드, 면허 발급 함수, 런타임 권한, 수리 서비스, 분석 조회문 7개, 검증, ERD와 상세 문서.
프론트 후속 작업: World.jsx의 일일 수리 진입과 FixMission 연결·화면을 제거한다. 이번 작업에서는 게임 소스를 수정하지 않고 이 목록에만 기록한다.
기타 후속: 실제 인증/HTTP 연결, 프론트 저장 전환, Gemini 의미 판정, 자동 힌트, 생각 메모/초안 저장, 보관 정책 실행, 실제 PostgreSQL 다중 연결 검증. 현재 로컬 규칙 판정과 저장 참조 구현을 이 기능들이 이미 배포된 것으로 해석하지 않는다.

8. 기존 계정과 이관
이 패키지는 새 개발 DB용이다. localStorage의 면허 표시만 믿고 면허를 발급하지 않는다. 개발용 계정은 자동차 도입 사건을 다시 완료하도록 하고 실제 이관은 신뢰 가능한 완료 근거를 확인하여 별도 설계한다. 도전을 임의 생성해 NULL 완료를 소급 정당화하지 않는다. 운영 DB 파괴·전환 스크립트는 포함하지 않는다.

9. 구현 순서와 협업 분담
1단계: SQL/ERD를 검토하고 빈 개발 DB에 적재. 담당 제안: 희찬 중심, 재훈 검토. 실측 기준 {a['tables']}표·{a['columns']}컬럼·{a['repair_cases']}사건.
2단계: 서버 인증 결과를 users.auth_subject와 연결하고 본인/개발자 조회 권한을 확인한다. 요청 본문의 userId/role을 신뢰하지 않는다.
3단계: 자동차 시작→조사→가설→시험→완료·면허를 화면에 연결한다. 담당 제안: 재훈 화면, 희찬 저장/조회. 재접속 복원과 재시도 면허 1개를 확인한다.
4단계: 축제 6개, 단서 해금, 부품, 퍼레이드·원격 자격을 연결한다. 본편 스토리 연결은 제거하되 수리 사건의 캐릭터 대화·단서·시험은 유지한다.
5단계: 분석 화면·Gemini 연결을 진행하고 실제 PostgreSQL 다중 연결 경쟁·교착·장애 복구를 검증한다. 프론트는 서버 성공 응답 뒤 완료·잔액을 갱신하며 재시도에는 같은 requestId를 사용한다.

10. 희찬 님께 전달할 답변
일일 수리 유지 결정을 철회하고 v3 설계에서 제외했습니다. 자동차 도입 사건, 면허, 부품 6개, 축제 4종 후 퍼레이드, 이후 원격 자격은 그대로입니다. 수리 정의 6개와 기록 6개 및 기존 교육 영역도 유지했습니다.
v2의 최초 완료 우회 차단과 면허·권한은 유지하고 일일 전용 컬럼·제약·인덱스·시드·서비스 분기만 걷어냈습니다. 남은 9개 사건의 CELL 보상은 0이지만 공통 보상 구조와 양수 보상 경로는 유지합니다. 이번 첨부는 별도 개발 DB 설계이며 게임·운영 DB에 적용한 결과는 아닙니다.

11. 기준 자료
콘텐츠 기준 커밋·원본 파일 SHA256: source/provenance.json. v2 폴더·ZIP 보존 해시: validation/original-hashes.json.
SQL 동작 근거는 동봉 실행 결과와 실제 DB 카탈로그다. docs/v2-to-v3.diff는 소스와 문서 차이를 기록하며 마이그레이션으로 실행하지 않는다.

12. v2 최초 완료 보장 유지
content_completions.content_kind는 필수이며 contents(id,kind) FK가 실제 정의와 일치시킨다. completion_repair_source_required는 수리에만 source_repair_run_id를 강제하고 비수리에는 NULL을 요구한다. 수리는 source_phase가 자동 completed가 되어 completion_must_be_finished_fk가 본인·콘텐츠·버전·완료 상태를 검사한다.
repair_case_versions.content_kind는 자동 repair_case 및 NOT NULL이다. repair_definition_kind_fk가 비수리 콘텐츠에 수리 상세를 붙이거나 실제 kind를 변경하는 우회를 차단한다. 종류 생략·NULL·quiz 위장, 다른 사용자·버전·미완료 도전 연결을 이번에도 거부했다.
reward_claims는 비수리 보상도 담으므로 source_repair_run_id=NULL을 허용한다. 수리 도전이 연결되면 reward_must_be_finished_fk와 run당 UNIQUE가 적용된다. 보상 금액·전체 지갑 일치를 FK만으로 자동 보장한다고 설명하지 않는다.

13. v2 → v3 실제 집계와 동일성
{counts}
일일 CHECK 2개 삭제·4개 변경 외 모든 PK/UNIQUE/FK/CHECK 이름·정의가 동일하다. business_date 외 컬럼의 타입·필수·기본값·생성식과 남은 콘텐츠 정의는 동일하다. 공통 SQL은 스키마 범위 COMMENT만 바뀌었고 면허/발급/권한/선택 인덱스 SQL은 바이트 단위로 동일하다. 비교 원문은 validation/schema-comparison.json에 있다. NOT NULL 카탈로그 표현은 엔진 버전에 따라 다르므로 별도 집계한다.

14. 실행 결과와 한계
{passes}
{engine}
v2의 실제 PostgreSQL 16.15 적재·우회 차단은 사용자가 제공한 이전 이력이다. {limits}
화면 검사는 qa/browser-audit.json, 원본 보존·압축 검사는 qa/package-audit.json에 별도 기록한다. baseline-v2와 비교 diff의 과거 일일 내용은 검증용 기록이며 v3 설치 범위가 아니다.
''')
write('docs/runtime-guide.txt',f'''실행·권한·서버 연결 안내 v3

A. 신규 개발 DB
psql -X -v ON_ERROR_STOP=1 -f <파일>로 README 순서대로 적용한다. SQL 005는 NOLOGIN 역할을 새로 만들며 기존 역할이 있으면 중단한다. 운영 로그인/비밀번호를 생성하지 않는다. 소유자는 시드 적재와 정의 발행, 실제 서버 로그인은 관리자가 연결한 dorobus_app_runtime 권한을 사용한다. 파일 전체가 단일 트랜잭션인 것은 아니므로 실패 시 앞 파일 적재 상태를 확인한다.
{engine}
사용자가 확인한 v2 PostgreSQL 16.15 이력과 이번 v3 실행 엔진은 별개다.

B. 서버 연결
server/repair-service.mjs의 createRepairService(pool)은 node-postgres 스타일 connect()/query()/release() 인터페이스를 받는다. 인증 미들웨어가 확정한 actorId만 전달한다.
예: const repair=createRepairService(pool); await repair.start(user.id,{{code:'repair:car',requestId:crypto.randomUUID()}});
실제 HTTP 인증/라우터는 별도 구현한다. UUID·본문 크기·요청 빈도·안전한 오류 응답을 검사한다. DB 접속 정보와 grading_rule은 클라이언트에 보내지 않는다. 런타임 역할은 RLS를 제공하지 않으므로 학생에게 DB 직접 접속을 주지 않는다.

C. 화면 연결 계약
start → discover → submit(text,evidence,requestId) → adjust → test → complete 순서다. 보이는 단서만 표시하고 discover 성공 뒤 fact를 공개한다. optionId/option_id 답안은 허용하지 않는다. 작업대 수정은 expectedRevision 충돌 시 resume한다. 마지막 시험 후 complete가 끊기면 다시 complete한다. 자동차 면허·완료·잔액은 서버 성공 응답 뒤 확정한다. 상세 프론트 후속 목록은 설계 노트 7절을 참조한다.

D. 재전송과 이어 하기
start/submit/help/test 재시도는 같은 requestId를 쓴다. 같은 키에 다른 콘텐츠·답안·시험을 붙이면 IDEMPOTENCY_CONFLICT다. 진행 중 사건을 새 요청으로 시작하면 RESUME_EXISTING_RUN과 runId를 반환한다. 완료 후 재도전은 replay:true이며 기존 최초 완료·면허·부품을 유지한다.
complete는 run 단위 한 번 확정하고 재호출은 저장한 최초 요청·보상액을 반환한다. 힌트 발급과 표시 확인은 구별하고 shown_at=NULL이어도 revealed_clue_key는 복원한다.

E. 공통 보상 경로
일일 수리는 제외했으며 날짜별 도전/지급 정책은 없다. 남은 사건 9개는 모두 reward_cell=0이다. 공통 보상 표·원장·지갑과 관련 FK/UNIQUE는 유지한다.
complete는 reward_cell>0이고 최초 완료일 때만 first:<content_id> 보상 키로 지급한다. run당 보상 UNIQUE, 사용자/보상키 UNIQUE, 사용자/operation_id 원장 UNIQUE를 유지한다. reward_claims, cell_transactions, wallets는 같은 트랜잭션에 저장한다. 다른 상점 경로도 이 계약을 따라야 전체 잔액 일치가 유지된다.
양수 경로와 원장 직후 실패 롤백은 검증 DB의 임시 17 CELL 정의로 시험한 뒤 0으로 복구했다. 배포 시드에 양수 보상을 추가한 것이 아니다.

F. 콘텐츠와 판정
시드 생성기는 같은 버전 단서 키·선행 조건 순환·힌트/오답 근거·설정 범위·수리 종류를 검사한다. 시드는 새 개발 DB용이며 이미 배포된 버전을 같은 UUID로 덮어쓰지 않는다. 공개 정의 수정은 새 버전/UUID 발행으로 처리하고 기존 도전은 시작 버전을 읽는다.
엔진은 8366c21-rule-v1이다. grading_rule의 case_snapshot/정규식은 서버 전용이며 고정 판정기 코드가 읽는다. Gemini 연결 시 모델 결과의 원인·단서 충족을 서버에서 다시 검사하고 model_id/prompt_version/judge_source/fallback_reason을 기록한다. note_text/draft_text/자동 힌트 필드는 남지만 저장 메서드는 후속이다.

G. 실제 PostgreSQL 확인 항목 (이번 v3 미실행)
- 두 연결이 같은 자동차를 동시에 complete할 때 최초 완료·면허 각각 1개.
- 양수 보상 검증 정의에서 같은 도전 동시 완료와 서로 다른 사건 동시 완료의 원장·지갑 정합성.
- 완료 중 연결 장애·잠금 대기·시간 제한·교착 후 재시도.
- 실제 로그인에서 정의 변경/면허 직접 INSERT 거부와 발급 함수 실행 허용.
{limits}

H. v2에서 유지한 최초 완료 INSERT 계약
content_kind는 실제 contents에서 가져오며 수리는 'repair_case'와 source_repair_run_id를 함께 기록한다. 비수리는 실제 kind와 NULL 도전을 기록한다. 생성 컬럼 content_kind(수리 상세)·source_phase는 직접 입력하지 않는다. completion_repair_source_required와 완료 FK가 소유자·콘텐츠·버전·완료 상태를 검사한다.
비수리 예: INSERT INTO dorobus.content_completions(user_id,content_id,completed_version_id,content_kind) SELECT $1,c.id,v.id,c.kind FROM dorobus.contents c JOIN dorobus.content_versions v ON v.content_id=c.id WHERE c.id=$2 AND v.id=$3 AND c.kind<>'repair_case';
이 예제는 저장 형태이며 별도 교육 채점·권한 구현을 뜻하지 않는다. source_repair_run_id를 생략하는 옛 수리 INSERT는 거부된다. baseline-v2는 비교용이며 신규 설치에는 sql/001~005와 examples/001_content.sql만 쓴다.

I. 재현 결과
{passes}
실측 수치와 변경 제약 원문은 docs/v3-changes.txt 및 validation/schema-comparison.json을 확인한다. v2 폴더와 ZIP은 그대로 보존했다.
''')
print(json.dumps({'documents':4,'tables':a['tables'],'columns':a['columns'],'cases':a['repair_cases'],'scenarios':result['passed'],'schema_checks':comparison['passed']}))
