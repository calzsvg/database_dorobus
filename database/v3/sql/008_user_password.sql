-- v3 확장 008 · 프로토타입 자체 로그인(아이디·비밀번호) · 007 다음 실행
-- 비밀번호 원문은 저장하지 않는다. 서버가 scrypt로 만든 해시 문자열만 저장한다.
-- auth_subject는 'local:<login_id>' 형식으로 자체 로그인 계정임을 표시한다(외부 로그인 도입 시 다른 접두어 사용).
BEGIN;
SET LOCAL TIME ZONE 'Asia/Seoul';

ALTER TABLE dorobus.users
 ADD COLUMN password_hash TEXT,
 ADD CONSTRAINT users_password_hash_format_check CHECK (password_hash IS NULL OR password_hash LIKE 'scrypt$%');
COMMENT ON COLUMN dorobus.users.password_hash IS '자체 로그인 비밀번호 해시(scrypt$N$r$p$salt$hash). 외부 로그인 계정은 NULL. 원문 저장 금지';

-- 자체 로그인 학생 가입. 생년월일 규칙은 register_user(007)와 같고, 해시와 auth_subject를 함께 저장한다.
CREATE FUNCTION dorobus.register_local_user(p_login_id TEXT, p_display_name TEXT, p_birth_date DATE, p_password_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, dorobus AS $fn$
DECLARE v_id UUID; v_login TEXT := lower(btrim(p_login_id));
BEGIN
 IF p_password_hash IS NULL OR p_password_hash NOT LIKE 'scrypt$%' THEN
  RAISE EXCEPTION 'password hash required' USING ERRCODE = '23514';
 END IF;
 v_id := dorobus.register_user(v_login, p_display_name, 'local:' || v_login, p_birth_date);
 UPDATE dorobus.users SET password_hash = p_password_hash WHERE id = v_id;
 RETURN v_id;
END;
$fn$;
COMMENT ON FUNCTION dorobus.register_local_user(TEXT, TEXT, DATE, TEXT) IS '자체 로그인 학생 가입. 생년월일 필수·미래 금지·아이디 중복 거부는 register_user와 같음';
REVOKE ALL ON FUNCTION dorobus.register_local_user(TEXT, TEXT, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dorobus.register_local_user(TEXT, TEXT, DATE, TEXT) TO dorobus_app_runtime;
-- 런타임은 users 전체 SELECT 권한(005)으로 로그인 시 해시를 읽는다. UPDATE 권한은 주지 않는다.
COMMIT;
