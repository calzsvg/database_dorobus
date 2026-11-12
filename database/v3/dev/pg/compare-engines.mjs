// PGlite에서 뽑은 카탈로그와 실제 PostgreSQL 16에서 뽑은 카탈로그를 비교한다.
// 사용법: node compare-engines.mjs <pglite schema-metadata.json> <pg schema-metadata.json> <출력 json>
import {readFile, writeFile} from 'node:fs/promises';
const [pgliteFile, pgFile, out] = process.argv.slice(2);
const a = JSON.parse(await readFile(pgliteFile, 'utf8')), b = JSON.parse(await readFile(pgFile, 'utf8'));
const flat = m => {
  const map = new Map();
  for (const t of m.tables) {
    map.set(`table ${t.name}`, t.description ?? '');
    for (const c of t.columns) map.set(`column ${t.name}.${c.name}`, JSON.stringify([c.type, c.not_null, c.generated, c.default_value]));
    // NOT NULL 제약 행(contype 'n')은 PostgreSQL 18(PGlite)에만 있으므로 비교 대상에서 뺀다.
    for (const k of t.constraints.filter(k => k.type !== 'n')) map.set(`constraint ${t.name}.${k.name}`, k.definition);
    for (const i of t.indexes) map.set(`index ${t.name}.${i.name}`, i.definition);
  }
  for (const g of m.triggers) map.set(`trigger ${g.name}`, g.definition);
  return map;
};
const A = flat(a), B = flat(b);
const onlyPglite = [...A.keys()].filter(k => !B.has(k));
const onlyPg = [...B.keys()].filter(k => !A.has(k));
const different = [...A.keys()].filter(k => B.has(k) && A.get(k) !== B.get(k)).map(k => ({key: k, pglite: A.get(k), pg16: B.get(k)}));
const count = m => ({tables: m.table_count, columns: m.column_count,
  constraints_excluding_not_null: m.tables.flatMap(t => t.constraints).filter(k => k.type !== 'n').length,
  not_null_constraint_rows: m.tables.flatMap(t => t.constraints).filter(k => k.type === 'n').length,
  indexes: m.tables.reduce((n, t) => n + t.indexes.length, 0), triggers: m.triggers.length});
const report = {compared_objects: A.size, pglite: count(a), pg16: count(b), only_pglite: onlyPglite, only_pg16: onlyPg, different,
  identical: !onlyPglite.length && !onlyPg.length && !different.length};
await writeFile(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({compared_objects: report.compared_objects, pglite: report.pglite, pg16: report.pg16,
  only_pglite: onlyPglite.length, only_pg16: onlyPg.length, different: different.length, identical: report.identical}));
