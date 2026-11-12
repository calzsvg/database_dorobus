# 1단계: 로컬 개발 DB 적재와 실제 PostgreSQL 16 검증

`database/v3/`는 v3 패키지 원본(`dorobus-db-final-2026-11-12-v3`)을 그대로 복사한 뒤 아래만 바꿨습니다.
- 1단계: `dev/` 폴더 추가
- 생년월일 확장: `sql/007_user_birth_date.sql`, `validation/birth-date.mjs` 추가. `validation/database.mjs`, `verify.mjs`, `compare-schema.mjs`, `legacy-common-checks.sql` 수정. `validation/*.json`, `examples/verified-play.json` 재생성

## 007 확장: 생년월일·나이·가입 함수

- `users.birth_date DATE NOT NULL`: 모든 계정에 생년월일이 필수입니다. 1900-01-01보다 이전 날짜는 CHECK로 거부합니다.
- **나이는 저장하지 않습니다.** 나이는 날마다 바뀔 수 있어서 컬럼에 저장하면 금방 틀린 값이 됩니다. 필요할 때 계산합니다.
  - `dorobus.age_on(birth_date, 기준일)`: 만 나이
  - `dorobus.users_with_age` 뷰: 오늘(한국 시간) 기준 `age` 컬럼 포함. `auth_subject`는 노출하지 않음
- `dorobus.register_user(login_id, display_name, auth_subject, birth_date)`: 서버용 학생 가입 함수
  - 생년월일 누락·미래 날짜를 거부하고, 아이디를 정규화(공백 제거·소문자)합니다.
  - 런타임 역할은 `users`에 직접 INSERT할 수 없고 이 함수만 실행할 수 있습니다.
  - 강사·개발자 계정은 관리자가 소유자 권한으로 등록합니다.
- README의 적용 순서는 `001`→`005` → **`007`** → `examples/001_content.sql`입니다. `setup-dev-db.sh`에 반영돼 있습니다.
- 게임 화면(`src/pages/Login.jsx`)의 회원가입도 같은 규칙(필수·미래 금지·만 나이)을 씁니다. 다만 아직 서버(DB)와 연결하지 않아 브라우저에만 저장됩니다.


## 준비 (macOS)

```bash
brew install postgresql@16 node
brew services start postgresql@16
```

## 개발 DB 만들기

```bash
database/v3/dev/setup-dev-db.sh          # 새로 생성 (이미 있으면 중단)
database/v3/dev/setup-dev-db.sh --reset  # 지우고 다시 생성
```

- 만드는 것: DB `dorobus_dev`, 스키마 소유자 `dorobus_owner`(LOGIN, CREATEROLE), 005의 `dorobus_app_runtime`(NOLOGIN), 서버 접속용 `dorobus_app_dev`(LOGIN, 런타임 권한만 상속)
- 적용 순서: `sql/001`→`005`, `examples/001_content.sql`. `006`은 `WITH_INDEX_CANDIDATES=1`일 때만 적용
- 로컬 trust 인증을 전제로 해서 비밀번호가 없습니다. **운영 서버에서는 실행하지 마세요.**
- 접속 예: `psql -U dorobus_owner -d dorobus_dev`, 서버 코드는 `postgresql://dorobus_app_dev@localhost:5432/dorobus_dev`

## 실제 PostgreSQL 16에서 검증 다시 돌리기

```bash
database/v3/dev/verify-pg.sh
```

- 임시 PostgreSQL 클러스터를 포트 54329에 띄워 실행하고, 끝나면 지웁니다. 런타임 역할 이름이 클러스터 단위라서 `dorobus_dev`와 분리했습니다.
- `validation/verify.mjs`는 수정하지 않았습니다. Node 모듈 훅(`pg/hooks.mjs`)으로 `validation/database.mjs`(PGlite)만 `pg/database.mjs`(실제 PostgreSQL)로 바꿔 끼웁니다.
  - 직접 SQL 공격 검사: `dorobus_owner` 단일 연결
  - 서비스 호출: `dorobus_app_dev` 로그인의 **다중 연결 풀**(max 10)
- 결과는 `dev/results/`에 씁니다. 원본 `validation/` 결과 파일은 건드리지 않습니다.
  - `results/validation/results.json`의 `limitations` 문구("PGlite 단일 연결")는 verify.mjs에 고정된 문장입니다. 실제 엔진은 같은 파일의 `engine` 값을 보세요.

## 2026-11-12 실행 결과

| 항목 | 결과 |
|---|---|
| 엔진 | PostgreSQL 16.15 (Homebrew) on aarch64-apple-darwin |
| 원본 `npm test` 재현 (PGlite) | 시나리오 94 PASS / 0 FAIL, v2·v3 스키마 비교 10 PASS / 0 FAIL (007 추가 후 100 / 0, 10 / 0) |
| `dorobus_dev` 적재 | 오류 없음. 테이블 28 / 컬럼 206 / 수리 사건 9 (007 포함 시 컬럼 207) |
| 실제 PG16 시나리오 | **94 PASS / 0 FAIL** (007 추가 후 **100 PASS / 0 FAIL**, 생년월일 검사 6개 추가) |
| PG16과 PGlite 카탈로그 비교 | 객체 510개(테이블·컬럼·PK/UNIQUE/FK/CHECK·인덱스·트리거, 007 포함 시 512개) **완전히 동일**. NOT NULL 제약 행만 PGlite(PG18)에 161개 있고 PG16에는 0개인데, 엔진 버전에 따른 카탈로그 표현 차이라 비교에서 뺐습니다(문서에 적힌 그대로). |
| 실제 로그인 권한 (`dorobus_app_dev` → `dorobus_dev`) | 정의 조회 허용 / 정의 UPDATE·DELETE 거부 / users INSERT 거부 / 면허 직접 INSERT 거부 / 스키마 CREATE 거부 / wallets.user_id UPDATE 거부 / 면허 발급 함수는 실행되고 함수 안의 검사로 거부(`completed own onboarding required`) |

`docs/runtime-guide.txt` G절의 "실제 로그인에서 정의 변경·면허 직접 INSERT 거부와 발급 함수 실행 허용"은 이번에 확인했습니다. "같은 도전 동시 complete" 시나리오도 다중 연결로 통과했습니다. 다만 경쟁·교착·연결 장애만 따로 노리는 집중 검증은 아직 하지 않았고, 5단계 범위로 남아 있습니다.

## SQL 검토 메모 (다음 단계 전에 정할 것)

1. ~~사용자 등록 경로가 없음~~ → **007의 `register_user`로 해결.** 원래 내용: `dorobus_app_runtime`에는 `users`, `player_profiles`, `user_items`, `enrollments`의 INSERT 권한이 없습니다. 인증 후 처음 접속한 사용자를 `users`에 만들 주체를 정해야 합니다. 예: 별도 가입 함수(SECURITY DEFINER), 런타임 권한에 `users` INSERT 추가, 관리자 일괄 등록.
2. ~~`developer` 역할 주석 불일치~~ → **007에서 COMMENT 수정.** 원래 내용: `002`가 `users.role`에 `developer`를 추가했지만 `001`의 컬럼 COMMENT는 student/teacher만 설명합니다. 문서만 고치면 됩니다.
3. **FK 참조 컬럼 인덱스.** `learning_attempts.content_version_id`, `content_completions.source_repair_run_id` 등 일부 FK 쪽 컬럼에는 인덱스가 없습니다. 지금 데이터 규모와 RESTRICT 삭제가 드문 운영 방식에서는 문제가 없습니다. 006과 함께 실제 조회 계획을 본 뒤에 판단하면 됩니다.
4. **금액 타입 혼재.** `repair_case_versions.reward_cell`은 INTEGER, 지갑과 원장은 BIGINT입니다. 지급 과정에서 넓은 타입으로 바뀌므로 동작에는 문제가 없습니다.
5. **`driving_licenses.request_id` 전역 UNIQUE.** 다른 요청 키는 사용자별 UNIQUE인데 이것만 전역입니다. UUID라 실제로 충돌할 일은 없습니다.

3~5번은 참고 사항입니다.

## 008 확장: 프로토타입 로그인을 DB와 맞추기

- `sql/008_user_password.sql`: `users.password_hash`(scrypt 해시, 원문 저장 안 함), 자체 로그인 가입 함수 `register_local_user`(`auth_subject = 'local:<아이디>'`)
- `server/auth.mjs`: `/api/auth/login`, `/api/auth/signup`
  - 로그인: DB의 해시로 비밀번호를 확인하고, 이름·역할·생년월일·나이를 DB에서 돌려줍니다.
  - 회원가입: DB에 저장합니다.
- 화면(`src/store.jsx`)
  - 이름·역할·생년월일은 DB 값을 씁니다. level·CELL·시연 preset 같은 게임 설정과 진행 기록은 지금처럼 브라우저 값입니다.
  - 서버에 DB 주소가 없으면(503) 예전처럼 브라우저 체험 계정으로 동작합니다. 그래서 DB가 없는 미니PC에 배포돼도 사이트는 그대로 돌아갑니다.
- 로컬에서 쓰기:
  ```bash
  database/v3/dev/setup-dev-db.sh --reset   # 001~005, 007, 008, 시드 적용
  npm run db:seed-demo                      # 체험 계정 a1~a5, t1, d1, d2를 DB에 등록 (생년월일은 임의 값)
  echo 'DOROBUS_DATABASE_URL=postgresql://dorobus_app_dev@localhost:5432/dorobus_dev' >> .env.local
  npm run dev
  ```
- 미니PC에서 DB를 쓰려면 PostgreSQL 설치, `npm ci`(pg 패키지), 서비스 환경 변수 `DOROBUS_DATABASE_URL`이 필요합니다. 아직 하지 않았습니다.
- 아직 없는 것: 로그인 세션 토큰. 지금은 로그인 결과를 브라우저에 저장하는 수준이고, 서버 API마다 사용자를 확인하지 않습니다.
