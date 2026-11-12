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
- 예전에 브라우저(localStorage)에 남아 있던 진행은, 그 계정이 서버에 상태가 없을 때 처음 로그인하면 한 번 서버로 옮기고 브라우저에서 지운다.
- DB 주소가 없는 개발 서버(`npm run dev`)에서만 예전처럼 브라우저 체험 모드로 동작한다.
- API: `/api/auth/login`, `/api/auth/signup`, `/api/auth/logout`, `/api/session`, `/api/state`, `/api/players`, `/api/friend` (모두 POST, 사이트 주소 Origin 검사)
