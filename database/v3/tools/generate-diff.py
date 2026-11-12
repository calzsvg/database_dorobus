from pathlib import Path
import difflib
R=Path(__file__).resolve().parents[1]
baseline=R.parent/'dorobus-db-final-2026-11-12-v2'
paths=['README.txt','package.json','package-lock.json']
for folder,extensions in [('sql',{'.sql'}),('server',{'.mjs'}),('examples',{'.sql'}),('source',{'.json'}),('tools',{'.py','.mjs','.html','.js','.css'}),('docs',{'.txt'}),('validation',{'.mjs'}),('erd',{'.mmd'})]:
 for base in [baseline,R]:
  for p in (base/folder).glob('*'):
   if p.is_file() and p.suffix in extensions and p.name not in ('original-hashes.json','a-input-hashes.json'):paths.append(p.relative_to(base).as_posix())
diffs=[]
for path in sorted(set(paths)):
 old=(baseline/path).read_text(encoding='utf8').splitlines(keepends=True) if (baseline/path).is_file() else []
 new=(R/path).read_text(encoding='utf8').splitlines(keepends=True) if (R/path).is_file() else []
 diffs.extend(difflib.unified_diff(old,new,fromfile='v2/'+path,tofile='v3/'+path))
(R/'docs/v2-to-v3.diff').write_text(''.join(diffs),encoding='utf8')
