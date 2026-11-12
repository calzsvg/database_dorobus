import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// 각 공격은 독립 트랜잭션에서 실행하고 반드시 롤백한다.
// fixture 준비만 소유자 권한, 공격 INSERT는 실제 서버용 역할로 전환한다.
export async function verifyCompletionIntegrity({db,check,uid,other,nolic,car,ids}) {
 const q=async(s,p=[])=>(await db.query(s,p)).rows;
 async function trial(setup,action,code,constraint,role=true){
  await db.exec('BEGIN');
  try{
   const fixture=await setup();
   if(role)await db.exec('SET LOCAL ROLE dorobus_app_runtime');
   if(code)await assert.rejects(()=>action(fixture),e=>e.code===code&&(!constraint||e.constraint===constraint));
   else await action(fixture);
  }finally{await db.exec('ROLLBACK');}
 }
 const noop=async()=>{};
 const completion=(user,content,version,run,kind='repair_case')=>q(`INSERT INTO dorobus.content_completions
  (user_id,content_id,completed_version_id,source_repair_run_id,content_kind) VALUES($1,$2,$3,$4,$5) RETURNING *`,[user,content,version,run,kind]);
 const removeCar=()=>q('DELETE FROM dorobus.content_completions WHERE user_id=$1 AND content_id=$2',[uid,ids.car.content]);
 const education=async(kind='quiz')=>{
  const content=randomUUID(),version=randomUUID();
  await q('INSERT INTO dorobus.contents(id,code,kind) VALUES($1,$2,$3)',[content,'education-'+content,kind]);
  await q("INSERT INTO dorobus.content_versions(id,content_id,version,title,public_body,grading_rule) VALUES($1,$2,1,'비수리 검증','{}','{}')",[version,content]);
  return {content,version};
 };
 await check('v1의 컬럼 생략 방식으로 수리 최초 완료 등록 거부 (런타임)',()=>trial(noop,()=>q(`INSERT INTO dorobus.content_completions(user_id,content_id,completed_version_id)
  SELECT $1,content_id,content_version_id FROM dorobus.repair_case_versions WHERE case_role IN ('festival','finale')`,[nolic]),'23502'));
 for(const role of ['onboarding','festival','finale','remote']){
  await check(`${role}: 도전 NULL인 수리 완료 거부 (런타임)`,()=>trial(noop,()=>q(`INSERT INTO dorobus.content_completions(user_id,content_id,completed_version_id,content_kind,source_repair_run_id)
   SELECT $1,content_id,content_version_id,'repair_case',NULL FROM dorobus.repair_case_versions WHERE case_role=$2`,[nolic,role]),'23514','completion_repair_source_required'));
 }
 await check('수리 완료를 quiz로 위장하고 도전을 NULL로 입력해도 실제 종류 FK 거부',()=>trial(noop,()=>completion(nolic,ids.safari.content,ids.safari.version,null,'quiz'),'23503','completion_content_kind_fk'));
 await check('완료 종류 NULL은 CHECK의 NULL 통과로 우회 불가',()=>trial(noop,()=>completion(nolic,ids.safari.content,ids.safari.version,null,null),'23502'));
 await check('정의에 없는 임의 완료 종류도 거부',()=>trial(noop,()=>completion(nolic,ids.safari.content,ids.safari.version,null,'not_repair'),'23503','completion_content_kind_fk'));
 for(const kind of ['quiz','world','homework','coding_challenge']){
  await check(`${kind}: 정상 비수리 완료는 도전 없이 등록 (런타임)`,()=>trial(()=>education(kind),async f=>{
   const [row]=await completion(nolic,f.content,f.version,null,kind);assert.equal(row.source_phase,null);assert.equal(row.source_repair_run_id,null);
  }));
 }
 await check('비수리 콘텐츠에 수리 상세 정의를 붙여 종류 위장 불가',()=>trial(education,f=>q("INSERT INTO dorobus.repair_case_versions(content_version_id,content_id,case_role,source_ref) VALUES($1,$2,'festival','test')",[f.version,f.content]),'23503','repair_definition_kind_fk',false));
 await check('수리 상세의 자동 종류에 NULL을 직접 써서 우회 불가',()=>trial(education,f=>q("INSERT INTO dorobus.repair_case_versions(content_version_id,content_id,content_kind,case_role,source_ref) VALUES($1,$2,NULL,'festival','test')",[f.version,f.content]),'428C9',null,false));
 await check('기존 수리 정의의 실제 contents.kind를 quiz로 변경 불가 (소유자 DML)',()=>trial(noop,()=>q("UPDATE dorobus.contents SET kind='quiz' WHERE id=$1",[ids.safari.content]),'23503','repair_definition_kind_fk',false));
 await check('런타임 역할은 콘텐츠 종류 정의 UPDATE 권한 없음',()=>trial(noop,()=>q("UPDATE dorobus.contents SET kind='quiz' WHERE id=$1",[ids.safari.content]),'42501'));
 await check('본인의 같은 콘텐츠·버전 완료 도전은 직접 INSERT도 허용',()=>trial(removeCar,async()=>{const [r]=await completion(uid,ids.car.content,ids.car.version,car.run.id);assert.equal(r.source_phase,'completed');}));
 await check('다른 학생의 완료 도전 연결 거부 (강한 완료 FK)',()=>trial(noop,()=>completion(other,ids.car.content,ids.car.version,car.run.id),'23503','completion_must_be_finished_fk'));
 await check('다른 콘텐츠의 완료 도전 연결 거부 (강한 완료 FK)',()=>trial(noop,()=>completion(uid,ids.safari.content,ids.safari.version,car.run.id),'23503','completion_must_be_finished_fk'));
 await check('같은 콘텐츠의 다른 버전에 완료 도전 연결 거부',()=>trial(async()=>{
  await removeCar();const version=randomUUID();
  await q("INSERT INTO dorobus.content_versions(id,content_id,version,title,public_body,grading_rule) VALUES($1,$2,2,'검증 v2','{}','{}')",[version,ids.car.content]);return version;
 },version=>completion(uid,ids.car.content,version,car.run.id),'23503','completion_must_be_finished_fk'));
 const unfinished=async()=> (await q("INSERT INTO dorobus.repair_runs(user_id,content_id,content_version_id,case_role,start_request_id) VALUES($1,$2,$3,'onboarding',$4) RETURNING id",[nolic,ids.car.content,ids.car.version,randomUUID()]))[0].id;
 await check('미완료 도전 연결 거부 (런타임·강한 완료 FK)',()=>trial(unfinished,run=>completion(nolic,ids.car.content,ids.car.version,run),'23503','completion_must_be_finished_fk'));
 await check('완료 source_phase에 NULL을 직접 입력해 강한 FK 우회 불가',()=>trial(unfinished,run=>q("INSERT INTO dorobus.content_completions(user_id,content_id,completed_version_id,content_kind,source_repair_run_id,source_phase) VALUES($1,$2,$3,'repair_case',$4,NULL)",[nolic,ids.car.content,ids.car.version,run]),'428C9'));
 await check('완료 도전 연결을 나중에 NULL로 변경해도 CHECK 거부 (소유자 DML)',()=>trial(noop,()=>q('UPDATE dorobus.content_completions SET source_repair_run_id=NULL WHERE user_id=$1 AND content_id=$2',[uid,ids.car.content]),'23514','completion_repair_source_required',false));
 await check('완료 기록의 종류와 도전을 함께 위장 UPDATE해도 FK 거부',()=>trial(noop,()=>q("UPDATE dorobus.content_completions SET content_kind='quiz',source_repair_run_id=NULL WHERE user_id=$1 AND content_id=$2",[uid,ids.car.content]),'23503','completion_content_kind_fk',false));
 await check('비수리 완료에 수리 도전을 연결하는 혼합 입력 거부',()=>trial(education,f=>completion(uid,f.content,f.version,car.run.id,'quiz'),'23514','completion_repair_source_required'));
 const reward=(user,run)=>q("INSERT INTO dorobus.reward_claims(user_id,reward_key,operation_id,cell_amount,source_repair_run_id) VALUES($1,$2,$3,30,$4)",[user,'regression-'+randomUUID(),randomUUID(),run]);
 await check('약한 보상 FK 제거 후에도 다른 학생 완료 도전 보상 거부',()=>trial(noop,()=>reward(other,car.run.id),'23503','reward_must_be_finished_fk'));
 await check('약한 보상 FK 제거 후에도 미완료 도전 보상 거부',()=>trial(unfinished,run=>reward(nolic,run),'23503','reward_must_be_finished_fk'));
 await check('보상 source_phase NULL 직접 입력 우회 거부',()=>trial(unfinished,run=>q("INSERT INTO dorobus.reward_claims(user_id,reward_key,operation_id,source_repair_run_id,source_phase) VALUES($1,'invalid-phase',$2,$3,NULL)",[nolic,randomUUID(),run]),'428C9'));
 await check('같은 완료 도전에 다른 보상 키를 사용해도 중복 보상 거부',()=>trial(noop,async()=>{await reward(uid,car.run.id);await reward(uid,car.run.id);},'23505','reward_one_per_repair_run_key'));
 await check('완료의 근거 도전을 미완료로 되돌리면 참조 FK가 거부',()=>trial(noop,()=>q("UPDATE dorobus.repair_runs SET phase='investigation',completed_at=NULL,completion_request_id=NULL WHERE id=$1",[car.run.id]),'23503'));
 await check('완료의 근거 도전 삭제 거부 (소유자 DML)',()=>trial(noop,()=>q('DELETE FROM dorobus.repair_runs WHERE id=$1',[car.run.id]),'23503',null,false));
}
