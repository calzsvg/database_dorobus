#!/usr/bin/env bash
# v3 검증 시나리오(validation/verify.mjs)를 실제 PostgreSQL 16 서버에서 실행한다.
# - 개발 DB(dorobus_dev)와 역할 이름이 겹치지 않도록 임시 PostgreSQL 클러스터를 별도 포트에 띄우고, 끝나면 지운다.
# - 서비스 호출은 dorobus_app_dev 로그인의 다중 연결 풀로 실행한다(PGlite 단일 연결 직렬화와 다름).
# - 결과: dev/results/validation/results.json, schema-metadata.json, pg-vs-pglite.json
set -euo pipefail
export LC_ALL="${LC_ALL:-en_US.UTF-8}"  # macOS: 미지정 시 postmaster가 시작되지 않음
HERE="$(cd "$(dirname "$0")" && pwd)"
V3="$(cd "$HERE/.." && pwd)"
[ -d /opt/homebrew/opt/postgresql@16/bin ] && export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
export PGPORT="${VERIFY_PGPORT:-54329}" PGHOST="${TMPDIR:-/tmp}" PGDATABASE=dorobus_verify
export VERIFY_OUT="${VERIFY_OUT:-$HERE/results}"
mkdir -p "$VERIFY_OUT"
DATA="$(mktemp -d "${TMPDIR:-/tmp}/dorobus-verify-XXXX")"
cleanup() { pg_ctl -D "$DATA" -m fast stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT

initdb -D "$DATA" -U postgres -A trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$DATA" -o "-p $PGPORT -k $PGHOST -c listen_addresses=''" -l "$DATA/server.log" -w start >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
CREATE ROLE dorobus_owner LOGIN CREATEROLE;
CREATE DATABASE dorobus_verify OWNER dorobus_owner TEMPLATE template0;
SQL
psql -X -q -U postgres -d postgres -tAc "SELECT version()"

[ -d "$HERE/node_modules/pg" ] || (cd "$HERE" && npm install --no-audit --no-fund --ignore-scripts >/dev/null)

cd "$V3"
node --import "$HERE/pg/hooks.mjs" validation/verify.mjs | tee "$VERIFY_OUT/console.txt" | tail -5

# 실제 PG16 카탈로그와 PGlite 카탈로그(validation/schema-metadata.json) 비교
node "$HERE/pg/compare-engines.mjs" "$V3/validation/schema-metadata.json" "$VERIFY_OUT/validation/schema-metadata.json" "$VERIFY_OUT/pg-vs-pglite.json"
