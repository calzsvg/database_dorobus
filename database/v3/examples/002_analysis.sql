-- 읽기 전용 예제. 아직 학생 기록이 없으면 빈 결과/0건이 정상이다.
-- 모든 질의는 수업 과제와 독립적이다. UI에서는 서버가 조회자의 권한·대상 사용자를 제한한다.
SET TIME ZONE 'Asia/Seoul';

-- Q01: 사건·버전별 도전 수/완료 수/실제 제출 수. 다중 JOIN으로 분모를 늘리지 않는다.
WITH scoped AS (
 SELECT * FROM dorobus.repair_runs WHERE started_at >= '2026-11-12T00:00:00+09:00'
), attempt_counts AS (
 SELECT repair_run_id,count(*) attempts FROM dorobus.learning_attempts
 WHERE repair_run_id IN(SELECT id FROM scoped) GROUP BY repair_run_id
)
SELECT c.code,v.version,r.case_role,count(*) runs,count(DISTINCT r.user_id) students,
 count(*) FILTER(WHERE r.phase='completed') completed_runs,
 round(100.0*count(*) FILTER(WHERE r.phase='completed')/NULLIF(count(*),0),1) completed_run_pct,
 round(avg(COALESCE(a.attempts,0)),2) submissions_per_run
FROM scoped r JOIN dorobus.contents c ON c.id=r.content_id
JOIN dorobus.content_versions v ON v.id=r.content_version_id
LEFT JOIN attempt_counts a ON a.repair_run_id=r.id
GROUP BY c.code,v.version,r.case_role ORDER BY c.code,v.version;

-- Q02: 판정 5종을 그대로 집계. partial/needs/unclear를 모두 '오답'으로 합치지 않는다.
SELECT c.code,v.version,a.verdict,count(*) submissions,
 count(DISTINCT a.user_id) students
FROM dorobus.learning_attempts a JOIN dorobus.content_versions v ON v.id=a.content_version_id
JOIN dorobus.contents c ON c.id=v.content_id
WHERE a.repair_run_id IS NOT NULL GROUP BY c.code,v.version,a.verdict ORDER BY c.code,v.version,a.verdict;

-- Q03: 학생이 선택한 근거 빈도. 이 값은 단서를 보았다는 횟수나 근거 타당성 점수가 아니다.
SELECT c.code,v.version,e.clue_key,cl.title,count(*) selected_count
FROM dorobus.repair_attempt_evidence e JOIN dorobus.content_versions v ON v.id=e.content_version_id
JOIN dorobus.contents c ON c.id=v.content_id
JOIN dorobus.repair_clues cl ON cl.content_version_id=e.content_version_id AND cl.clue_key=e.clue_key
GROUP BY c.code,v.version,e.clue_key,cl.title ORDER BY c.code,selected_count DESC;

-- Q04: 도움 응답 발급/표시 확인/단서 해금. '읽고 이해했다'는 의미로 해석하지 않는다.
SELECT c.code,count(*) issued,count(h.shown_at) display_acknowledged,
 count(h.revealed_clue_key) clue_reveals
FROM dorobus.repair_hint_events h JOIN dorobus.content_versions v ON v.id=h.content_version_id
JOIN dorobus.contents c ON c.id=v.content_id GROUP BY c.code ORDER BY c.code;

-- Q05: 본인·콘텐츠·버전이 일치하는 완료 도전과 연결된 최초 완료만 해금 근거로 사용.
SELECT cc.user_id,p.code part_code,p.name part_name,rv.unlock_license_code
FROM dorobus.content_completions cc
JOIN dorobus.contents ct ON ct.id=cc.content_id AND ct.kind=cc.content_kind AND ct.kind='repair_case'
JOIN dorobus.repair_runs cr ON cr.id=cc.source_repair_run_id AND cr.user_id=cc.user_id
 AND cr.content_id=cc.content_id AND cr.content_version_id=cc.completed_version_id AND cr.phase='completed'
JOIN dorobus.repair_case_versions rv ON rv.content_version_id=cr.content_version_id AND rv.content_id=cr.content_id
LEFT JOIN dorobus.parts p ON p.code=rv.unlock_part_code
WHERE rv.unlock_part_code IS NOT NULL OR rv.unlock_license_code IS NOT NULL
ORDER BY cc.user_id,p.code;

-- Q06: 완료 보상 수령과 원장 연결 누락/금액 불일치 탐지. 정상이라면 0행.
SELECT rc.user_id,rc.reward_key,rc.cell_amount,t.amount ledger_amount
FROM dorobus.reward_claims rc LEFT JOIN dorobus.cell_transactions t
 ON t.user_id=rc.user_id AND t.operation_id=rc.operation_id
WHERE rc.source_repair_run_id IS NOT NULL AND (t.operation_id IS NULL OR t.amount<>rc.cell_amount);

-- Q07: 가설이 어느 원인을 처음 해결했는지. 퍼레이드의 부분 정답도 포함한다.
SELECT r.user_id,c.code,a.attempt_no,a.verdict,s.problem_key,p.title,s.solved_at
FROM dorobus.repair_problem_solutions s JOIN dorobus.repair_runs r ON r.id=s.run_id
JOIN dorobus.contents c ON c.id=r.content_id JOIN dorobus.learning_attempts a ON a.id=s.attempt_id
JOIN dorobus.repair_problems p ON p.content_version_id=s.content_version_id AND p.problem_key=s.problem_key
ORDER BY r.user_id,c.code,a.attempt_no,p.display_order;
