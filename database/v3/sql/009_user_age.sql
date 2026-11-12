-- v3 확장 009 · users.age 컬럼 · 008 다음 실행
-- 나이는 날짜가 지나면 바뀌므로 저장값이 낡을 수 있다. 그래서
--  1) 행을 넣거나 고칠 때마다 트리거가 birth_date로 다시 계산하고(직접 넣은 값은 무시),
--  2) dorobus.refresh_user_ages()로 생일이 지난 사람의 값을 고친다(서버가 시작할 때와 1시간마다 호출).
-- 항상 오늘 기준이 필요하면 dorobus.users_with_age 뷰(조회 시 계산)를 쓴다.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Seoul';

ALTER TABLE dorobus.users ADD COLUMN age INTEGER;
COMMENT ON COLUMN dorobus.users.age IS '만 나이(한국 시간 기준). birth_date로 자동 계산, 직접 입력값은 무시. refresh_user_ages()가 생일 지난 값을 갱신';

CREATE FUNCTION dorobus.set_user_age() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
 NEW.age := dorobus.age_on(NEW.birth_date, (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER users_set_age BEFORE INSERT OR UPDATE ON dorobus.users
 FOR EACH ROW EXECUTE FUNCTION dorobus.set_user_age();

-- 이미 있는 행(개발 DB 재적용 등)도 채운 뒤 필수로 바꾼다
UPDATE dorobus.users SET birth_date = birth_date;
ALTER TABLE dorobus.users ALTER COLUMN age SET NOT NULL,
 ADD CONSTRAINT users_age_nonnegative_check CHECK (age >= 0);

-- 생일이 지나 값이 바뀐 사람만 고친다. 고친 행 수를 돌려준다.
CREATE FUNCTION dorobus.refresh_user_ages() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, dorobus AS $fn$
DECLARE n INTEGER;
BEGIN
 UPDATE dorobus.users SET birth_date = birth_date
 WHERE age IS DISTINCT FROM dorobus.age_on(birth_date, (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date);
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN n;
END;
$fn$;
COMMENT ON FUNCTION dorobus.refresh_user_ages() IS '생일이 지나 users.age가 낡은 행을 갱신. 서버가 주기적으로 호출';
REVOKE ALL ON FUNCTION dorobus.refresh_user_ages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dorobus.refresh_user_ages() TO dorobus_app_runtime;
COMMIT;
