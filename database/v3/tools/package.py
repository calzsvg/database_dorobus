"""v3 산출물·실제 QA 결과·원본 보존 검사 후 해시 목록과 별도 공유 ZIP 생성."""
from pathlib import Path
import json,hashlib,zipfile,datetime,difflib
from html.parser import HTMLParser
import xml.etree.ElementTree as ET
R=Path(__file__).resolve().parents[1]
def load(p):return json.loads((R/p).read_text(encoding='utf8'))
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.ids=[];self.dependencies=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a:self.ids.append(a['id'])
  if tag=='a' and 'href' in a:self.links.append(a['href'])
  if tag in ('script','img','link'):
   v=a.get('src') or a.get('href')
   if v and not v.startswith('data:'):self.dependencies.append(v)
import runpy
runpy.run_path(str(R/'tools/generate-diff.py'))
html=(R/'상세설명.html').read_text(encoding='utf8');p=Links();p.feed(html)
assert len(p.ids)==len(set(p.ids)),'duplicate HTML id'
assert not p.dependencies,'offline document must be self-contained'
for link in p.links:
 if link.startswith('#'):assert link[1:] in p.ids,link
 elif not link.startswith(('https:','http:','data:')):assert (R/link).is_file(),link
for f in (R/'erd').glob('*.svg'):ET.parse(f)
m=load('validation/schema-metadata.json');results=load('validation/results.json');comparison=load('validation/schema-comparison.json');browser=load('qa/browser-audit.json')
assert results['failed']==comparison['failed']==browser['failed']==0
assert results['passed']==len(results['results']) and results['passed']>0
assert comparison['passed']==len(comparison['checks']) and comparison['passed']>0
assert (m['table_count'],m['column_count'])==(comparison['after']['tables'],comparison['after']['columns'])
assert html.count('class="table-card"')==m['table_count']
constraints=[c for t in m['tables'] for c in t['constraints']]
assert sum(c['type']=='f' for c in constraints)==comparison['after']['foreign_keys']
assert sum(len(t['indexes']) for t in m['tables'])==comparison['after']['indexes']
assert '일일 수리 제외' in html and '본편 스토리 제거' in html and str(m['column_count']) in html
assert '세부 허용값과 관계는 아래 SQL 제약 참조' not in html
for file,h in browser['input_hashes'].items():assert digest(R/file)==h,'browser QA stale: '+file
ns={'s':'http://www.w3.org/2000/svg'}
tree=ET.parse(R/'erd/full-erd.svg')
entities=tree.findall('.//s:g[@class="entity"]',ns)
edges=tree.findall('.//s:path[@class="edge"]',ns)
assert {e.attrib['data-table'] for e in entities}=={t['name'] for t in m['tables']}
assert len(edges)==comparison['after']['foreign_keys']
for file,h in load('validation/original-hashes.json').items():assert digest(R.parent/file)==h,'original changed: '+file
audit={'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'table_count':m['table_count'],'column_count':m['column_count'],
 'schema_counts':comparison['after'],'sql_service_scenarios':results['passed'],'seed_checks':len(load('validation/seed-validation.json')['checks']),'schema_comparison_checks':comparison['passed'],
 'browser_checks':browser['passed'],'broken_local_links':0,'duplicate_html_ids':0,'svg_xml':'PASS','svg_entities':len(entities),'svg_fk_edges':len(edges),
 'external_document_dependencies':0,'original_files_unchanged':len(load('validation/original-hashes.json')),
 'browser_evidence':'qa/browser-audit.json','archive_checks':['ZIP CRC','exact file list','every included file byte-for-byte','MANIFEST.sha256 entry hashes'],
 'limitations':['단일 연결 PGlite 검증. 실제 PostgreSQL 다중 연결 경쟁 시험 미실행.','Mermaid는 편집용 소스로 동봉. 실제 화면은 SVG/HTML로 검증.','원본 보존 비교에는 이 프로젝트의 v2 폴더/ZIP이 필요. 팀원이 v3만 받은 경우 이 보존 비교 단계는 별도 환경에서 재현.']}
(R/'qa/package-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf8')
def files():
 return sorted(p for p in R.rglob('*') if p.is_file() and not any(x in ('node_modules','__pycache__','.git','.npm-cache') for x in p.relative_to(R).parts) and p.name!='MANIFEST.sha256')
manifest='\n'.join(digest(p)+'  '+p.relative_to(R).as_posix() for p in files())+'\n'
(R/'MANIFEST.sha256').write_text(manifest,encoding='utf8')
archive=R.parent/'도로버스_DB최종설계_팀원공유_2026-11-12-v3.zip'
included=files()+[R/'MANIFEST.sha256']
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in included:z.write(p,(Path(R.name)/p.relative_to(R)).as_posix())
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 expected={(Path(R.name)/p.relative_to(R)).as_posix() for p in included}
 assert set(z.namelist())==expected and len(z.namelist())==len(included)
 for p in included:assert z.read((Path(R.name)/p.relative_to(R)).as_posix())==p.read_bytes()
 for line in z.read(R.name+'/MANIFEST.sha256').decode('utf8').splitlines():
  expected_hash,path=line.split('  ',1);assert hashlib.sha256(z.read(R.name+'/'+path)).hexdigest()==expected_hash
zip_hash=digest(archive)
archive.with_suffix('.zip.sha256').write_text(zip_hash+'  '+archive.name+'\n',encoding='utf8')
print(json.dumps({'archive':archive.name,'files':len(included),'bytes':archive.stat().st_size,'sha256':zip_hash,'verified':True},ensure_ascii=False))
