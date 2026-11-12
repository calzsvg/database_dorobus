"""실행 DB 메타데이터에서 오프라인 설명서·SVG·Mermaid ERD 생성."""
from pathlib import Path
import json,html,re
R=Path(__file__).resolve().parents[1]
def load(p):return json.loads((R/p).read_text(encoding='utf8'))
def write(p,s):(R/p).write_text(s,encoding='utf8')
def e(v):return html.escape(str(v if v is not None else '—'),quote=True)
m=load('validation/schema-metadata.json');result=load('validation/results.json');seed=load('source/seed-rows.json');source=load('source/provenance.json')
comparison=load('validation/schema-comparison.json')
assert result['failed']==0 and comparison['failed']==0
tables={t['name']:t for t in m['tables']}
groups=[('사용자·교육','identity','#60728d',['users','courses','class_groups','enrollments','assignments','player_profiles','items','user_items']),('콘텐츠 정의','definition','#137f7b',['contents','content_versions','repair_case_versions','parts','repair_clues','repair_problems','repair_tests','repair_wrong_hypotheses']),('면허·도전·답안','play','#365ecb',['driving_licenses','repair_runs','learning_attempts']),('학습 과정·완료','records','#9457aa',['repair_clue_discoveries','repair_attempt_evidence','repair_problem_solutions','repair_trials','repair_hint_events','content_completions','reward_claims']),('CELL 회계','money','#a96827',['wallets','cell_transactions'])]
labels=dict(zip(['users','courses','class_groups','enrollments','assignments','player_profiles','items','user_items','contents','content_versions','repair_case_versions','parts','repair_clues','repair_problems','repair_tests','repair_wrong_hypotheses','driving_licenses','repair_runs','learning_attempts','repair_clue_discoveries','repair_attempt_evidence','repair_problem_solutions','repair_trials','repair_hint_events','content_completions','reward_claims','wallets','cell_transactions'],['사용자','과정','반','수강','과제 배정','선택·설정','상점 물품','물품 보유','콘텐츠 식별자','콘텐츠 버전','수리 사건 버전','수리 해금 부품','단서 정의','원인 문제 정의','작업대 시험 정의','오답 유형 정의','게임 운전면허','수리 도전','답안 제출','확인한 단서','선택한 답안 근거','원인별 해결','시험 실행','도움·단서 해금','최초 완료','보상 수령','CELL 잔액','CELL 원장']))
common={'id':'행 고유 식별자','user_id':'이 기록의 사용자','content_id':'변하지 않는 콘텐츠 식별자','content_version_id':'이 기록에 적용한 정확한 콘텐츠 버전','run_id':'이 기록이 속한 수리 도전','clue_key':'해당 버전 안의 단서 키','problem_key':'해당 버전 안의 원인 문제 키','test_key':'해당 버전 안의 작업대 시험 키','attempt_id':'연결된 답안 제출','display_order':'같은 버전 안의 표시 순서','created_at':'행 생성 시각','updated_at':'최근 상태 갱신 시각','request_id':'재전송을 구별하는 요청 UUID. UNIQUE 조합은 아래 명세 참조','code':'코드와 DB가 함께 쓰는 고정 이름','name':'표시 이름','title':'표시 제목','case_role':'onboarding / festival / finale / remote','source_ref':'원본 소스 커밋과 사건 식별자','unlock_part_code':'최초 완료로 영구 해금하는 부품. 수량 아님','unlock_license_code':'퍼레이드 최초 완료로 얻는 remote_repair 자격','category':'observation 관찰 / question 질문 / inspection 점검 / record 기록','fact_text':'관찰 뒤 학생에게 공개할 단서의 사실 본문','npc_name':'질문 상대 이름. 질문 이외에는 NULL','dependent_controls':'설정 변경 시 이 시험을 무효화할 설정 키 목록','pass_text':'시험 성공 안내','fail_text':'시험 실패 안내','refute_clue_key':'이 오답 유형을 반박하는 단서','phase':'investigation 조사 / bench 시험 / completed 완료','settings':'작업대 현재 설정값 JSON. 유효 선택지는 서버 검사','bench_revision':'작업대 설정 변경 순번','state_revision':'화면 상태 변경 순번. 오래된 수정 요청 감지','draft_text':'제출 전 가설 초안. 참조 서비스의 저장 연결은 후속 작업','start_request_id':'도전 생성 요청 UUID. 사용자와 함께 UNIQUE','started_at':'서버가 확정한 도전 시작 시각','first_diagnosed_at':'처음 정답으로 작업대에 진입한 시각. 되돌아가도 유지','completed_at':'서버가 완료를 확정한 시각','repair_run_id':'수리 제출일 때 해당 도전. 독립 교육 제출이면 NULL','repair_case_role':'도전과 같은 사건 유형. 복합 FK의 일부','attempt_no':'도전 안의 제출 순번','verdict':'correct / partial / wrong / needs / unclear','judge_source':'rule / model / hybrid 판정 경로','rule_version':'적용한 서버 판정 규칙 버전','prompt_version':'모델 판정에 사용한 프롬프트 버전. 미사용 NULL','model_id':'실제 모델 식별자. 미사용 NULL','fallback_reason':'모델 대신 규칙으로 판단한 사유. 해당 없으면 NULL','feedback_text':'해당 제출에 확정된 안내 문구','wrong_hypothesis_code':'분류된 대표 오답 유형. 목록 밖이면 NULL','answer_redacted_at':'보관 정책에 따라 답안 원문을 제거한 시각. 현재 NULL','discovery_order':'그 도전에서 단서를 처음 확인한 순서','discovered_at':'단서를 처음 확인한 서버 시각','note_text':'해당 단서에 대한 학생 생각 메모. 사실과 별개','solved_at':'이 원인을 처음 인정한 시각','settings_snapshot':'시험 당시 설정 복사본. 현재 설정과 구분','passed':'서버 판정 통과 여부. 브라우저가 확정하지 않음','tested_at':'시험 실행 시각','invalidated_at':'설정 변경으로 과거 통과의 효력이 끝난 시각','triggered_by_attempt_id':'도움을 유발한 답안 제출. 수동 요청이면 NULL 가능','trigger_kind':'requested / automatic / judge_feedback','hint_key':'고정 힌트 식별자. 자유 생성 안내이면 NULL 가능','hint_text':'서버가 확정한 도움 본문','accepted_verdict':'correct 또는 partial만 허용. 연결한 제출 판정과 일치','source_phase':'참조 도전이 completed인지 검사하는 자동 생성 값'}
specific={('learning_attempts','is_correct'):'수리에서는 verdict=correct일 때만 true. partial/needs/unclear는 false이지만 모두 오답을 뜻하지 않음',('content_versions','grading_rule'):'정답·판정 자료 JSON. 서버 전용이며 브라우저에 전달 금지',('content_versions','public_body'):'공개 질문·보기·작업대 설정. 정답과 미관찰 사실은 제외'}
specific[('content_completions','source_repair_run_id')]='수리일 때 본인의 동일 콘텐츠·버전 completed 도전 필수. 비수리일 때 NULL. 실제 종류 FK·NOT NULL·CHECK·완료 FK가 함께 보장. 재도전으로 덮어쓰지 않음'
def desc(t,c):return specific.get((t,c['name'])) or c.get('description') or common.get(c['name'],'세부 허용값과 관계는 아래 SQL 제약 참조')
def keys(t,c):return list(dict.fromkeys('PK' if k['type']=='p' else 'FK' for k in t['constraints'] if k['type'] in ('p','f') and c['name'] in k['columns']))
def typ(s):return {'timestamp with time zone':'timestamptz','integer':'int','boolean':'bool'}.get(s,re.sub(r'character varying','varchar',s))
pos={};width=2300;cardw=390;rowh=24
for j,(_,_,color,names) in enumerate(groups):
 y=155
 for name in names:
  h=78+len(tables[name]['columns'])*rowh;pos[name]=(35+j*455,y,cardw,h,color);y+=h+48
height=max(y+h for x,y,w,h,c in pos.values())+65
svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="도로버스 전체 28개 테이블 ERD">','<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>','<style>text{font-family:Malgun Gothic,Arial,sans-serif}.edge{fill:none;stroke:#596b88;stroke-width:1.5;opacity:.18}.edge.active{stroke:#db582e;stroke-width:3;opacity:1}.entity{cursor:pointer}.entity.active>rect:first-of-type{stroke:#db582e;stroke-width:3}.column{font-size:13px}</style>',f'<rect width="{width}" height="{height}" fill="#f6f8fc"/>','<text x="35" y="43" font-size="26" font-weight="bold">도로버스 · 최종 전체 ERD v3</text>',f'<text x="35" y="73" font-size="15" fill="#52637b">{m["table_count"]}개 테이블 · {m["column_count"]}개 컬럼 | 자식 FK → 부모 PK/UNIQUE | PK/FK는 복합 키의 일부일 수 있음 | * 필수 / G 자동 계산</text>']
fks=[]
for name,t in tables.items():
 for k in t['constraints']:
  if k['type']!='f':continue
  target=k['target_table'];fks.append((name,target,k));x,y,w,h,color=pos[name];px,py,pw,ph,_=pos[target]
  sy=y+64+next(i for i,c in enumerate(t['columns']) if c['name']==k['columns'][0])*rowh-5
  ey=py+64+next(i for i,c in enumerate(tables[target]['columns']) if c['name']==k['target_columns'][0])*rowh-5
  idx=len(fks);start=x if px<x else x+w;end=px+pw if px<x else px
  if px==x:start=end=x+w;cx=x+w+18+(idx%7)*5
  else:cx=(start+end)/2+(idx%5-2)*8
  path=f'M{start},{sy} C{cx},{sy} {cx},{ey} {end},{ey}'
  svg.append(f'<path class="edge" data-from="{name}" data-to="{target}" d="{path}" marker-end="url(#arrow)"><title>{e(name+" → "+target+": "+k["definition"])}</title></path>')
for j,(title,group,color,names) in enumerate(groups):
 svg.append(f'<text x="{35+j*455}" y="125" font-size="20" fill="{color}" font-weight="bold">{e(title)}</text>')
 for name in names:
  t=tables[name];x,y,w,h,_=pos[name]
  svg.append(f'<g class="entity" data-table="{name}" tabindex="0"><title>{e(t["description"])}</title><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="white" stroke="#ccd5e3"/><path d="M{x+10} {y}H{x+w-10}Q{x+w} {y} {x+w} {y+10}V{y+48}H{x}V{y+10}Q{x} {y} {x+10} {y}" fill="{color}"/><text x="{x+13}" y="{y+22}" font-size="17" font-weight="bold" fill="white">{e(name)}</text><text x="{x+13}" y="{y+40}" font-size="12" fill="#eff5ff">{e(labels[name])}</text>')
  for i,c in enumerate(t['columns']):
   yy=y+69+i*rowh;mark='/'.join(keys(t,c));tail=(' *' if c['not_null'] else '')+(' G' if c['generated'] else '')
   if i%2==0:svg.append(f'<rect x="{x+1}" y="{yy-17}" width="{w-2}" height="24" fill="#f5f7fb"/>')
   svg.append(f'<text class="column" x="{x+10}" y="{yy}" fill="#42516b">{e(mark)}</text><text class="column" x="{x+58}" y="{yy}" fill="#17243b">{e(c["name"]+tail)}<title>{e(typ(c["type"])+": "+desc(name,c))}</title></text>')
  svg.append('</g>')
svg.append('</svg>');full=''.join(svg);write('erd/full-erd.svg',full)
mermaid=['erDiagram','    %% v3: 수리 완료는 도전 필수. 비수리 완료의 도전은 NULL. 조건부 필수성은 SQL CHECK/FK 참조.']
for name,t in tables.items():
 mermaid.append('    '+name+' {')
 for c in t['columns']:
  type_name=re.sub(r'[^A-Za-z0-9_]','_',typ(c['type']));ks=','.join(keys(t,c));comment=desc(name,c).replace('"',"'")[:85]
  mermaid.append(f'        {type_name} {c["name"]} {ks} "{comment}"')
 mermaid.append('    }')
for child,parent,k in fks:
 def nullable_column(key):
  col=next(c for c in tables[child]['columns'] if c['name']==key)
  constant=col['generated'] and re.fullmatch(r"'[^']*'::text",col['default_value'] or '')
  return not col['not_null'] and not constant
 nullable=any(nullable_column(key) for key in k['columns'])
 unique=any(v['type'] in ('p','u') and set(v['columns']).issubset(set(k['columns'])) for v in tables[child]['constraints'])
 mermaid.append(f'    {parent} '+('|o' if nullable else '||')+'--'+('o|' if unique else 'o{')+f' {child} : "{k["name"]}"')
write('erd/full-erd.mmd','\n'.join(mermaid)+'\n')
flow='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 220" role="img" aria-label="자동차부터 원격수리까지"><style>text{font-family:Malgun Gothic,Arial,sans-serif}</style><rect width="1100" height="220" rx="18" fill="#f2f7fa"/>'
steps=[('자동차 도입 미션','면허 없이 시작','원인 + 시험 2개 통과'),('운전면허 발급','완료와 함께 확정','자동차 이외 사건 입장'),('축제 수리 6종','최초 완료 → 부품','서로 다른 4종 완료'),('퍼레이드 수리','4개 원인 · 2개 시험','원격수리 자격 해금'),('원격 배송 수리','remote_repair 필요','본편 스토리와 독립')]
for i,(title,a,b) in enumerate(steps):
 x=20+i*218
 if i:flow+=f'<text x="{x-20}" y="116" font-size="22" fill="#567">→</text>'
 flow+=f'<rect x="{x}" y="35" width="194" height="150" rx="13" fill="white" stroke="#b8d4d6"/><text x="{x+15}" y="65" font-size="13" fill="#137f7b">0{i+1}</text><text x="{x+15}" y="95" font-size="18" font-weight="bold" fill="#17283d">{title}</text><text x="{x+15}" y="126" font-size="13" fill="#4b5c72">{a}</text><text x="{x+15}" y="150" font-size="12" fill="#4b5c72">{b}</text>'
flow+='</svg>';write('erd/progression.svg',flow)
notes=(R/'docs/design-notes.txt').read_text(encoding='utf8')
sections=re.split(r'\n(?=\d+\. )',notes)[1:]
noteshtml=[]
for s in sections:
 title,*body=s.strip().splitlines();n=title.split('.')[0]
 paragraphs=''.join(f'<p>{e(p)}</p>' for p in body if p)
 noteshtml.append(f'<section id="note-{n}" class="section"><div class="eyebrow">DESIGN NOTE {n.zfill(2)}</div><h2>{e(title.split(". ",1)[1])}</h2>{paragraphs}</section>')
tablehtml=[]
for g,group,color,names in groups:
 for name in names:
  t=tables[name];rows=[]
  for c in t['columns']:
   mark=' / '.join(keys(t,c)) or '—';status='수리 필수 / 비수리 NULL' if (name,c['name'])==('content_completions','source_repair_run_id') else ('자동 계산' if c['generated'] else ('필수' if c['not_null'] else '선택(NULL)'))
   rows.append(f'<tr><td><code>{e(c["name"])}</code></td><td>{e(typ(c["type"]))}</td><td>{mark}<br><small>{status}</small></td><td>{e(desc(name,c))}<small class="default">기본값/생성식: {e(c["default_value"])}</small></td></tr>')
  cons=''.join(f'<li><code>{e(c["name"])}</code><pre>{e(c["definition"])}</pre></li>' for c in t['constraints'])
  inds=''.join(f'<li><code>{e(i["name"])}</code><pre>{e(i["definition"])}</pre></li>' for i in t['indexes'])
  tablehtml.append(f'<details class="table-card" id="table-{name}" data-search="{e(name+" "+labels[name]+" "+g)}" data-group="{group}"><summary><span class="dot" style="background:{color}"></span><strong>{e(labels[name])}</strong><code>{name}</code><span>{len(t["columns"])} 컬럼</span></summary><div class="table-body"><p>{e(t["description"])}</p><div class="table-scroll"><table><thead><tr><th>컬럼</th><th>자료형</th><th>키·필수</th><th>뜻 / 기본값</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div><details class="constraints"><summary>PK·UNIQUE·FK·CHECK·NOT NULL 카탈로그 / {len(t["constraints"])}개</summary><ul>{cons}</ul></details><details class="constraints"><summary>실제 생성 인덱스 / {len(t["indexes"])}개</summary><ul>{inds}</ul></details></div></details>')
diffrows=[('일일 수리','5종·날짜·선택형 판정','설계 범위에서 제외','결정 철회 반영'),('수리 사건',comparison['before']['repair_cases'],comparison['after']['repair_cases'],'나머지 9개 정의는 동일'),('수리 도전','business_date 포함','business_date 삭제','일일 전용 컬럼 제거'),('수리 답안','일반 가설 또는 일일 option_id','text와 evidence','option_id 입력 거부'),('일반 보상','공통 지급 경로 유지','reward_cell>0이고 최초 완료일 때 지급','9개 시드는 모두 0 CELL'),('최초 완료·면허','v2 FK·CHECK·함수·권한','그대로 유지','구조 비교·회귀 검사'),('전체 규모',f"{comparison['before']['tables']}표 / {comparison['before']['columns']}컬럼",f"{comparison['after']['tables']}표 / {comparison['after']['columns']}컬럼",'실행 DB 카탈로그 집계')]

def table(headers,rows):return '<div class="table-scroll"><table><thead><tr>'+''.join('<th>'+e(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+e(x)+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'
case_rows=[]
for rv in seed['repair_case_versions']:
 v=next(v for v in seed['content_versions'] if v['id']==rv['content_version_id']);c=next(c for c in seed['contents'] if c['id']==v['content_id']);part=next((p['name'] for p in seed['parts'] if p['code']==rv.get('unlock_part_code')),None)
 n=sum(x['content_version_id']==v['id'] for x in seed['repair_clues']);t=sum(x['content_version_id']==v['id'] for x in seed['repair_tests'])
 case_rows.append([c['code'],v['title'],rv['case_role'],f'{n} / {t}',part or rv.get('unlock_license_code') or ('운전면허' if rv['case_role']=='onboarding' else '—'),rv['reward_cell']])
apirows=[('start','code, requestId, replay?','활성 공개 버전·면허·축제/원격 자격 확인. 재도전은 명시 요청'),('resume','runId','본인 도전·고정 버전·visible/known/revealed·설정·시험·도움 복원'),('discover','runId, clueKey, expectedRevision?','보이는 단서인지 확인 후 최초 관찰 저장·사실 공개'),('help / acknowledgeHint','runId, requestId / hintId','도움과 선행 해금 효과 저장 / 화면 표시 확인은 별도'),('submit','runId, requestId, text+evidence','서버 판정·제출·선택 근거·새로 해결된 원인 함께 저장'),('rethink','runId','조사로 복귀. 기존 답안/최초 진단/해결 이력 보존'),('adjust','runId, changes, expectedRevision?','선택값·부품 검사, 의존하는 통과 시험만 무효화'),('test','runId, testKey, requestId','서버가 고정 규칙으로 판정. 설정 스냅샷·실패도 기록'),('complete','runId, requestId','원인/시험 검사 후 완료·면허·보상 원자적 저장')]
count_fields=[('테이블','tables'),('컬럼','columns'),('PK','primary_keys'),('UNIQUE 제약','unique_constraints'),('FK','foreign_keys'),('CHECK','checks'),('제약 합계 (NOT NULL 제외)','constraints_excluding_not_null'),('NOT NULL 컬럼','not_null_columns'),('카탈로그 제약 (NOT NULL 포함)','catalog_constraints_including_not_null'),('전체 기본 인덱스','indexes'),('전체 선택 포함 인덱스','indexes_with_optional'),('사용자 정의 트리거','user_triggers')]
count_rows=[[label,comparison['before'][key],comparison['after'][key]] for label,key in count_fields]
for label,key in [('repair_runs UNIQUE','unique_constraints'),('repair_runs 기본 인덱스','indexes'),('repair_runs 선택 포함 인덱스','indexes_with_optional')]:count_rows.append([label,comparison['before']['repair_runs'][key],comparison['after']['repair_runs'][key]])
values={'STYLE':(R/'tools/report.css').read_text(encoding='utf8'),'SCRIPT':(R/'tools/report.js').read_text(encoding='utf8'),'FULL_ERD':full,'FLOW':flow,'DICTIONARY':''.join(tablehtml),'NOTES':''.join(noteshtml),'TOC':''.join(f'<a href="#note-{i+1}">{e(s.splitlines()[0])}</a>' for i,s in enumerate(sections)),'DIFF':table(['항목','v2','v3','이유'],diffrows),'CASES':table(['코드','최신 제목','유형','단서 / 시험','최초 완료 해금','CELL'],case_rows),'API':table(['서비스 메서드','입력','처리 계약'],apirows),'TESTS':''.join(f'<li><span class="pass">PASS</span> {e(t["name"])}</li>' for t in result['results']),'PASS_COUNT':str(result['passed']),'COLUMN_COUNT':str(m['column_count']),'CASE_COUNT':str(comparison['after']['repair_cases']),'SEED_CHECK_COUNT':str(len(load('validation/seed-validation.json')['checks'])),'COMPARISON_COUNT':str(comparison['passed']),'COUNTS':table(['집계 기준','v2 실제 실행','v3 실제 실행'],count_rows),'COMPARISON_TESTS':''.join(f'<li><span class="pass">PASS</span> {e(t["name"])}</li>' for t in comparison['checks']),'ENGINE':e(result['engine']),'SOURCES':''.join(f'<li><a href="{e(x["url"])}" target="_blank" rel="noopener">{e(x["path"])}</a><code class="hash">SHA256 {x["sha256"]}</code></li>' for x in source['files']),'GROUPS':''.join(f'<option value="{g[1]}">{g[0]}</option>' for g in groups)}
template=(R/'tools/report-template.html').read_text(encoding='utf8')
for key,value in values.items():template=template.replace('{{'+key+'}}',value)
assert not re.search(r'\{\{[A-Z_]+\}\}',template)
write('상세설명.html',template)
write('index.html','<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=상세설명.html"><title>도로버스 DB 설계 v3</title><a href="상세설명.html">상세설명 열기</a></html>')
print(json.dumps({'tables':len(tables),'columns':m['column_count'],'fk_constraints':len(fks),'svg_width':width,'svg_height':height,'html_bytes':len(template.encode('utf8'))}))


import runpy
runpy.run_path(str(R/'tools/generate-diff.py'))
