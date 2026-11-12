import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
export const read=path=>readFile(resolve(root,path),'utf8');
export async function database({extensions=true}={}){
 const module=process.env.PGLITE_MODULE?pathToFileURL(resolve(process.env.PGLITE_MODULE)).href:'@electric-sql/pglite';
 const {PGlite}=await import(module);const notices=[];
 const db=new PGlite({onNotice:n=>notices.push(n.message)});
 for(const file of ['001_core','002_repair','003_license','004_license_issuer','005_runtime_permissions',...(extensions?['007_user_birth_date']:[])])await db.exec(await read('sql/'+file+'.sql'));
 await db.exec(await read('examples/001_content.sql'));
 // PGlite의 단일 연결을 공유하는 시험 어댑터. 실제 다중 연결 동시성 검증을 대체하지 않는다.
 let tail=Promise.resolve();
 const pool={async connect(){let release;const gate=new Promise(r=>release=r),previous=tail;tail=gate;await previous;
  return {async query(sql,args){const result=await db.query(sql,args);if(sql==='BEGIN')await db.exec('SET LOCAL ROLE dorobus_app_runtime');return result;},release};
 }};
 return {db,pool,notices};
}
export async function metadata(db){
 const tables=(await db.query(`SELECT c.relname name,obj_description(c.oid) description FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='dorobus' AND c.relkind='r' ORDER BY c.relname`)).rows;
 for(const t of tables){
  t.columns=(await db.query(`SELECT a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull not_null,a.attgenerated generated,pg_get_expr(d.adbin,d.adrelid) default_value,col_description(a.attrelid,a.attnum) description FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='dorobus' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[t.name])).rows;
  t.constraints=(await db.query(`SELECT co.conname name,co.contype type,pg_get_constraintdef(co.oid) definition,foreign_table.relname target_table,ARRAY(SELECT attname FROM unnest(co.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=co.conrelid AND a.attnum=k.num ORDER BY ord) columns,ARRAY(SELECT attname FROM unnest(co.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=co.confrelid AND a.attnum=k.num ORDER BY ord) target_columns FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_class foreign_table ON foreign_table.oid=co.confrelid WHERE n.nspname='dorobus' AND c.relname=$1 ORDER BY co.contype,co.conname`,[t.name])).rows;
  t.indexes=(await db.query('SELECT indexname name,indexdef definition FROM pg_indexes WHERE schemaname=\'dorobus\' AND tablename=$1 ORDER BY indexname',[t.name])).rows;
 }
 const triggers=(await db.query(`SELECT t.tgname name,c.relname table_name,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='dorobus' AND NOT t.tgisinternal ORDER BY t.tgname`)).rows;
 return {tables,triggers,table_count:tables.length,column_count:tables.reduce((n,t)=>n+t.columns.length,0)};
}
