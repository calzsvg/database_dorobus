-- 011. 수리 사건 대화 기록 (학습 데이터 기반 성장 보고서 설계안 6.2 messages)
-- - 아이가 보이드에게 직접 쓴 질문(typed)과 빠른 질문 버튼(button), 보이드 답, 힌트를 사건 도전(repair_runs)마다 남긴다.
-- - 채점은 아이가 직접 쓴 발화(speaker='child' AND input_mode='typed')만 대상으로 한다(설계안 4.2).
-- - NPC에게 묻기와 관찰은 repair_clue_discoveries, 가설은 learning_attempts에 이미 남으므로 여기에는 대화창 내용만 둔다.
BEGIN;

CREATE TABLE dorobus.repair_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    run_id UUID NOT NULL,
    content_version_id UUID NOT NULL,
    seq INTEGER NOT NULL,
    speaker VARCHAR(10) NOT NULL,
    input_mode VARCHAR(10),
    is_hint BOOLEAN NOT NULL DEFAULT false,
    body TEXT NOT NULL,
    phase TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT repair_messages_pkey PRIMARY KEY (id),
    CONSTRAINT repair_messages_run_seq_key UNIQUE (run_id, seq),
    CONSTRAINT repair_messages_run_fkey FOREIGN KEY (run_id, content_version_id) REFERENCES dorobus.repair_runs (id, content_version_id),
    CONSTRAINT repair_messages_speaker_check CHECK (speaker IN ('child', 'void')),
    CONSTRAINT repair_messages_mode_check CHECK ((speaker = 'child' AND input_mode IN ('typed', 'button')) OR (speaker = 'void' AND input_mode IS NULL)),
    CONSTRAINT repair_messages_body_check CHECK (btrim(body) <> '' AND char_length(body) <= 1000),
    CONSTRAINT repair_messages_phase_check CHECK (phase IN ('investigation', 'bench'))
);
CREATE INDEX repair_messages_run_idx ON dorobus.repair_messages (run_id, seq);
COMMENT ON TABLE dorobus.repair_messages IS '수리 사건 대화창 기록. 아이 직접 입력과 버튼 입력을 구분해 성장 보고서 채점에 쓴다';

GRANT SELECT, INSERT ON dorobus.repair_messages TO dorobus_app_runtime;

COMMIT;
