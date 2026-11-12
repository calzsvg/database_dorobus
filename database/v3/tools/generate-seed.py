"""게임 스냅샷에서 신규 개발 DB용 시드 생성. DB/게임 접속·수정 없음."""
from pathlib import Path
import json,uuid
ROOT=Path(__file__).resolve().parents[1]
def uid(k):return str(uuid.uuid5(uuid.NAMESPACE_URL,'dorobus-final-2026-11-12/'+k))
def q(v):
    if v is None:return 'NULL'
    if isinstance(v,bool):return 'TRUE' if v else 'FALSE'
    if isinstance(v,int):return str(v)
    if isinstance(v,dict):return "'"+json.dumps(v,ensure_ascii=False).replace("'","''")+"'::jsonb"
    if isinstance(v,list):return 'ARRAY['+','.join(q(x) for x in v)+']::text[]'
    return "'"+str(v).replace("'","''")+"'"
data=json.loads((ROOT/'source/game-snapshot.json').read_text(encoding='utf8'))
rows={}; ids={}; checks=[]
def add(t,**row):rows.setdefault(t,[]).append(row)
parts={'높이 조절 받침대':'height_support','컨베이어 벨트':'conveyor','분기 레일':'branch_rail','균형추':'counterweight','판자':'plank','전선 블록':'wire'}
for name,code in parts.items():add('parts',id=uid('part/'+code),code=code,name=name)
for c in data['regular']:
    code='repair:'+c['id']; cid=uid(code); vid=uid(code+'/v1'); ids[c['id']]={'content':cid,'version':vid}
    role='onboarding' if c['id']=='car' else 'finale' if c['id']=='parade' else 'remote' if c['id']=='delivery' else 'festival'
    clues={x['id'] for x in c['clueList']}; assert len(clues)==len(c['clueList'])
    for clue in c['clueList']:assert set(clue.get('after',[]))<=clues and clue['id'] not in clue.get('after',[])
    # 발행 단계에서 순환 의존을 금지한다. 런타임의 여러 선행 조건은 OR이다.
    graph={clue['id']:clue.get('after',[]) for clue in c['clueList']}
    def visit(key,path):
        assert key not in path, f'cyclic clue prerequisite: {code}/{key}'
        for dependency in graph[key]:visit(dependency,path|{key})
    for key in graph:visit(key,set())
    for hint in c['hints']:assert set(hint['clues'])<=clues
    for group in c['judge'].get('needs',[]):assert set(group)<=clues
    problems=c.get('problems') or [{'id':'overload' if c['id']=='safari' else 'root_cause','name':c['title']+'의 원인'}]
    for p in problems:
        assert set(p.get('needs',[]))<=clues
    controls={k:{**{x:y for x,y in v.items() if x not in ('target','parts')},'part_codes':[parts.get(p) for p in v.get('parts',[])]} for k,v in c['controls'].items()}
    entry={'min_festival_completions':4} if role=='finale' else {'requires_remote_license':True} if role=='remote' else {}
    for k,v in c['controls'].items():
        assert 0<=v['initial']<len(v['options'])
        assert all(0<=t<len(v['options']) for t in (v['target'] if isinstance(v['target'],list) else [v['target']]))
        assert all(p is None or p in parts for p in v.get('parts',[]))
    ref=data['commit']+':src/game/repairCases.js#'+c['id']
    add('contents',id=cid,code=code,kind='repair_case')
    add('content_versions',id=vid,content_id=cid,version=1,title=c['title'],public_body={'district':c['district'],'client':c['client'],'request':c['request'],'guide':c.get('guide',{'name':'보이드','portrait':'void.svg'}),'controls':controls},grading_rule={'engine':'8366c21-rule-v1','case_snapshot':c,'problem_keys':[p['id'] for p in problems]},published_at='2026-11-12T00:00:00+09:00')
    add('repair_case_versions',content_version_id=vid,content_id=cid,case_role=role,source_ref=ref,unlock_part_code=parts.get(c.get('part')),unlock_license_code='remote_repair' if role=='finale' else None,entry_rule=entry,reward_cell=0)
    for i,clue in enumerate(c['clueList'],1):add('repair_clues',content_version_id=vid,clue_key=clue['id'],category={'관찰':'observation','질문':'question','점검':'inspection','기록':'record'}[clue['type']],title=clue['label'],fact_text=clue['fact'],npc_name=clue.get('npc'),display_order=i,unlock_after_keys=clue.get('after',[]))
    for i,p in enumerate(problems,1):add('repair_problems',content_version_id=vid,problem_key=p['id'],title=p['name'],display_order=i)
    keys={'car':['straight','endurance'],'safari':['truck_run','feed_delivery'],'parade':['hill_balance','power_route']}.get(c['id'],[f'test_{i+1:02}' for i in range(len(c['tests']))])
    for i,title in enumerate(c['tests']):
        depends=c.get('testControls',[list(c['controls'])]*len(c['tests']))[i]; assert set(depends)<=set(c['controls'])
        add('repair_tests',content_version_id=vid,test_key=keys[i],title=title,dependent_controls=depends,pass_text=c['pass'],fail_text=c['fail'],display_order=i+1)
    wrongcodes=[]
    for i,w in enumerate(c['judge'].get('wrong',[])):
        assert w['clue'] in clues
        wc=['battery','passengers','wheel'][i] if c['id']=='safari' else f'wrong_{i+1:02}'
        wrongcodes.append(wc)
        add('repair_wrong_hypotheses',content_version_id=vid,code=wc,name=f"{c['title']} 오답 유형 {i+1}",refute_clue_key=w['clue'])
    rows['content_versions'][-1]['grading_rule']['wrong_codes']=wrongcodes
    checks.append({'case':code,'role':role,'clues':len(clues),'problems':len(problems),'tests':len(keys),'status':'PASS'})
contents_by_id={c['id']:c for c in rows['contents']}
assert all(contents_by_id[v['content_id']]['kind']=='repair_case' for v in rows['repair_case_versions'])
assert all('content_kind' not in v for v in rows['repair_case_versions']), 'generated kind must not be supplied'
sql='-- v3 검증 시드 · 최신 소스 8366c21 · 도입1/축제6/최종1/원격1. 신규 DB 관리자 초기 적재용.\n-- repair_case_versions.content_kind는 DB가 자동 생성하고 실제 contents.kind와 FK로 검증. 남은 9개 사건 식별자·게임 규칙은 v2와 동일.\nBEGIN;\n'
for table,items in rows.items():
    for row in items:sql+='INSERT INTO dorobus.'+table+' ('+','.join(row)+') VALUES ('+','.join(q(x) for x in row.values())+');\n'
sql+='COMMIT;\n'
(ROOT/'examples/001_content.sql').write_text(sql,encoding='utf8')
(ROOT/'source/seed-rows.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
(ROOT/'source/ids.json').write_text(json.dumps(ids,indent=2),encoding='utf8')
(ROOT/'validation/seed-validation.json').write_text(json.dumps({'schema_version':'v3','kind_consistency':'PASS: all repair definitions reference repair_case; generated content_kind is omitted','checks':checks,'counts':{k:len(v) for k,v in rows.items()}},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'contents':len(ids),'checks':len(checks),'counts':{k:len(v) for k,v in rows.items()}},ensure_ascii=False))
