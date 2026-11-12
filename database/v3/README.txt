도로버스 최종 DB 설계 · 팀원 공유본 v3 · 2026-11-12

먼저 ZIP을 풀고 상세설명.html을 열어 주세요. 인터넷 없이 설명·검색·ERD·테이블 명세를 볼 수 있습니다.

최종 결정
- 이전의 일일 수리 유지 결정을 철회합니다. v3에서는 일일 수리를 설계 범위에서 제외하며 이 결정이 과거 유지 문구보다 우선합니다.
- 본편 스토리 제외, 자동차는 독립 도입 사건. 자동차 이외 사건은 운전면허로 입장합니다.
- 축제 4종 후 퍼레이드, 퍼레이드 후 원격 자격. 부품 6종과 교육 영역은 유지합니다.
- v2 최초 완료 보장, 면허, 권한, 공통 보상 구조를 유지합니다. 남은 9개 사건의 reward_cell은 모두 0입니다.
- 실제 적재: 28개 테이블 / 206개 컬럼 / 9개 사건.

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
실행 결과: SQL·서비스 시나리오 94개 PASS / 0개 FAIL, 독립 v2/v3 스키마 비교 10개 PASS / 0개 FAIL, 시드 발행 검사 9개 PASS.
PGlite 0.5.14, 단일 연결. 실제 version(): PostgreSQL 18.6 (PGlite 0.5.14) on wasm32-unknown-emscripten, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.5 (1db513782be24469589d7cb8a1f1834e9a33f271), 32-bit
이번 v3는 실제 PostgreSQL 16.15 서버에서 재실행하지 않았다. 실제 PostgreSQL 다중 연결의 경쟁·교착·장애 복구, 실제 로그인 권한 배포, 인증·HTTP·프론트엔드·Gemini 연동, 운영 DB 이관·배포는 미실행이다. Promise.all 재시도는 단일 연결 어댑터가 직렬화하며 다중 연결 동시성 통과로 세지 않는다.
v2의 PostgreSQL 16.15 검증은 사용자가 제공한 이전 이력이며 v3 실행 실적으로 옮겨 적지 않았습니다.

재생성 순서
python tools/generate-seed.py → npm test → python tools/generate-notes.py → python tools/build-docs.py → node tools/verify-browser.mjs → python tools/package.py
화면 검사에는 Playwright/Chromium이 필요하며 PLAYWRIGHT_MODULE로 설치 경로를 지정할 수 있습니다. 이번 의존성 신규 설치는 수행하지 않았습니다.
포장에는 원본 보존 확인과 diff 재생성을 위해 같은 상위 폴더의 v2 원본·ZIP이 필요합니다.
게임 소스와 운영 DB는 수정하지 않았습니다. 원본 v2 폴더·ZIP을 그대로 두고 v3를 별도 제공합니다.
