import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {database,metadata,read,root} from './database.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE?pathToFileURL(resolve(process.env.PGLITE_MODULE)).href:'@electric-sql/pglite');
const before=new PGlite();
const {db:after}=await database({extensions:false}); // v2→v3 비교는 007 확장 이전 기준
const report={generated_at:new Date().toISOString(),checks:[],limitations:['PGlite 단일 연결의 독립 메모리 DB 2개에 실제 SQL과 각 버전 시드를 적재해 비교. 실제 PostgreSQL 16.15 실행 또는 다중 연결 검증 아님.','baseline-v2는 원본 비교 전용. 일일 수리가 포함되지만 v3 설치 대상이 아님.']};
const query=async(db,s,p=[])=>(await db.query(s,p)).rows;
const check=async(name,fn)=>{await fn();report.checks.push({name,pass:true});};
function summarize(m){
 const constraints=m.tables.flatMap(t=>t.constraints),run=m.tables.find(t=>t.name==='repair_runs');
 const types=Object.fromEntries(['p','u','f','c','n'].map(type=>[type,constraints.filter(c=>c.type===type).length]));
 return {tables:m.table_count,columns:m.column_count,primary_keys:types.p,unique_constraints:types.u,foreign_keys:types.f,checks:types.c,not_null_columns:m.tables.flatMap(t=>t.columns).filter(c=>c.not_null).length,
  constraints_excluding_not_null:constraints.filter(c=>c.type!=='n').length,catalog_constraints_including_not_null:constraints.length,
  indexes:m.tables.reduce((n,t)=>n+t.indexes.length,0),user_triggers:m.triggers.length,
  repair_runs:{unique_constraints:run.constraints.filter(c=>c.type==='u').length,indexes:run.indexes.length,constraints_excluding_not_null:run.constraints.filter(c=>c.type!=='n').length}};
}
const key=x=>x.table+'.'+x.name;
const flat=m=>m.tables.flatMap(t=>t.constraints.filter(c=>c.type!=='n').map(c=>({table:t.name,...c})));
const indexes=m=>m.tables.flatMap(t=>t.indexes.map(i=>({table:t.name,...i})));
const diff=(b,a)=>({removed:b.filter(x=>!a.some(y=>key(x)===key(y))),added:a.filter(x=>!b.some(y=>key(x)===key(y))),changed:b.flatMap(x=>{const y=a.find(y=>key(x)===key(y));return y&&y.definition!==x.definition?[{table:x.table,name:x.name,before:x.definition,after:y.definition}]:[];})});
try{
 for(const f of ['001_core','002_repair','003_license','004_license_issuer','005_runtime_permissions'])await before.exec(await read('validation/baseline-v2/'+f+'.sql'));
 await before.exec(await read('validation/baseline-v2/content.sql'));
 report.engine=(await query(after,'SELECT version() version'))[0].version;
 const bm=await metadata(before),am=await metadata(after);report.before=summarize(bm);report.after=summarize(am);
 for(const [label,db] of [['before',before],['after',after]])report[label].repair_cases=Number((await query(db,'SELECT count(*) n FROM dorobus.repair_case_versions'))[0].n);
 await writeFile(resolve(root,'validation/schema-metadata-v2.json'),JSON.stringify(bm,null,2));
 report.constraints=diff(flat(bm),flat(am));report.index_changes=diff(indexes(bm),indexes(am));
 const removed=['learning_attempts.attempts_daily_verdict_check','repair_runs.repair_runs_check'];
 const changed=['learning_attempts.attempts_repair_answer_shape_check','learning_attempts.attempts_repair_metadata_check','repair_case_versions.repair_case_versions_case_role_check','repair_runs.repair_run_regular_diagnosis_check'];
 await check('일일 전용 CHECK 2개만 삭제되고 새 제약은 없음',()=>{assert.deepEqual(report.constraints.removed.map(key).sort(),removed.sort());assert.deepEqual(report.constraints.added,[]);});
 await check('일일 예외를 제거한 CHECK 4개만 변경, 그 외 PK·UNIQUE·FK·CHECK 이름·정의 전부 동일',()=>assert.deepEqual(report.constraints.changed.map(key).sort(),changed.sort()));
 await check('변경 CHECK는 daily 허용과 예외 제거에 한정',()=>{
  for(const c of report.constraints.changed){assert(c.before.includes('daily'));assert(!c.after.includes('daily'));}
  const answer=report.constraints.changed.find(x=>x.name==='attempts_repair_answer_shape_check');assert(answer.after.includes("NOT (answer ? 'option_id'::text)"));assert(!answer.after.includes('CASE'));
 });
 await check('수리 최초 완료·면허·보상 보호 FK/CHECK/UNIQUE 모두 그대로 유지',()=>{
  for(const name of ['repair_definition_kind_fk','completion_content_kind_fk','completion_repair_source_required','completion_must_be_finished_fk','reward_must_be_finished_fk','reward_one_per_repair_run_key'])assert.deepEqual(flat(am).find(x=>x.name===name),flat(bm).find(x=>x.name===name));
 });
 await check('28개 테이블 유지, business_date 컬럼만 삭제; 다른 타입·필수·기본값·생성식 동일',()=>{
  assert.deepEqual(am.tables.map(t=>t.name),bm.tables.map(t=>t.name));assert.equal(am.table_count,28);
  for(const b of bm.tables){const a=am.tables.find(t=>t.name===b.name);const cols=b.columns.filter(c=>!(b.name==='repair_runs'&&c.name==='business_date'));const schema=c=>{const {description,...rest}=c;return rest;};assert.deepEqual(a.columns.map(schema),cols.map(schema),b.name);}
  assert.equal(bm.column_count-am.column_count,1);
 });
 await check('일일 전용 인덱스 1개 삭제, 진행 중 도전 인덱스 조건만 변경',()=>{
  assert.deepEqual(report.index_changes.removed.map(x=>x.name),['repair_runs_daily_once_idx']);assert.deepEqual(report.index_changes.added,[]);
  assert.deepEqual(report.index_changes.changed.map(x=>x.name),['repair_runs_one_open_regular_idx']);assert(!report.index_changes.changed[0].after.includes('daily'));
 });
 await check('트리거 정의와 개수 동일, 식별자 보호 함수에서 business_date 비교만 삭제',async()=>{
  assert.deepEqual(am.triggers,bm.triggers);
  const definition=async db=>(await query(db,"SELECT pg_get_functiondef('dorobus.guard_repair_run_identity()'::regprocedure) def"))[0].def;
  assert.equal(await definition(after),(await definition(before)).replace('OLD.business_date,','').replace('NEW.business_date,',''));
 });
 await check('공통 SQL은 범위 COMMENT만 변경, 면허 FK·발급 함수·권한·선택 SQL은 바이트 동일',async()=>{
  const core=await read('validation/baseline-v2/001_core.sql');
  assert.equal(await read('sql/001_core.sql'),core.replace('도로버스 최종 설계 · 본편 스토리 제거, 일일 수리 유지, 교육은 수리와 독립','도로버스 최종 설계 v3 · 본편 스토리와 일일 수리 제외, 교육은 수리와 독립'));
  for(const f of ['003_license','004_license_issuer','005_runtime_permissions','006_index_candidates'])assert.equal(await read('sql/'+f+'.sql'),await read('validation/baseline-v2/'+f+'.sql'),f);
 });
 await check('남은 9개 사건의 모든 정의·식별자·규칙·보상과 부품·단서·시험은 v2와 동일',async()=>{
  for(const table of ['parts','contents','content_versions','repair_case_versions','repair_clues','repair_problems','repair_tests','repair_wrong_hypotheses']){
   let where='';if(table==='contents')where="WHERE code NOT LIKE 'daily:%'";
   else if(table==='content_versions')where="WHERE content_id IN(SELECT id FROM dorobus.contents WHERE code NOT LIKE 'daily:%')";
   else if(table==='repair_case_versions')where="WHERE case_role<>'daily'";
   const data=async db=>(await query(db,`SELECT row_to_json(t) row FROM dorobus.${table} t ${where} ORDER BY row_to_json(t)::text`)).map(x=>x.row);
   assert.deepEqual(await data(after),await data(before),table);
  }
  assert.equal(report.before.repair_cases,14);assert.equal(report.after.repair_cases,9);
 });
 for(const [label,db] of [['before',before],['after',after]]){
  await db.exec(await read('sql/006_index_candidates.sql'));const optional=summarize(await metadata(db));
  report[label].indexes_with_optional=optional.indexes;report[label].repair_runs.indexes_with_optional=optional.repair_runs.indexes;
 }
 await check('선택 SQL 적용 후에도 일일 인덱스 외 추가 인덱스 차이 없음',async()=>assert.deepEqual(diff(indexes(await metadata(before)),indexes(await metadata(after))),report.index_changes));
 report.passed=report.checks.length;report.failed=0;
 await writeFile(resolve(root,'validation/schema-comparison.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({before:report.before,after:report.after,passed:report.passed,failed:0}));
}catch(e){report.failed=1;report.error={message:e.message,code:e.code};await writeFile(resolve(root,'validation/schema-comparison.json'),JSON.stringify(report,null,2));throw e;}
finally{await before.close();await after.close();}
