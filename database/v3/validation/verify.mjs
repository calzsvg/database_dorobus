import assert from 'node:assert/strict';
import {verifyCompletionIntegrity} from './completion-integrity.mjs';
import {verifyBirthDate} from './birth-date.mjs';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {database,metadata,root,read} from './database.mjs';
import {createRepairService} from '../server/repair-service.mjs';
const {db,pool,notices}=await database(),results=[];
let clockValue='2026-11-12T01:00:00Z';
const clock=()=>new Date(clockValue),api=createRepairService(pool,{clock});
const uid=randomUUID(),other=randomUUID(),nolic=randomUUID();
const ids=JSON.parse(await read('source/ids.json'));
const snapshot=JSON.parse(await read('source/game-snapshot.json'));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const one=async(sql,args=[])=>(await q(sql,args))[0];
const count=async(table)=>Number((await one(`SELECT count(*) n FROM dorobus.${table}`)).n);
async function check(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:e.message,code:e.code});throw e;}}
async function rejects(fn,code){await assert.rejects(fn,e=>e.code===code,`expected ${code}`);}
async function probe(sql,args,code='23503',role=false,constraint=null){await db.exec('BEGIN');try{if(role)await db.exec('SET LOCAL ROLE dorobus_app_runtime');await assert.rejects(()=>db.query(sql,args),e=>e.code===code&&(!constraint||e.constraint===constraint));}finally{await db.exec('ROLLBACK');}}
const start=(id,key,extra={})=>api.start(id,{code:key.includes(':')?key:'repair:'+key,requestId:randomUUID(),...extra});
async function observeAll(id,runId){for(let i=0;i<10;i++){const s=await api.resume(id,runId),next=s.clues.filter(c=>!c.known);if(!next.length)return s.known;for(const c of next)await api.discover(id,{runId,clueKey:c.key});}throw new Error('cyclic clue prerequisites');}
const answers={car:'오른쪽 뒷바퀴의 공기압이 낮아 차가 기울었습니다.',carousel:'받침대가 내려앉아서 높이가 낮아지고 바닥이 기울었습니다.',safari:'먹이 상자가 무거워 차량이 언덕을 못 올라갑니다.',food:'분기 위치가 잘못되어 치즈 추가 장치의 자리를 패티 뒤로 옮겨야 합니다.',viking:'배터리의 무게 때문에 한쪽이 무겁고 균형이 깨졌습니다.',coaster:'솜사탕 설탕이 레일에 쌓여 마찰이 커져 속도가 줄었습니다.',sign:'조명과 전선을 공유하고 함께 연결해서 전력이 부족합니다.',parade:'장식 무게 때문에 언덕을 못 오르고 전선을 공유하여 조명이 부족하며 풍선 무게가 한쪽으로 기울고 무대 설치물이 길을 막았습니다.',delivery:'롤러 방향이 반대이고 입구에 장애물이 있습니다.'};
async function solve(id,key,existing){const s=existing??await start(id,key),runId=s.run.id;const ev=await observeAll(id,runId);const result=await api.submit(id,{runId,requestId:randomUUID(),text:answers[key],evidence:ev});assert.equal(result.verdict,'correct',key+' diagnosis');const item=snapshot.regular.find(c=>c.id===key);const changes=Object.fromEntries(Object.entries(item.controls).map(([k,v])=>[k,Array.isArray(v.target)?v.target[0]:v.target]));await api.adjust(id,{runId,changes});const current=await api.resume(id,runId);for(const t of current.tests)assert.equal((await api.test(id,{runId,testKey:t.test_key,requestId:randomUUID()})).passed,true,key+' test');return {runId,result,finish:()=>api.complete(id,{runId,requestId:randomUUID()})};}
let failure=null;
try{
 const m=await metadata(db);await writeFile(resolve(root,'validation/schema-metadata.json'),JSON.stringify(m,null,2));
 await check('공통 15 + 수리 12 + 면허 1 = 28개 / 209개 컬럼 (v3 206 + 007 birth_date + 008 password_hash + 009 age)',()=>{assert.equal(m.table_count,28);assert.equal(m.column_count,209);assert(m.tables.find(t=>t.name==='users').columns.some(c=>c.name==='age'&&c.not_null));assert(m.tables.find(t=>t.name==='users').columns.some(c=>c.name==='birth_date'&&c.not_null));assert(!m.tables.some(t=>t.name.includes('story')));for(const t of ['courses','class_groups','enrollments','assignments'])assert(m.tables.some(x=>x.name===t));});
 await check('현재 소스의 도입 1·축제 6·최종 1·원격 1개 사건 적재',async()=>{assert.equal(await count('contents'),9);assert.equal(await count('repair_clues'),81);assert.equal(await count('repair_tests'),18);});
 await check('본편 스토리 유형은 신규 콘텐츠로 등록 불가',()=>probe("INSERT INTO dorobus.contents(code,kind) VALUES('forbidden-story','story_mission')",[],'23514'));
 await check('기존 공통 SQL 제약 검증 통과',async()=>{await db.exec(await read('validation/legacy-common-checks.sql'));});
 for(const id of [uid,other,nolic])await q("INSERT INTO dorobus.users(id,login_id,display_name,role,auth_subject,birth_date) VALUES($1,$2::text,'검증 학생','student',$2::text,DATE '2014-05-01')",[id,'test-'+id]);
 await check('면허 없는 일반 수리 시작 차단',()=>rejects(()=>start(nolic,'safari'),'DRIVING_LICENSE_REQUIRED'));
 const beginId=randomUUID();let car=await start(uid,'car',{requestId:beginId});
 await check('면허 없이 자동차 도입 사건 시작, 동일 시작 요청 재사용',async()=>{assert.equal(car.run.case_role,'onboarding');assert.equal(car.run.license_holder_id,null);assert.equal((await start(uid,'car',{requestId:beginId})).run.id,car.run.id);});
 await check('동일 시작 키로 다른 사건 요청 차단',()=>rejects(()=>start(uid,'safari',{requestId:beginId}),'IDEMPOTENCY_CONFLICT'));
 await check('다른 사용자의 도전 조회 차단',()=>rejects(()=>api.resume(other,car.run.id),'RUN_NOT_FOUND'));
 await check('미관찰 단서를 답안 근거로 첨부하면 거부',()=>rejects(()=>api.submit(uid,{runId:car.run.id,requestId:randomUUID(),text:answers.car,evidence:['pressure']}),'UNOBSERVED_EVIDENCE'));
 await check('직접 SQL에서도 무면허 일반 도전 FK 거부',()=>probe("INSERT INTO dorobus.repair_runs(user_id,content_id,content_version_id,case_role,start_request_id) SELECT $1,content_id,content_version_id,case_role,$2 FROM dorobus.repair_case_versions WHERE content_version_id=$3",[nolic,randomUUID(),ids.safari.version]));
 await check('생성 컬럼에 NULL을 지정해 면허 검사 우회 불가',()=>probe("INSERT INTO dorobus.repair_runs(user_id,content_id,content_version_id,case_role,start_request_id,license_holder_id) SELECT $1,content_id,content_version_id,case_role,$2,NULL FROM dorobus.repair_case_versions WHERE content_version_id=$3",[nolic,randomUUID(),ids.safari.version],'428C9'));
 await check('미완료 자동차 도전을 면허 근거로 등록 불가',()=>probe('INSERT INTO dorobus.driving_licenses(user_id,source_run_id,issued_at,request_id) VALUES($1,$2,now(),$3)',[uid,car.run.id,randomUUID()]));
 await check('미완료 도전을 최초 완료로 등록 불가',()=>probe('INSERT INTO dorobus.content_completions(user_id,content_id,completed_version_id,source_repair_run_id,content_kind) VALUES($1,$2,$3,$4,\'repair_case\')',[uid,car.run.content_id,car.run.content_version_id,car.run.id]));
 await check('미완료 도전에 보상 수령 등록 불가',()=>probe("INSERT INTO dorobus.reward_claims(user_id,reward_key,operation_id,cell_amount,source_repair_run_id) VALUES($1,'invalid',$2,30,$3)",[uid,randomUUID(),car.run.id]));
 await check("case_role='daily' 수리 정의 INSERT는 허용값 CHECK로 거부",()=>probe(
  "INSERT INTO dorobus.repair_case_versions(content_version_id,content_id,case_role,source_ref) VALUES($1,$2,'daily','negative-test')",[randomUUID(),randomUUID()],'23514',false,'repair_case_versions_case_role_check'));

 for(const answer of [{option_id:'choice_1'},{text:answers.car,option_id:'choice_1'}])await check('수리 제출 option_id 답안 '+(answer.text?'혼합':'단독')+' 형식은 DB CHECK로 거부',()=>probe(
  "INSERT INTO dorobus.learning_attempts(user_id,content_version_id,scope,answer,is_correct,request_id,repair_run_id,repair_case_role,attempt_no,verdict,judge_source,rule_version) VALUES($1,$2,'activity',$3,true,$4,$5,'onboarding',1,'correct','rule','8366c21-rule-v1')",
  [uid,car.run.content_version_id,answer,randomUUID(),car.run.id],'23514',true,'attempts_repair_answer_shape_check'));
 await check('서비스도 optionId 또는 option_id 답안 형식을 거부',async()=>{
  for(const extra of [{optionId:'choice_1'},{option_id:'choice_1'}])await rejects(()=>api.submit(uid,{runId:car.run.id,requestId:randomUUID(),text:answers.car,evidence:['pressure'],...extra}),'INVALID_HYPOTHESIS');
 });
 const ev=await observeAll(uid,car.run.id);
 const wrong=await api.submit(uid,{runId:car.run.id,requestId:randomUUID(),text:'배터리가 부족하여 자동차가 움직이지 못합니다.',evidence:ev});assert.equal(wrong.verdict,'wrong');
 await check('오답 제출을 원인 해결 행으로 연결 불가',()=>probe("INSERT INTO dorobus.repair_problem_solutions(run_id,content_version_id,problem_key,attempt_id,accepted_verdict) VALUES($1,$2,'root_cause',$3,'correct')",[car.run.id,car.run.content_version_id,wrong.attemptId]));
 const submitId=randomUUID();const correct=await api.submit(uid,{runId:car.run.id,requestId:submitId,text:answers.car,evidence:ev});
 await check('가설 판정 성공과 동일 제출 요청 중복 방지',async()=>{assert.equal(correct.verdict,'correct');assert.equal((await api.submit(uid,{runId:car.run.id,requestId:submitId,text:answers.car,evidence:ev})).attemptId,correct.attemptId);});
 await check('동일 제출 키에 답안 변경 시 거부',()=>rejects(()=>api.submit(uid,{runId:car.run.id,requestId:submitId,text:answers.safari,evidence:ev}),'IDEMPOTENCY_CONFLICT'));
 await check('시험 미통과 상태의 완료 거부',()=>rejects(()=>api.complete(uid,{runId:car.run.id,requestId:randomUUID()}),'COMPLETION_REQUIREMENTS_NOT_MET'));
 await check('오래된 화면 버전에서 설정 변경 거부',()=>rejects(()=>api.adjust(uid,{runId:car.run.id,changes:{tire:2},expectedRevision:0}),'STALE_REVISION'));
 await check('작업대 실패 시험도 보존',async()=>assert.equal((await api.test(uid,{runId:car.run.id,testKey:'straight',requestId:randomUUID()})).passed,false));
 await api.adjust(uid,{runId:car.run.id,changes:{tire:2,cap:1}});
 const testId=randomUUID();const straight=await api.test(uid,{runId:car.run.id,testKey:'straight',requestId:testId});
 await api.test(uid,{runId:car.run.id,testKey:'endurance',requestId:randomUUID()});
 await check('시험 요청 재전송은 동일 시험 결과 반환',async()=>assert.equal((await api.test(uid,{runId:car.run.id,testKey:'straight',requestId:testId})).id,straight.id));
 await check('시험 요청 키 재사용으로 다른 시험 실행 거부',()=>rejects(()=>api.test(uid,{runId:car.run.id,testKey:'endurance',requestId:testId}),'IDEMPOTENCY_CONFLICT'));
 await api.adjust(uid,{runId:car.run.id,changes:{cap:0}});
 await check('설정 변경은 관련 시험만 무효화',async()=>{const s=await api.resume(uid,car.run.id);assert(s.trials.some(t=>t.test_key==='straight'&&t.passed&&!t.invalidated_at));assert(!s.trials.some(t=>t.test_key==='endurance'&&t.passed&&!t.invalidated_at));});
 await api.adjust(uid,{runId:car.run.id,changes:{cap:1}});
 await check('설정을 되돌려도 무효 시험은 자동 복구하지 않음',()=>rejects(()=>api.complete(uid,{runId:car.run.id,requestId:randomUUID()}),'COMPLETION_REQUIREMENTS_NOT_MET'));
 await api.test(uid,{runId:car.run.id,testKey:'endurance',requestId:randomUUID()});
 const done=await api.complete(uid,{runId:car.run.id,requestId:randomUUID()});
 await check('자동차 완료·최초 완료·운전면허 한 트랜잭션 저장',async()=>{assert.equal(done.rewardCell,0);assert.equal(await count('driving_licenses'),1);assert.equal((await one('SELECT source_run_id FROM dorobus.driving_licenses WHERE user_id=$1',[uid])).source_run_id,car.run.id);});
 await check("case_role='daily' 수리 도전 INSERT는 정의 역할 FK로 거부",()=>probe(
  "INSERT INTO dorobus.repair_runs(user_id,content_id,content_version_id,case_role,start_request_id) VALUES($1,$2,$3,'daily',$4)",[uid,car.run.content_id,car.run.content_version_id,randomUUID()],'23503',true,'repair_runs_content_version_id_content_id_case_role_fkey'));
 await verifyCompletionIntegrity({db,check,uid,other,nolic,car,ids});
 await check('완료 재호출은 기존 결과 반환, 면허 중복 발급 없음',async()=>{const again=await api.complete(uid,{runId:car.run.id,requestId:randomUUID()});assert.equal(again.requestId,done.requestId);assert.equal(await count('driving_licenses'),1);});
 await check('완료 도전 변경 거부',()=>rejects(()=>api.rethink(uid,{runId:car.run.id}),'RUN_COMPLETED'));
 await check('서버 런타임은 면허 직접 INSERT 불가',()=>probe('INSERT INTO dorobus.driving_licenses(user_id,source_run_id,issued_at,request_id) VALUES($1,$2,now(),$3)',[other,car.run.id,randomUUID()],'42501',true));
 await check('면허를 다른 사용자에게 귀속 불가',async()=>{await db.exec('BEGIN');try{await q('DELETE FROM dorobus.driving_licenses WHERE user_id=$1',[uid]);await rejects(()=>db.query('INSERT INTO dorobus.driving_licenses(user_id,source_run_id,issued_at,request_id) VALUES($1,$2,now(),$3)',[other,car.run.id,randomUUID()]),'23503');}finally{await db.exec('ROLLBACK');}});
 await check('입장 면허와 원격 자격 분리',()=>rejects(()=>start(uid,'delivery'),'REMOTE_LICENSE_REQUIRED'));
 await check('퍼레이드 입장에 축제 최초 완료 4건 요구',()=>rejects(()=>start(uid,'parade'),'FESTIVAL_STAMPS_REQUIRED'));
 const safari=await start(uid,'safari'),hidden=snapshot.regular.find(x=>x.id==='safari').clueList.find(x=>x.after?.length);
 await check('사파리 선행 조건 미충족 단서 숨김·직접 조사 차단',async()=>{assert(!safari.clues.some(x=>x.key===hidden.id));await rejects(()=>api.discover(uid,{runId:safari.run.id,clueKey:hidden.id}),'CLUE_LOCKED');});
 const hintRequest=randomUUID(),hint=await api.help(uid,{runId:safari.run.id,requestId:hintRequest});
 await check('도움으로 열린 단서 저장·재접속 복원, 발견과 구분',async()=>{assert(hint.revealed_clue_key);assert.equal(hint.shown_at,null);const s=await api.resume(uid,safari.run.id);assert(s.revealed.includes(hint.revealed_clue_key));assert(!s.known.includes(hint.revealed_clue_key));assert(s.clues.some(x=>x.key===hint.revealed_clue_key&&!x.fact));assert.equal((await api.help(uid,{runId:safari.run.id,requestId:hintRequest})).id,hint.id);});
 await check('도움 화면 표시 확인은 별도 기록',async()=>{assert((await api.acknowledgeHint(uid,{runId:safari.run.id,hintId:hint.id})).shown_at);});
 await check('현재 사파리 콘텐츠 전 과정 완료',async()=>{await (await solve(uid,'safari',safari)).finish();});
 await check('부품 해금은 최초 완료로 계산하고 수강·과제를 요구하지 않음',async()=>{assert.equal(await count('enrollments'),0);assert.equal(await count('assignments'),0);assert((await api.resume(uid,safari.run.id)).parts.includes('conveyor'));});
 const replay=await start(uid,'car',{replay:true});
 await check('명시적 재도전은 새 도전·빈 조사 기록, 기존 면허 유지',async()=>{assert.notEqual(replay.run.id,car.run.id);assert.equal(replay.known.length,0);await (await solve(uid,'car',replay)).finish();assert.equal((await one('SELECT source_run_id FROM dorobus.driving_licenses WHERE user_id=$1',[uid])).source_run_id,car.run.id);});
 let parade;
 for(const key of ['carousel','food','viking','coaster','sign']){
  await check(key+' 최신 사건 완료·부품 해금',async()=>{await(await solve(uid,key)).finish();});
  if(key==='food')await check('서로 다른 축제 3종 완료만으로는 퍼레이드 입장 거부',()=>rejects(()=>start(uid,'parade'),'FESTIVAL_STAMPS_REQUIRED'));
  if(key==='viking')await check('서로 다른 축제 정확히 4종 완료 시 퍼레이드 입장 허용',async()=>{parade=await start(uid,'parade');assert.equal(parade.run.case_role,'finale');});
 }
 await check('신뢰할 수 있는 축제 최초 완료 6개가 부품 정확히 6종 해금',async()=>{
  assert.deepEqual((await api.resume(uid,car.run.id)).parts.sort(),['height_support','conveyor','branch_rail','counterweight','plank','wire'].sort());
 });
 await observeAll(uid,parade.run.id);
 await check('퍼레이드는 부분 정답으로 원인별 해결 누적',async()=>{const r=await api.submit(uid,{runId:parade.run.id,requestId:randomUUID(),text:'장식의 무게가 무거워 언덕에서 멈춥니다.',evidence:['hill','load']});assert.equal(r.verdict,'partial');const s=await api.resume(uid,parade.run.id);assert(s.solved.includes('hill'));assert.equal(s.run.phase,'investigation');});
 await check('퍼레이드 최종 완료 후 원격 자격 해금',async()=>{await(await solve(uid,'parade',parade)).finish();await(await solve(uid,'delivery')).finish();});
 // 별도 학생은 받침대만 보유하도록 하여 원본의 부품 대체 선택지 잠금을 확인한다.
 await(await solve(other,'car')).finish();await(await solve(other,'carousel')).finish();
 await check('도움 없이 선행 단서 관찰만으로도 다음 조사 해금',async()=>{const s=await start(other,'safari');for(const key of hidden.after)await api.discover(other,{runId:s.run.id,clueKey:key});assert((await api.resume(other,s.run.id)).clues.some(x=>x.key===hidden.id));});
 await check('대체 부품을 보유하면 미보유 부품 선택은 잠김',async()=>{await q('UPDATE dorobus.repair_case_versions SET entry_rule=\'{}\' WHERE content_version_id=$1',[ids.parade.version]);const p=await start(other,'parade');await observeAll(other,p.run.id);await api.submit(other,{runId:p.run.id,requestId:randomUUID(),text:answers.parade,evidence:['hill','load','power','lights','route']});await rejects(()=>api.adjust(other,{runId:p.run.id,changes:{load:1}}),'PART_LOCKED');await api.adjust(other,{runId:p.run.id,changes:{load:2}});await q('UPDATE dorobus.repair_case_versions SET entry_rule=\'{"min_festival_completions":4}\' WHERE content_version_id=$1',[ids.parade.version]);});
 // 현재 시드는 전부 0 CELL. 아래 양수 보상은 격리된 검증 DB에서만 임시 정의로 시험한다.
 await check('9개 실제 사건 reward_cell=0, 정상 전체 완료에서 보상·원장 없음',async()=>{
  assert.equal(Number((await one('SELECT count(*) n FROM dorobus.repair_case_versions WHERE reward_cell<>0')).n),0);
  assert.equal(await count('reward_claims'),0);assert.equal(await count('cell_transactions'),0);
 });
 const rewardUid=randomUUID();
 await q("INSERT INTO dorobus.users(id,login_id,display_name,role,auth_subject,birth_date) VALUES($1,$2::text,'보상 경로 검증','student',$2::text,DATE '2014-05-01')",[rewardUid,'fixture-'+rewardUid]);
 let rewardDone,rewardRun;
 try{
  await q('UPDATE dorobus.repair_case_versions SET reward_cell=17 WHERE content_version_id=$1',[ids.car.version]);
  rewardRun=await solve(rewardUid,'car');
  const beforeWallet=await one('SELECT balance FROM dorobus.wallets WHERE user_id=$1',[rewardUid]);
  const beforeLedger=await count('cell_transactions'),beforeClaims=await count('reward_claims'),beforeLicenses=await count('driving_licenses');
  await check('임시 양수 보상: 원장 직후 강제 실패 시 완료·면허·보상·원장·지갑 전부 롤백',async()=>{
   await rejects(()=>createRepairService(pool,{clock,testFault:'after-ledger'}).complete(rewardUid,{runId:rewardRun.runId,requestId:randomUUID()}),'TEST_INJECTED_FAILURE');
   assert.equal((await api.resume(rewardUid,rewardRun.runId)).run.phase,'bench');
   assert.equal(await count('reward_claims'),beforeClaims);assert.equal(await count('cell_transactions'),beforeLedger);
   assert.equal(await count('driving_licenses'),beforeLicenses);
   assert.deepEqual(await one('SELECT balance FROM dorobus.wallets WHERE user_id=$1',[rewardUid]),beforeWallet);
   assert.equal(Number((await one('SELECT count(*) n FROM dorobus.content_completions WHERE user_id=$1',[rewardUid])).n),0);
   assert.equal((await one('SELECT completion_request_id FROM dorobus.repair_runs WHERE id=$1',[rewardRun.runId])).completion_request_id,null);
  });
  await check('임시 양수 보상: 일반 최초 완료에서만 보상 지급',async()=>{
   rewardDone=await rewardRun.finish();assert.equal(rewardDone.rewardCell,17);
   assert.equal(Number((await one('SELECT balance FROM dorobus.wallets WHERE user_id=$1',[rewardUid])).balance),17);
   assert.equal((await one('SELECT reward_key FROM dorobus.reward_claims WHERE source_repair_run_id=$1',[rewardRun.runId])).reward_key,'first:'+ids.car.content);
  });
  await check('일반 완료 재시도 두 건에도 보상 한 번 유지 (단일 연결 직렬화)',async()=>{
   const done=await Promise.all([api.complete(rewardUid,{runId:rewardRun.runId,requestId:randomUUID()}),api.complete(rewardUid,{runId:rewardRun.runId,requestId:randomUUID()})]);
   assert(done.every(x=>x.rewardCell===17&&x.replayed));assert.equal(await count('reward_claims'),beforeClaims+1);assert.equal(await count('cell_transactions'),beforeLedger+1);
   assert.equal(Number((await one('SELECT balance FROM dorobus.wallets WHERE user_id=$1',[rewardUid])).balance),17);
  });
  await check('임시 양수 보상: 명시적 재도전 완료는 추가 지급 없음',async()=>{
   const replay=await start(rewardUid,'car',{replay:true});const done=await(await solve(rewardUid,'car',replay)).finish();
   assert.equal(done.rewardCell,0);assert.equal(done.firstCompletion,false);assert.equal(await count('reward_claims'),beforeClaims+1);
  });
 }finally{await q('UPDATE dorobus.repair_case_versions SET reward_cell=0 WHERE content_version_id=$1',[ids.car.version]);}
 await check('임시 보상 정의 복구 후 사건 9개 모두 0 CELL',async()=>{
  assert.equal(Number((await one('SELECT count(*) n FROM dorobus.repair_case_versions WHERE reward_cell<>0')).n),0);
 });
 await check('보상 수령·CELL 원장·지갑 합계 일치',async()=>{const row=await one('SELECT (SELECT sum(cell_amount) FROM dorobus.reward_claims) claims,(SELECT sum(amount) FROM dorobus.cell_transactions) ledger,(SELECT sum(balance) FROM dorobus.wallets) wallets');assert.equal(Number(row.claims),Number(row.ledger));assert.equal(Number(row.ledger),Number(row.wallets));});
 await check('정답 규칙·숨겨진 단서 본문은 조회 응답에 미포함',async()=>{const s=await api.resume(uid,car.run.id);assert(!JSON.stringify(s).includes('grading_rule'));});
 await verifyBirthDate({db,check});
 await check('동봉한 분석 조회문 7개 실행 가능',async()=>{const r=await db.exec(await read('examples/002_analysis.sql'));assert.equal(r.length,8);});
 await writeFile(resolve(root,'examples/verified-play.json'),JSON.stringify({carComplete:done,rewardFixture:{runId:rewardRun.runId,result:rewardDone,amount:17,definition_restored_to:0},note:'자동 검증용 가상 학생의 실제 SQL 실행 결과. 17 CELL은 양수 보상·롤백 검사 전용 임시 정의이며 배포 시드 9종은 모두 0 CELL. 운영 데이터가 아님.'},null,2));
}catch(e){failure=e;if(!results.some(x=>!x.pass))results.push({name:'검증 시나리오 준비/진행',pass:false,error:e.message,code:e.code});console.error(e.message,e.code,e.detail,e.query);}
const report={generated_at:new Date().toISOString(),engine:(await q('SELECT version() version'))[0].version,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,results,common_sql_notices:notices.filter(x=>/통과|PASS|검증/.test(x)),limitations:['PGlite 단일 연결 검증. 독립 PostgreSQL 서버의 여러 연결 경쟁·교착·권한 배포는 미검증.','인증·HTTP·프론트엔드·Gemini 연동 및 실제 운영 DB 전환은 수행하지 않음.']};
await writeFile(resolve(root,'validation/results.json'),JSON.stringify(report,null,2));await db.close();
console.log(JSON.stringify({passed:report.passed,failed:report.failed}));if(failure)process.exitCode=1;
