/** 서버 전용 참조 구현. actorId는 인증 미들웨어가 확정한 UUID만 전달한다.
 * pool은 node-postgres의 connect()/client.query()/release() 인터페이스.
 * 브라우저에 DB 자격증명·grading_rule·이 모듈을 배포하지 않는다.
 * 로컬 규칙 판정 구현. 실제 회사 인증/HTTP/UI/Gemini 연동은 별도 작업이다.
 */
import {randomUUID} from 'node:crypto';
import {judgeLocally} from './vendor/voidJudge-8366c21.mjs';
const fail=(code,details={})=>{throw Object.assign(new Error(code),{code,details});};
const canon=v=>JSON.stringify(v);
const revive=v=>JSON.parse(JSON.stringify(v),(k,x)=>x&&x.$regex!==undefined?new RegExp(x.$regex,x.$flags):x);
const uuid=x=>{if(typeof x!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))fail('INVALID_REQUEST_ID');return x;};
// 해금 조회도 실제 정의 + 본인/콘텐츠/버전이 같은 completed 도전을 근거로 한다.
// DB 제약과 함께 사용하며 최초 완료 버전의 보상을 재도전 버전으로 덮어쓰지 않는다.
const completionSource=`FROM dorobus.content_completions cc
 JOIN dorobus.contents ct ON ct.id=cc.content_id AND ct.kind=cc.content_kind AND ct.kind='repair_case'
 JOIN dorobus.repair_runs cr ON cr.id=cc.source_repair_run_id AND cr.user_id=cc.user_id
  AND cr.content_id=cc.content_id AND cr.content_version_id=cc.completed_version_id AND cr.phase='completed'
 JOIN dorobus.repair_case_versions rv ON rv.content_version_id=cr.content_version_id AND rv.content_id=cr.content_id`;
export function createRepairService(pool,{clock=()=>new Date(),testFault=null}={}){
 const now=()=>clock().toISOString();
 const tx=async(actorId,fn)=>{
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   // 사용자 UUID의 64비트 해시에 대한 트랜잭션 잠금 → 도전 행 → 지갑 행.
   // users UPDATE 권한을 주지 않고 같은 사용자의 요청을 직렬화한다.
   const u=(await c.query('SELECT id FROM dorobus.users WHERE id=$1',[actorId])).rows[0];
   if(!u)fail('UNKNOWN_ACTOR');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))',[actorId]);
   const value=await fn(c);await c.query('COMMIT');return value;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 const lock=async(c,actorId,id)=>{
  const r=(await c.query('SELECT * FROM dorobus.repair_runs WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,actorId])).rows[0];
  if(!r)fail('RUN_NOT_FOUND');return r;
 };
 const definition=async(c,r)=>{
  const d=(await c.query(`SELECT v.*,rv.case_role,rv.entry_rule,rv.reward_cell,rv.unlock_part_code,rv.unlock_license_code,c.code
   FROM dorobus.content_versions v JOIN dorobus.repair_case_versions rv ON rv.content_version_id=v.id
   JOIN dorobus.contents c ON c.id=v.content_id WHERE v.id=$1`,[r.content_version_id])).rows[0];
  if(!d?.published_at)fail('UNPUBLISHED_CONTENT');
  if(d.grading_rule.engine!=='8366c21-rule-v1')fail('UNSUPPORTED_RULE_VERSION');
  return d;
 };
 const active=r=>{if(r.phase==='completed')fail('RUN_COMPLETED');};
 const revision=(r,expected)=>{if(expected!==undefined&&Number(r.state_revision)!==expected)fail('STALE_REVISION',{current:Number(r.state_revision)});};
 const bump=(c,id,at)=>c.query('UPDATE dorobus.repair_runs SET state_revision=state_revision+1,updated_at=$2 WHERE id=$1',[id,at]);
 const knowledge=async(c,r)=>{
  const clues=(await c.query('SELECT * FROM dorobus.repair_clues WHERE content_version_id=$1 ORDER BY display_order',[r.content_version_id])).rows;
  const known=(await c.query('SELECT clue_key FROM dorobus.repair_clue_discoveries WHERE run_id=$1 ORDER BY discovery_order',[r.id])).rows.map(x=>x.clue_key);
  const revealed=(await c.query('SELECT DISTINCT revealed_clue_key FROM dorobus.repair_hint_events WHERE run_id=$1 AND revealed_clue_key IS NOT NULL',[r.id])).rows.map(x=>x.revealed_clue_key);
  const visible=x=>!x.unlock_after_keys.length||known.includes(x.clue_key)||revealed.includes(x.clue_key)||x.unlock_after_keys.some(k=>known.includes(k));
  return {clues,known,revealed,visible};
 };
 const owned=async(c,actorId)=>(await c.query(`SELECT DISTINCT rv.unlock_part_code code ${completionSource}
  WHERE cc.user_id=$1 AND rv.unlock_part_code IS NOT NULL`,[actorId])).rows.map(x=>x.code);
 const checkParts=(d,settings,partCodes)=>{
  for(const [key,spec] of Object.entries(d.public_body.controls??{})){
   const need=spec.part_codes?.[settings[key]];
   // 원본 UI: 해당 설정의 대체 부품을 하나라도 보유하면 미보유 선택지만 잠금.
   // 대체 부품을 전혀 보유하지 않은 경우에는 원본의 fallback 허용을 보존한다.
   if(need&&!partCodes.includes(need)&&spec.part_codes.some(p=>p&&partCodes.includes(p)))fail('PART_LOCKED',{key,part:need});
  }
 };
 const state=async(c,r)=>{
  const d=await definition(c,r),k=await knowledge(c,r);
  const hints=(await c.query('SELECT id,request_id,trigger_kind,phase,hint_text,revealed_clue_key,issued_at,shown_at FROM dorobus.repair_hint_events WHERE run_id=$1 ORDER BY issued_at,id',[r.id])).rows;
  const trials=(await c.query('SELECT id,test_key,passed,settings_snapshot,tested_at,invalidated_at FROM dorobus.repair_trials WHERE run_id=$1 ORDER BY tested_at,id',[r.id])).rows;
  const solved=(await c.query('SELECT problem_key FROM dorobus.repair_problem_solutions WHERE run_id=$1 ORDER BY problem_key',[r.id])).rows.map(x=>x.problem_key);
  return {run:r,content:{id:d.content_id,versionId:d.id,code:d.code,title:d.title,...d.public_body},
   clues:k.clues.filter(k.visible).map(x=>({key:x.clue_key,category:x.category,title:x.title,npc:x.npc_name,known:k.known.includes(x.clue_key),...(k.known.includes(x.clue_key)?{fact:x.fact_text}:{})})),
   known:k.known,revealed:k.revealed,solved,hints,trials,parts:await owned(c,r.user_id),
   tests:(await c.query('SELECT test_key,title,dependent_controls FROM dorobus.repair_tests WHERE content_version_id=$1 ORDER BY display_order',[r.content_version_id])).rows};
 };
 const api={
  async start(actorId,{code,requestId,replay=false}){uuid(requestId);return tx(actorId,async c=>{
   const prior=(await c.query('SELECT * FROM dorobus.repair_runs WHERE user_id=$1 AND start_request_id=$2',[actorId,requestId])).rows[0];
   if(prior){const d=await definition(c,prior);if(d.code!==code)fail('IDEMPOTENCY_CONFLICT');return state(c,prior);}
   const d=(await c.query(`SELECT rv.*,v.public_body,v.published_at FROM dorobus.contents t
    JOIN dorobus.content_versions v ON v.content_id=t.id JOIN dorobus.repair_case_versions rv ON rv.content_version_id=v.id
    WHERE t.code=$1 AND t.is_active AND v.published_at IS NOT NULL AND v.published_at<=$2 ORDER BY v.version DESC LIMIT 1`,[code,now()])).rows[0];
   if(!d)fail('CONTENT_NOT_FOUND');
   const at=now();
   const existing=(await c.query(`SELECT * FROM dorobus.repair_runs WHERE user_id=$1 AND content_id=$2
     AND phase<>'completed'`,[actorId,d.content_id])).rows[0];
   if(existing)fail('RESUME_EXISTING_RUN',{runId:existing.id});
   if(!replay){const done=(await c.query('SELECT source_repair_run_id FROM dorobus.content_completions WHERE user_id=$1 AND content_id=$2',[actorId,d.content_id])).rows[0];if(done)fail('EXPLICIT_REPLAY_REQUIRED',{runId:done.source_repair_run_id});}
   if(d.case_role==='onboarding'&&code!=='repair:car')fail('INVALID_ONBOARDING');
   if(d.case_role!=='onboarding'){
    const lic=(await c.query('SELECT issued_at FROM dorobus.driving_licenses WHERE user_id=$1',[actorId])).rows[0];
    if(!lic||new Date(lic.issued_at)>new Date(at))fail('DRIVING_LICENSE_REQUIRED');
   }
   if(d.entry_rule.min_festival_completions){const n=Number((await c.query(`SELECT count(DISTINCT cc.content_id) n ${completionSource} WHERE cc.user_id=$1 AND rv.case_role='festival'`,[actorId])).rows[0].n);if(n<d.entry_rule.min_festival_completions)fail('FESTIVAL_STAMPS_REQUIRED');}
   if(d.entry_rule.requires_remote_license){const n=(await c.query(`SELECT 1 ${completionSource} WHERE cc.user_id=$1 AND rv.unlock_license_code='remote_repair'`,[actorId])).rows.length;if(!n)fail('REMOTE_LICENSE_REQUIRED');}
   const settings=Object.fromEntries(Object.entries(d.public_body.controls??{}).map(([k,s])=>[k,s.initial]));
   const r=(await c.query(`INSERT INTO dorobus.repair_runs(user_id,content_id,content_version_id,case_role,start_request_id,settings,started_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,[actorId,d.content_id,d.content_version_id,d.case_role,requestId,settings,at])).rows[0];
   return state(c,r);
  });},
  async resume(actorId,runId){return tx(actorId,async c=>state(c,await lock(c,actorId,runId)));},
  async discover(actorId,{runId,clueKey,expectedRevision}){return tx(actorId,async c=>{
   const r=await lock(c,actorId,runId);active(r);revision(r,expectedRevision);const k=await knowledge(c,r),clue=k.clues.find(x=>x.clue_key===clueKey);
   if(!clue||!k.visible(clue))fail('CLUE_LOCKED');
   if(!k.known.includes(clueKey)){
    await c.query('INSERT INTO dorobus.repair_clue_discoveries(run_id,content_version_id,clue_key,discovery_order,discovered_at) VALUES($1,$2,$3,$4,$5)',[r.id,r.content_version_id,clueKey,k.known.length+1,now()]);await bump(c,r.id,now());
   }
   return {clueKey,fact:clue.fact_text};
  });},
  async help(actorId,{runId,requestId}){uuid(requestId);return tx(actorId,async c=>{
   const r=await lock(c,actorId,runId);
   const prior=(await c.query('SELECT * FROM dorobus.repair_hint_events WHERE run_id=$1 AND request_id=$2',[runId,requestId])).rows[0];if(prior)return prior;
   active(r);
   const d=await definition(c,r),k=await knowledge(c,r),item=revive(d.grading_rule.case_snapshot);
   const index=item.hints.findIndex(h=>!h.clues.some(x=>k.known.includes(x)));
   const hint=item.hints[index];let text=r.phase==='bench'?'한 번에 한 설정을 바꾼 뒤 다시 시험해 보세요.':hint?.text??'확인한 단서를 이어서 원인을 설명해 보세요.';
   const hidden=k.clues.filter(x=>!k.visible(x));
   const order=item.hints.slice(Math.max(0,index)).flatMap(h=>h.clues);
   const reveal=r.phase==='investigation'?(order.map(key=>hidden.find(x=>x.clue_key===key)).find(Boolean)??hidden[0]):null;
   if(reveal)text+=' 새로운 조사 방법이 열렸어요.';
   const h=(await c.query(`INSERT INTO dorobus.repair_hint_events(run_id,content_version_id,request_id,trigger_kind,phase,hint_key,hint_text,rule_version,revealed_clue_key,issued_at)
    VALUES($1,$2,$3,'requested',$4,$5,$6,$7,$8,$9) RETURNING *`,[runId,r.content_version_id,requestId,r.phase,index>=0?'hint_'+index:null,text,d.grading_rule.engine,reveal?.clue_key??null,now()])).rows[0];await bump(c,r.id,now());return h;
  });},
  async acknowledgeHint(actorId,{runId,hintId}){return tx(actorId,async c=>{
   await lock(c,actorId,runId);return (await c.query('UPDATE dorobus.repair_hint_events SET shown_at=COALESCE(shown_at,$3) WHERE id=$1 AND run_id=$2 RETURNING id,shown_at',[hintId,runId,now()])).rows[0]??fail('HINT_NOT_FOUND');
  });},
  async submit(actorId,input){const {runId,requestId,text,evidence=[],expectedRevision}=input;
   if('optionId' in input||'option_id' in input)fail('INVALID_HYPOTHESIS');uuid(requestId);return tx(actorId,async c=>{
   const r=await lock(c,actorId,runId),d=await definition(c,r);
   const answer={text:typeof text==='string'?text.trim():''};
   const ev=[...new Set(evidence)].sort();
   const prior=(await c.query('SELECT * FROM dorobus.learning_attempts WHERE user_id=$1 AND request_id=$2',[actorId,requestId])).rows[0];
   if(prior){const oldEv=(await c.query('SELECT clue_key FROM dorobus.repair_attempt_evidence WHERE attempt_id=$1 ORDER BY clue_key',[prior.id])).rows.map(x=>x.clue_key);if(prior.repair_run_id!==runId||canon(prior.answer)!==canon(answer)||canon(oldEv)!==canon(ev))fail('IDEMPOTENCY_CONFLICT');return {attemptId:prior.id,verdict:prior.verdict,feedback:prior.feedback_text};}
   active(r);revision(r,expectedRevision);let result,solved=[],wrongCode=null;
   const before=(await c.query('SELECT problem_key FROM dorobus.repair_problem_solutions WHERE run_id=$1',[runId])).rows.map(x=>x.problem_key);
    if(r.phase!=='investigation')fail('RETURN_TO_INVESTIGATION_FIRST');
    if(answer.text.length<8||Array.from(answer.text).length>400||!ev.length)fail('INVALID_HYPOTHESIS');
    const k=await knowledge(c,r);if(k.known.length<2||ev.some(x=>!k.known.includes(x)))fail('UNOBSERVED_EVIDENCE');
    const item=revive(d.grading_rule.case_snapshot);result=judgeLocally(item,answer.text,k.known,before);
    solved=item.problems?(result.solved??[]):result.verdict==='correct'?d.grading_rule.problem_keys:[];
    if(result.verdict==='wrong'){const i=(item.judge.wrong??[]).findIndex(w=>w.re.test(answer.text));wrongCode=d.grading_rule.wrong_codes[i]??null;}
   const at=now(),seq=Number((await c.query('SELECT COALESCE(max(attempt_no),0)+1 n FROM dorobus.learning_attempts WHERE repair_run_id=$1',[runId])).rows[0].n);
   const a=(await c.query(`INSERT INTO dorobus.learning_attempts(user_id,content_version_id,scope,answer,is_correct,request_id,submitted_at,repair_run_id,repair_case_role,attempt_no,verdict,judge_source,rule_version,feedback_text,wrong_hypothesis_code)
    VALUES($1,$2,'activity',$3,$4,$5,$6,$7,$8,$9,$10,'rule',$11,$12,$13) RETURNING id`,[actorId,r.content_version_id,answer,result.verdict==='correct',requestId,at,runId,r.case_role,seq,result.verdict,d.grading_rule.engine,result.text,wrongCode])).rows[0];
   for(const key of ev)await c.query('INSERT INTO dorobus.repair_attempt_evidence(attempt_id,run_id,content_version_id,clue_key) VALUES($1,$2,$3,$4)',[a.id,runId,r.content_version_id,key]);
   if(['correct','partial'].includes(result.verdict))for(const key of solved.filter(x=>!before.includes(x)))await c.query(`INSERT INTO dorobus.repair_problem_solutions(run_id,content_version_id,problem_key,attempt_id,accepted_verdict,solved_at) VALUES($1,$2,$3,$4,$5,$6)`,[runId,r.content_version_id,key,a.id,result.verdict,at]);
   if(result.verdict==='correct')await c.query("UPDATE dorobus.repair_runs SET phase='bench',first_diagnosed_at=COALESCE(first_diagnosed_at,$2) WHERE id=$1",[runId,at]);
   await bump(c,runId,at);return {attemptId:a.id,verdict:result.verdict,feedback:result.text};
  });},
  async rethink(actorId,{runId}){return tx(actorId,async c=>{const r=await lock(c,actorId,runId);active(r);await c.query("UPDATE dorobus.repair_runs SET phase='investigation',state_revision=state_revision+1,updated_at=$2 WHERE id=$1",[runId,now()]);return {phase:'investigation'};});},
  async adjust(actorId,{runId,changes,expectedRevision}){return tx(actorId,async c=>{
   const r=await lock(c,actorId,runId);active(r);revision(r,expectedRevision);if(r.phase!=='bench')fail('BENCH_REQUIRED');
   const d=await definition(c,r),settings={...r.settings},changed=[];
   for(const [key,value] of Object.entries(changes)){const spec=d.public_body.controls[key];if(!spec||!Number.isInteger(value)||value<0||value>=spec.options.length)fail('INVALID_SETTING');if(settings[key]!==value){settings[key]=value;changed.push(key);}}
   checkParts(d,settings,await owned(c,actorId));
   if(changed.length){const at=now();await c.query(`UPDATE dorobus.repair_trials a SET invalidated_at=$3 FROM dorobus.repair_tests t WHERE a.run_id=$1 AND a.content_version_id=t.content_version_id AND a.test_key=t.test_key AND a.passed AND a.invalidated_at IS NULL AND t.dependent_controls && $2::text[]`,[runId,changed,at]);await c.query('UPDATE dorobus.repair_runs SET settings=$2,bench_revision=bench_revision+1,state_revision=state_revision+1,updated_at=$3 WHERE id=$1',[runId,settings,at]);}
   return {settings};
  });},
  async test(actorId,{runId,testKey,requestId}){uuid(requestId);return tx(actorId,async c=>{
   const r=await lock(c,actorId,runId),prior=(await c.query('SELECT * FROM dorobus.repair_trials WHERE run_id=$1 AND request_id=$2',[runId,requestId])).rows[0];if(prior){if(prior.test_key!==testKey)fail('IDEMPOTENCY_CONFLICT');return prior;}
   active(r);if(r.phase!=='bench')fail('BENCH_REQUIRED');
   const d=await definition(c,r),test=(await c.query('SELECT * FROM dorobus.repair_tests WHERE content_version_id=$1 AND test_key=$2',[r.content_version_id,testKey])).rows[0];if(!test)fail('TEST_NOT_FOUND');
   checkParts(d,r.settings,await owned(c,actorId));const item=d.grading_rule.case_snapshot;
   const passed=test.dependent_controls.every(k=>Array.isArray(item.controls[k].target)?item.controls[k].target.includes(r.settings[k]):item.controls[k].target===r.settings[k]);
   const trial=(await c.query(`INSERT INTO dorobus.repair_trials(run_id,content_version_id,test_key,request_id,bench_revision,settings_snapshot,passed,tested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[runId,r.content_version_id,testKey,requestId,r.bench_revision,r.settings,passed,now()])).rows[0];await bump(c,runId,now());return trial;
  });},
  async complete(actorId,{runId,requestId}){uuid(requestId);return tx(actorId,async c=>{
   const r=await lock(c,actorId,runId);
   if(r.phase==='completed'){
    const first=(await c.query('SELECT 1 FROM dorobus.content_completions WHERE source_repair_run_id=$1',[runId])).rows.length>0;
    const paid=(await c.query('SELECT COALESCE(sum(cell_amount),0) n FROM dorobus.reward_claims WHERE source_repair_run_id=$1',[runId])).rows[0];
    return {runId,completedAt:new Date(r.completed_at).toISOString(),requestId:r.completion_request_id,firstCompletion:first,rewardCell:Number(paid.n),replayed:true};
   }
   const d=await definition(c,r);
    if(r.phase!=='bench')fail('DIAGNOSIS_REQUIRED');
    const problems=(await c.query('SELECT problem_key FROM dorobus.repair_problems WHERE content_version_id=$1',[r.content_version_id])).rows;
    const solved=(await c.query('SELECT problem_key FROM dorobus.repair_problem_solutions WHERE run_id=$1',[runId])).rows.map(x=>x.problem_key);
    const tests=(await c.query('SELECT test_key FROM dorobus.repair_tests WHERE content_version_id=$1',[r.content_version_id])).rows;
    const valid=(await c.query('SELECT DISTINCT test_key FROM dorobus.repair_trials WHERE run_id=$1 AND passed AND invalidated_at IS NULL',[runId])).rows.map(x=>x.test_key);
    if(!problems.length||problems.some(p=>!solved.includes(p.problem_key))||!tests.length||tests.some(t=>!valid.includes(t.test_key)))fail('COMPLETION_REQUIREMENTS_NOT_MET');
    checkParts(d,r.settings,await owned(c,actorId));
   const at=now();await c.query("UPDATE dorobus.repair_runs SET phase='completed',completed_at=$2,completion_request_id=$3,state_revision=state_revision+1,updated_at=$2 WHERE id=$1",[runId,at,requestId]);
   const first=await c.query(`INSERT INTO dorobus.content_completions(user_id,content_id,completed_version_id,completed_at,source_repair_run_id,content_kind) VALUES($1,$2,$3,$4,$5,'repair_case') ON CONFLICT(user_id,content_id) DO NOTHING RETURNING user_id`,[actorId,r.content_id,r.content_version_id,at,runId]);
   if(r.case_role==='onboarding')await c.query('SELECT dorobus.issue_driving_license($1,$2)',[actorId,runId]);
   const amount=d.reward_cell,pay=amount>0&&first.rows.length>0;
   if(pay){
    const operation=randomUUID(),rewardKey=`first:${r.content_id}`;
    // UNIQUE 충돌을 무시하고 잔액만 올리지 않는다. 충돌은 전체 트랜잭션 실패.
    await c.query('INSERT INTO dorobus.reward_claims(user_id,reward_key,operation_id,cell_amount,source_repair_run_id,claimed_at) VALUES($1,$2,$3,$4,$5,$6)',[actorId,rewardKey,operation,amount,runId,at]);
    await c.query('INSERT INTO dorobus.cell_transactions(user_id,amount,reason,operation_id,created_at) VALUES($1,$2,$3,$4,$5)',[actorId,amount,'repair_reward',operation,at]);
    if(testFault==='after-ledger')fail('TEST_INJECTED_FAILURE');
    await c.query('INSERT INTO dorobus.wallets(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING',[actorId]);
    await c.query('UPDATE dorobus.wallets SET balance=balance+$2,updated_at=$3 WHERE user_id=$1',[actorId,amount,at]);
   }
   return {runId,completedAt:at,requestId,firstCompletion:first.rows.length>0,rewardCell:pay?amount:0};
  });}
 };
 return api;
}
