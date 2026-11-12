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
