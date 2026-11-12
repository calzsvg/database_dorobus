-- 010. 로그인 세션과 게임 진행 저장 (브라우저 localStorage 대신 서버 DB에 기억)
-- - user_sessions: 로그인하면 서버가 무작위 토큰을 HttpOnly 쿠키로 주고, DB에는 토큰의 SHA-256 해시만 둔다.
-- - user_game_states: 화면 상태(CELL, 가구, 진행 progress)를 계정마다 JSON 한 덩어리로 둔다.
--   스토리·수리 기록을 002~004의 정규화 테이블로 옮기기 전까지의 저장소다.
-- - user_game_events: 친구가 내 방에서 한 일(방문 보상, 좋아요, 셀 찾기). 서버가 내 상태에 바로 반영하고,
--   내 화면이 다음에 저장할 때 같은 일을 화면 상태에도 반영한 뒤 지운다(화면과 서버가 서로 덮어쓰지 않도록).
BEGIN;

CREATE TABLE dorobus.user_sessions (
    token_hash BYTEA NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT user_sessions_pkey PRIMARY KEY (token_hash),
    CONSTRAINT user_sessions_user_fkey FOREIGN KEY (user_id) REFERENCES dorobus.users (id) ON DELETE CASCADE,
    CONSTRAINT user_sessions_hash_len_check CHECK (octet_length(token_hash) = 32),
    CONSTRAINT user_sessions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX user_sessions_user_idx ON dorobus.user_sessions (user_id);
CREATE INDEX user_sessions_expires_idx ON dorobus.user_sessions (expires_at);
COMMENT ON TABLE dorobus.user_sessions IS '로그인 세션. 쿠키의 토큰 원문은 저장하지 않고 SHA-256 해시만 둔다';

CREATE TABLE dorobus.user_game_states (
    user_id UUID NOT NULL,
    state JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_game_states_pkey PRIMARY KEY (user_id),
    CONSTRAINT user_game_states_user_fkey FOREIGN KEY (user_id) REFERENCES dorobus.users (id) ON DELETE CASCADE,
    CONSTRAINT user_game_states_object_check CHECK (jsonb_typeof(state) = 'object'),
    CONSTRAINT user_game_states_size_check CHECK (pg_column_size(state) <= 262144)
);
COMMENT ON TABLE dorobus.user_game_states IS '계정별 게임 진행 상태(CELL, 가구, progress). 화면이 몇 초마다 저장한다';

CREATE TABLE dorobus.user_game_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id UUID NOT NULL,
    kind VARCHAR(20) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_game_events_pkey PRIMARY KEY (id),
    CONSTRAINT user_game_events_user_fkey FOREIGN KEY (user_id) REFERENCES dorobus.users (id) ON DELETE CASCADE,
    CONSTRAINT user_game_events_kind_check CHECK (kind IN ('visit', 'found', 'fail', 'like'))
);
CREATE INDEX user_game_events_user_idx ON dorobus.user_game_events (user_id, id);
COMMENT ON TABLE dorobus.user_game_events IS '친구가 내 방에서 한 일. 방 주인 화면이 반영하면 지운다';

GRANT SELECT, INSERT, DELETE ON dorobus.user_sessions TO dorobus_app_runtime;
GRANT UPDATE (last_seen_at, expires_at) ON dorobus.user_sessions TO dorobus_app_runtime;
GRANT SELECT, INSERT ON dorobus.user_game_states TO dorobus_app_runtime;
GRANT UPDATE (state, revision, updated_at) ON dorobus.user_game_states TO dorobus_app_runtime;
GRANT SELECT, INSERT, DELETE ON dorobus.user_game_events TO dorobus_app_runtime;

COMMIT;
