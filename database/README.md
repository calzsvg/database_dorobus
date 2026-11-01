# 도로버스 PostgreSQL 데이터베이스

도로버스의 사용자·수업·문제 풀이·스토리·CELL·상점 데이터를 저장할 핵심 17개 테이블, 100개 컬럼을 생성한다. 같은 문제의 완료는 수업 간 공유하고, 같은 가구는 사용자당 하나 보유하며, 같은 보상은 한 번만 지급하는 설계를 반영했다.

상태: **설계 검토용 초기 SQL**. 별도 검증 DB에서는 생성·제약 검사를 통과했다. 실제 운영 DB 적용, 기존 React 화면의 서버 연결, 인증·권한·채점·보상 API는 아직 구현하지 않았다.

이 폴더를 기존 Git 저장소의 최상위에 `database/`라는 이름으로 두는 구성을 권장한다.

## 파일 안내

```text
database/
├── README.md                      # 이 문서: 목적·실행 순서·공유 방법
├── migrations/
│   └── 001_init.sql               # 필수: 스키마·17개 테이블·제약·인덱스 생성
├── examples/
│   └── 001_demo_data.sql          # 선택: 가상 사용자·수업·풀이·구매 예시
├── checks/
│   ├── 001_verify.sql             # 생성 결과 조회
│   └── 002_constraints.sql        # 제약 검증 후 임시 행 전체 취소
└── docs/
    ├── erd.md                     # 테이블 관계도
    ├── table-definitions.md       # 컬럼·자료형·PK·FK·용도
    ├── design-proposal.md         # 설계 근거와 후속 기능
    └── validation.md              # 검증 결과와 범위
```

- 설계를 이해하려면 [ERD](docs/erd.md) → [테이블 정의서](docs/table-definitions.md)를 읽는다.
- 실행하려면 [001_init.sql](migrations/001_init.sql)을 사용한다.
- 검토 결과는 [검증 기록](docs/validation.md)을 참고한다.

## 1. DB·스키마·테이블의 차이

- **데이터베이스:** 프로젝트 자료를 담는 큰 공간. 여기서는 `dorobus_dev`를 만든다.
- **스키마:** DB 안에서 관련 테이블을 묶는 구역. SQL이 `dorobus`를 만든다.
- **테이블:** 사용자·과제처럼 같은 종류의 자료를 담는 표.

따라서 사용자 테이블의 전체 이름은 `dorobus.users`다. SQL 파일을 GitHub에 올리는 것과 실제 PostgreSQL에 실행하는 것은 별개의 작업이다.

## 2. 준비할 것

1. 접속 가능한 PostgreSQL 16 이상 서버와 DB 생성 권한이 있는 계정을 준비한다.
2. SQL 편집기가 있는 DB 관리 도구 또는 PostgreSQL의 `psql`을 사용한다.
3. 호스트·포트·사용자명을 확인한다. 아래 명령의 `localhost`, `5432`, `postgres`는 로컬 설치의 예시이며 실제 접속 설정으로 바꾼다.

이미 팀에서 만든 개발 DB를 받았다면 DB 생성 단계는 건너뛰고 그 DB에 연결한다. 비밀번호는 연결 도구에서 입력하고 SQL·README에 적지 않는다.

## 3. 처음 실행하는 순서 — SQL 편집기를 사용하는 경우

### ① 개발용 데이터베이스를 만든다

먼저 기본 DB인 `postgres`에 연결해서 아래 문장만 별도로 실행한다.

```sql
CREATE DATABASE dorobus_dev;
```

이 문장은 테이블 생성 파일에 넣지 않았다. `CREATE DATABASE`는 트랜잭션 안에서 실행할 수 없기 때문이다. 도구가 모든 실행을 트랜잭션으로 묶는다면 자동 커밋 모드 또는 도구의 DB 생성 메뉴를 사용한다. 이미 같은 이름이 있다면 삭제하지 말고 새 DB 이름을 사용하거나 담당자에게 기존 용도를 확인한다.

### ② 새 DB에 연결한다

연결 대상 데이터베이스를 `postgres`에서 `dorobus_dev`로 바꾼다. 다른 DB에 잘못 실행하지 않도록 다음 조회로 확인한다.

```sql
SELECT current_database(), current_user;
```

### ③ 테이블 생성 파일 전체를 실행한다

[migrations/001_init.sql](migrations/001_init.sql)을 열어 **파일 전체를 실행**한다. `BEGIN`부터 `COMMIT`까지 한 묶음이다. 참조하는 표를 먼저 만들도록 이미 순서를 정해 두었으므로 테이블별로 나누어 복사할 필요가 없다.

중간에 오류가 나면 이 파일에서 새로 만드는 객체는 확정되지 않는다. 같은 연결에서 다시 작업할 때는 `ROLLBACK;`을 실행해 실패한 트랜잭션을 끝내고 원인을 수정한다. 성공 후 같은 파일을 다시 실행하면 `dorobus`가 이미 있다는 오류가 나는 것이 의도된 동작이다. 새 변경은 적용된 파일을 다시 고치기보다 `002_...sql` 같은 다음 마이그레이션으로 작성한다.

### ④ 생성 결과를 확인한다

[checks/001_verify.sql](checks/001_verify.sql)을 실행한다. 첫 두 조회의 결과는 다음과 같아야 한다.

| 확인 항목 | 기대 결과 |
|---|---:|
| table_count | 17 |
| column_count | 100 |

관리 도구의 테이블 목록에서는 기본 `public` 구역이 아니라 **`dorobus` 스키마**를 펼쳐 확인한다. 목록이 갱신되지 않았다면 새로고침한다.

### ⑤ 필요하면 예시 데이터를 넣는다

[examples/001_demo_data.sql](examples/001_demo_data.sql)을 한 번 실행한 뒤 ④의 조회 파일을 다시 실행한다. 예시 학생은 시작 CELL 300 → 완료 보상 +50 → 화분 구매 -200으로 잔액 150이 된다. 풀이 기록은 3회, 오답은 2회다.

예시의 `demo-only:` 식별자는 가상 데이터이며 실제 로그인 계정을 만들지 않는다. 이 파일은 운영용 초기 자료나 서버의 구매·보상 처리 API가 아니다. 예시를 유지할 필요가 없다면 이 단계는 건너뛴다.

### ⑥ 제약조건을 검증한다

개발 DB에서 [checks/002_constraints.sql](checks/002_constraints.sql)을 실행한다. 24개의 잘못된 입력이 거부되는지와 정상 입력·자동 시각 갱신 등을 검사한다. 끝의 **ROLLBACK은 성공한 검증용 임시 행도 남기지 않기 위한 정상 종료**다. 실행 도구에 따라 PASS 메시지는 알림·메시지 창에서 확인한다. 예기치 않은 오류가 나면 검증 실패이며 정상으로 간주하지 않는다.

## 4. 터미널에서 실행하는 방법

아래는 이 폴더를 프로젝트의 `database/`로 복사한 뒤 **프로젝트 최상위 폴더에서** 실행하는 예시다. `psql`이 없으면 설치된 PostgreSQL 도구의 실행 경로를 설정하거나 앞의 SQL 편집기 방법을 사용한다.

```bash
# 1) 아직 개발 DB가 없을 때만 생성
psql -X -h localhost -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE dorobus_dev;'

# 2) 필수: 테이블 생성
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/migrations/001_init.sql

# 3) 생성 결과 조회
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/checks/001_verify.sql

# 4) 선택: 가상 데이터 추가 후 결과 다시 조회
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/examples/001_demo_data.sql
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/checks/001_verify.sql

# 5) 개발 DB 제약 검증
psql -X -h localhost -p 5432 -U postgres -d dorobus_dev -v ON_ERROR_STOP=1 -f database/checks/002_constraints.sql
```

`-f`는 파일 실행, `ON_ERROR_STOP=1`은 오류 시 중단, `-X`는 개인 psql 설정 파일의 영향을 제외하는 옵션이다. SQL 자체에 BEGIN/COMMIT이 있으므로 `--single-transaction`을 추가하지 않는다. [psql 공식 문서](https://www.postgresql.org/docs/current/app-psql.html), [트랜잭션 공식 문서](https://www.postgresql.org/docs/current/sql-begin.html), [CREATE DATABASE 공식 문서](https://www.postgresql.org/docs/current/sql-createdatabase.html)를 참고한다.

## 5. 파일 안에서 테이블을 만드는 순서

외래키는 다른 표를 가리키므로 가리킬 표를 먼저 만든다. 순서는 001_init.sql 안에 반영되어 있다.

1. 공통 정의: users → courses → contents → story_steps → items
2. 수업·문제: class_groups → enrollments → content_versions → assignments
3. 학습·진행: learning_attempts → content_completions → user_story_progress → player_profiles
4. 경제·보유: wallets → cell_transactions → user_items → reward_claims
5. 자동 갱신 트리거와 조회 인덱스

