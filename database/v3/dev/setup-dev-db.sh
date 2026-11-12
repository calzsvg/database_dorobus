#!/usr/bin/env bash
# 도로버스 v3 로컬 개발 DB 생성 스크립트 (1단계)
# - 로컬 PostgreSQL 16에 개발용 DB를 새로 만들고 README 순서대로 SQL과 시드를 적재한다.
# - 운영 DB에는 절대 실행하지 않는다. 비밀번호 없는 로컬(trust) 접속을 전제로 한다.
#
# 사용법:
#   database/v3/dev/setup-dev-db.sh            # 없으면 생성, 이미 있으면 중단
#   database/v3/dev/setup-dev-db.sh --reset    # 개발 DB와 개발 역할을 지우고 다시 생성
#
# 환경 변수(선택): PGHOST, PGPORT, ADMIN_USER(기본: 현재 OS 사용자), DB_NAME(기본: dorobus_dev),
#                  WITH_INDEX_CANDIDATES=1 이면 sql/006_index_candidates.sql도 적용
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
V3="$(cd "$HERE/.." && pwd)"
DB_NAME="${DB_NAME:-dorobus_dev}"
OWNER="dorobus_owner"          # 스키마 소유자. 시드 적재·정의 발행 담당
RUNTIME="dorobus_app_runtime"  # 005가 만드는 NOLOGIN 권한 묶음
APP_LOGIN="dorobus_app_dev"    # 로컬 검증용 서버 로그인. RUNTIME 권한만 받는다
ADMIN_USER="${ADMIN_USER:-$(whoami)}"

if [ -d /opt/homebrew/opt/postgresql@16/bin ]; then
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

admin() { psql -X -q -v ON_ERROR_STOP=1 -U "$ADMIN_USER" -d postgres "$@"; }
exists() { [ "$(admin -tAc "$1")" = "1" ]; }

case "$(admin -tAc 'SHOW server_version_num')" in
  16*) ;;
  *) echo "PostgreSQL 16이 아닙니다: $(admin -tAc 'SHOW server_version')" >&2; exit 1 ;;
esac

if [ "${1:-}" = "--reset" ]; then
  echo "기존 개발 DB·역할 삭제: $DB_NAME, $APP_LOGIN, $RUNTIME, $OWNER"
  admin -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE)"
  admin -c "DROP ROLE IF EXISTS $APP_LOGIN"
  admin -c "DROP ROLE IF EXISTS $RUNTIME"
  admin -c "DROP ROLE IF EXISTS $OWNER"
fi

if exists "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'"; then
  echo "$DB_NAME이 이미 있습니다. 다시 만들려면 --reset을 사용하세요." >&2; exit 1
fi
for r in "$RUNTIME" "$APP_LOGIN"; do
  if exists "SELECT 1 FROM pg_roles WHERE rolname='$r'"; then
    echo "역할 $r가 이미 있습니다. 다른 DB에서 쓰는지 확인한 뒤 --reset을 사용하세요." >&2; exit 1
  fi
done

if ! exists "SELECT 1 FROM pg_roles WHERE rolname='$OWNER'"; then
  admin -c "CREATE ROLE $OWNER LOGIN CREATEROLE"
fi
admin -c "CREATE DATABASE $DB_NAME OWNER $OWNER ENCODING 'UTF8' TEMPLATE template0"
admin -d "$DB_NAME" -c "REVOKE ALL ON DATABASE $DB_NAME FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC"

files=(sql/001_core.sql sql/002_repair.sql sql/003_license.sql sql/004_license_issuer.sql sql/005_runtime_permissions.sql sql/007_user_birth_date.sql sql/008_user_password.sql sql/009_user_age.sql examples/001_content.sql)
[ "${WITH_INDEX_CANDIDATES:-0}" = "1" ] && files+=(sql/006_index_candidates.sql)
for f in "${files[@]}"; do
  echo "적용: $f"
  psql -X -q -v ON_ERROR_STOP=1 -U "$OWNER" -d "$DB_NAME" -f "$V3/$f"
done

# 로컬 검증용 서버 로그인: 런타임 권한만 상속
admin -c "CREATE ROLE $APP_LOGIN LOGIN IN ROLE $RUNTIME"
admin -c "GRANT CONNECT ON DATABASE $DB_NAME TO $APP_LOGIN"

echo
psql -X -U "$OWNER" -d "$DB_NAME" -tA -F ' ' -c "
SELECT 'tables', count(*)::text FROM pg_tables WHERE schemaname='dorobus'
UNION ALL SELECT 'columns', count(*)::text FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name) WHERE c.table_schema='dorobus' AND t.table_type='BASE TABLE'
UNION ALL SELECT 'repair_cases', count(*)::text FROM dorobus.repair_case_versions
UNION ALL SELECT 'version', current_setting('server_version')"
echo "완료: postgresql://$OWNER@${PGHOST:-localhost}:${PGPORT:-5432}/$DB_NAME (서버 접속은 $APP_LOGIN)"
