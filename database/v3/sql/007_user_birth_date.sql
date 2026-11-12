-- v3 확장 007 · 계정 생년월일과 나이, 서버용 가입 함수 · 005 다음, 시드 전후 어느 쪽이든 실행 가능
-- 신규 개발 DB 전용. users에 행이 이미 있으면 NOT NULL 추가가 실패하므로 기존 DB에는 그대로 실행하지 않는다.
-- 나이는 시간이 지나면 바뀌므로 컬럼으로 저장하지 않는다. birth_date만 저장하고
-- dorobus.age_on() 함수와 dorobus.users_with_age 뷰에서 한국 시간 기준 만 나이로 계산한다.
BEGIN;
SET LOCAL TIME ZONE 'Asia/Seoul';

ALTER TABLE dorobus.users
 ADD COLUMN birth_date DATE NOT NULL,
 ADD CONSTRAINT users_birth_date_range_check CHECK (birth_date >= DATE '1900-01-01');
COMMENT ON COLUMN dorobus.users.birth_date IS '생년월일. 계정 만들 때 필수 입력. 미래 날짜 금지는 register_user와 서버가 검사(CHECK에 current_date를 쓰지 않음)';
COMMENT ON COLUMN dorobus.users.role IS '역할. student는 학생, teacher는 강사, developer는 전체 조회 담당(002에서 추가). 서버가 부여';

-- 만 나이: 생일이 지나야 한 살 늘어난다. 2월 29일생은 평년에 3월 1일부터 한 살 늘어난다(PostgreSQL age() 규칙).
CREATE FUNCTION dorobus.age_on(p_birth DATE, p_on DATE) RETURNS INTEGER
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN extract(year FROM age(p_on, p_birth))::integer;
COMMENT ON FUNCTION dorobus.age_on(DATE, DATE) IS '기준일(p_on)의 만 나이. 기준일이 생일보다 앞서면 음수';

-- 오늘(한국 시간) 기준 나이를 함께 보여 주는 조회용 뷰. 저장 데이터가 아니다.
CREATE VIEW dorobus.users_with_age AS
SELECT u.id, u.login_id, u.display_name, u.role, u.birth_date,
       dorobus.age_on(u.birth_date, (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date) AS age,
       u.created_at
FROM dorobus.users u;
COMMENT ON VIEW dorobus.users_with_age IS '사용자 + 오늘(Asia/Seoul) 기준 만 나이. auth_subject는 노출하지 않음';

-- 서버용 학생 가입 경로. 런타임 역할에는 users INSERT 권한을 주지 않고 이 함수만 실행하게 한다.
-- 인증(비밀번호·외부 로그인) 확인은 서버 책임이며 auth_subject는 인증 시스템이 확정한 값만 넘긴다.
-- 강사·개발자 계정은 관리자가 소유자 권한으로 직접 등록한다.
CREATE FUNCTION dorobus.register_user(p_login_id TEXT, p_display_name TEXT, p_auth_subject TEXT, p_birth_date DATE)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, dorobus AS $fn$
DECLARE v_id UUID; v_today DATE := (pg_catalog.now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
 IF p_birth_date IS NULL THEN
  RAISE EXCEPTION 'birth date required' USING ERRCODE = '23502';
 END IF;
 IF p_birth_date > v_today THEN
  RAISE EXCEPTION 'birth date cannot be in the future' USING ERRCODE = '23514';
 END IF;
 INSERT INTO dorobus.users(login_id, display_name, role, auth_subject, birth_date)
 VALUES (lower(btrim(p_login_id)), btrim(p_display_name), 'student', p_auth_subject, p_birth_date)
 RETURNING id INTO v_id;
 RETURN v_id;
END;
$fn$;
COMMENT ON FUNCTION dorobus.register_user(TEXT, TEXT, TEXT, DATE) IS '학생 계정 생성. 생년월일 필수·미래 날짜 거부. 아이디 중복은 users_login_id_key(23505)로 거부';
REVOKE ALL ON FUNCTION dorobus.register_user(TEXT, TEXT, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION dorobus.age_on(DATE, DATE) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION dorobus.register_user(TEXT, TEXT, TEXT, DATE) TO dorobus_app_runtime;
GRANT EXECUTE ON FUNCTION dorobus.age_on(DATE, DATE) TO dorobus_app_runtime;
GRANT SELECT ON dorobus.users_with_age TO dorobus_app_runtime;
COMMIT;
