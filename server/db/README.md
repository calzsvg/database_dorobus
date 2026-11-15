# 미니PC 로그인 DB (PostgreSQL 16, 관리자 권한 없이 사용자 폴더에 설치)

설계와 SQL은 `database/v3/` (팀원 설계). 여기에는 미니PC에 올린 방식만 적는다.

## 구성
| 항목 | 위치 |
|---|---|
| PostgreSQL 16 실행 파일 | `~/.local/pg16/root` (`apt-get download` 받은 deb를 `dpkg -x`로 풀어 둠) |
| 데이터 | `~/dorobus/pgdata` (`initdb -U server --auth=peer -E UTF8 --locale=C.UTF-8`) |
| 서비스 | `server/systemd/dorobus-db.service` → `~/.config/systemd/user/` |
| 백업 | `dorobus-db-backup.timer` 매일 04:30, `~/dorobus/backups/` 14일 보관 |
| pg 패키지 | `~/dorobus/node_modules` (`npm install pg@8.13.1`). 자동 배포가 `~/dorobus/void`를 바꿔도 남는다 |
| 사이트 서버 접속 주소 | `~/.config/dorobus-db/env` (권한 600) |

## 보안
- 네트워크 포트를 열지 않는다: `listen_addresses = ''`, 유닉스 소켓 `~/dorobus/pgsock` (포트 번호 5433은 소켓 이름에만 쓰임).
- 비밀번호 없는 peer 인증. 리눅스 사용자 `server`만 `pg_ident.conf` 맵으로 `server`, `dorobus_owner`, `dorobus_app_dev`에 접속할 수 있다.
  - `pg_hba.conf`: `local all all peer map=dorobus`
  - `pg_ident.conf`: `dorobus server server`, `dorobus server dorobus_owner`, `dorobus server dorobus_app_dev`
- 사이트 서버는 런타임 권한만 가진 `dorobus_app_dev`로 접속한다. 비밀번호는 scrypt 해시로만 저장한다.

## 처음 설치 (다시 할 때)
```sh
export LD_LIBRARY_PATH=~/.local/pg16/root/usr/lib/x86_64-linux-gnu PATH=~/.local/pg16/root/usr/lib/postgresql/16/bin:$PATH
# postgresql.conf 끝에: listen_addresses = '', port = 5433, unix_socket_directories = '/home/server/dorobus/pgsock', timezone = 'Asia/Seoul'
systemctl --user enable --now dorobus-db.service
PGHOST=~/dorobus/pgsock PGPORT=5433 ADMIN_USER=server DB_NAME=dorobus bash database/v3/dev/setup-dev-db.sh
DOROBUS_OWNER_URL="postgresql://dorobus_owner@/dorobus?host=/home/server/dorobus/pgsock&port=5433" node database/v3/dev/seed-demo-accounts.mjs
echo 'DOROBUS_DATABASE_URL=postgresql://dorobus_app_dev@/dorobus?host=/home/server/dorobus/pgsock&port=5433' > ~/.config/dorobus-db/env
systemctl --user restart dorobus.service   # 로그에 db=on
```

## 로그인 세션과 게임 진행 (010_game_state_sessions.sql)
- 브라우저에는 `dorobus_sid` 쿠키(HttpOnly, Secure, SameSite=Lax, 30일)만 남는다. DB에는 토큰의 SHA-256 해시만 둔다.
- 게임 상태(CELL, 가구, progress 전체)는 `user_game_states`에 계정마다 JSON 한 덩어리로 저장한다. 화면이 변경 1.5초 뒤, 탭을 숨길 때, 1분마다 저장한다.
- 친구 방 방문, 좋아요, 셀 찾기는 서버가 방 주인 상태에 바로 반영하고 `user_game_events`에 남긴다. 방 주인 화면이 다음 저장 때 같은 일을 반영하면 지운다.
- 브라우저(localStorage)에 남아 있던 DB 전환 전 진행은 쓰지 않고, 로그인할 때 지운다(2026-11-15 전체 초기화 이후).
- DB 주소가 없는 개발 서버(`npm run dev`)에서만 예전처럼 브라우저 체험 모드로 동작한다.
- API: `/api/auth/login`, `/api/auth/signup`, `/api/auth/logout`, `/api/session`, `/api/state`, `/api/players`, `/api/friend` (모두 POST, 사이트 주소 Origin 검사)

## 수리 미션 행동 기록 (server/repair-log.mjs, 011_repair_messages.sql)
게임 화면(src/pages/Repair.jsx → src/game/repairLog.js)이 행동마다 `/api/repair/*`로 보내고, 서버가 팀원 v3 테이블에 남긴다.

| 게임 행동 | API | 기록 테이블 |
|---|---|---|
| 사건 시작, 이어 하기 | start | repair_runs (완료 전 도전이 있으면 이어 씀) |
| 관찰, NPC 질문, 점검, 기록 버튼 | clue | repair_clue_discoveries (처음 본 순서) |
| 수첩에 내 생각 적기 | notes | repair_clue_discoveries.note_text |
| 막혔어 / 가설 2번 연속 실패 / 시험 2번 실패 | hint | repair_hint_events (requested / judge_feedback / automatic) |
| 가설 제출 | attempt | learning_attempts, repair_attempt_evidence, repair_problem_solutions |
| 다시 조사하기 | rethink | repair_runs.phase |
| 작업대 설정 | adjust | repair_runs.settings, repair_trials.invalidated_at |
| 작업대 시험 | trial | repair_trials (시험 버튼 순서 = repair_tests.display_order) |
| 수리 완료 | complete | repair_runs, content_completions, 자동차면 issue_driving_license |
| 대화창 질문과 답 | message | repair_messages (child typed/button, void) |

### 팀원 repair-service.mjs와 다른 점 (확인 부탁)
- **판정:** repair-service는 서버가 `voidJudge-8366c21` 규칙으로 다시 채점한다. 게임은 그 뒤 고친 규칙 + Gemini로 판정하므로, 어긋나지 않게 게임 판정을 그대로 기록한다.
  - Gemini를 쓴 판정은 `judge_source='hybrid'`, `model_id`, `prompt_version='server/prompts'`
  - 규칙만 쓴 판정은 `judge_source='rule'`, `rule_version='game-voidJudge'`
- **진행 막기:** 서버가 진행을 막지 않는다(축제 스탬프, 원격 자격증 조건은 게임이 판단). 단 003의 `run_conditional_license_fk` 때문에 자동차 외 사건은 DB 운전면허가 있어야 기록된다. 이 기능 전에 게임에서만 면허를 받은 계정은 자동차 사건을 다시 하기 전까지 축제 사건이 기록되지 않는다(409 license_required). 가짜 면허를 만들지 않았다.
- **보상:** CELL은 게임 상태(user_game_states)에서 주므로 wallets, reward_claims, cell_transactions에는 쓰지 않는다(이중 지급 방지).
- **wrong_hypothesis_code:** 아직 비워 둔다(게임 판정 결과에 오답 유형 코드가 없음).
- **대화 저장:** 002 주석은 "전체 대화 저장 테이블은 만들지 않는다"였지만, 성장 보고서 설계안(6.2 messages)에 따라 011에서 대화창 내용만 추가했다.
