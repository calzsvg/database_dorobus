// 별도 Playwright/Chromium 환경에서 실행. DB 시험과 분리된 오프라인 문서 화면 검사.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const report={generated_at:new Date().toISOString(),mode:'file:// offline',checks:[],external_requests:[],console_errors:[]};
const hash=async p=>createHash('sha256').update(await readFile(resolve(root,p))).digest('hex');
report.input_hashes=Object.fromEntries(await Promise.all(['상세설명.html','index.html','erd/full-erd.svg','erd/progression.svg'].map(async f=>[f,await hash(f)])));
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
report.browser_version=browser.version();
const context=await browser.newContext({viewport:{width:1440,height:1000},offline:true});
const page=await context.newPage();
page.on('request',r=>{if(/^https?:/.test(r.url()))report.external_requests.push(r.url());});
page.on('pageerror',e=>report.console_errors.push(e.message));
const check=async(name,fn)=>{await fn();report.checks.push({name,pass:true});};
const screenshot=async name=>page.screenshot({path:resolve(root,'qa',name),animations:'disabled'});
const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
try{
 await check('네트워크 오프라인에서 index → 상세설명 리다이렉트와 28개 명세 표시',async()=>{
  await page.goto(pathToFileURL(resolve(root,'index.html')).href);await page.waitForURL(/%EC%83%81|상세설명/);
  assert.equal(await page.locator('.table-card').count(),28);assert.match(await page.title(),/v3/);
  assert.equal(await page.locator('.stat').nth(1).locator('b').innerText(),'206');
  await noOverflow();await screenshot('desktop.png');
 });
 await check('변경 수치와 보장 범위 화면 표시',async()=>{
  await page.locator('#changes').scrollIntoViewIfNeeded();assert.match(await page.locator('#changes').innerText(),/361[\s\S]*359/);
  await screenshot('changes-desktop.png');
 });
 await check('제약 이름 검색·펼치기·접기 동작',async()=>{
  await page.locator('#search').fill('completion_repair_source_required');
  assert.equal(await page.locator('.table-card:not(.hidden)').count(),1);
  assert.equal(await page.locator('.table-card:not(.hidden)').getAttribute('id'),'table-content_completions');
  await page.locator('#expand').click();assert.equal(await page.locator('#table-content_completions').evaluate(e=>e.open),true);
  await page.locator('#table-content_completions').scrollIntoViewIfNeeded();await screenshot('table-detail.png');
  await page.locator('#collapse').click();assert.equal(await page.locator('.table-card[open]').count(),0);
  await page.locator('#search').fill('content_kind');assert(await page.locator('.table-card:not(.hidden)').count()>=2);
  await page.locator('#group').selectOption('records');assert.equal(await page.locator('.table-card:not(.hidden)').count(),1);
 });
 await check('테이블 바로가기 클릭 시 검색 초기화·대상 펼치기',async()=>{
  await page.locator('a[href="#table-driving_licenses"]').click();assert.equal(await page.locator('#search').inputValue(),'');
  assert.equal(await page.locator('#group').inputValue(),'');assert.equal(await page.locator('#table-driving_licenses').evaluate(e=>e.open),true);
 });
 await check('ERD 확대·키보드 관계 강조·화면 맞춤',async()=>{
  await page.locator('#actual').click();assert.equal(await page.locator('#erd-view svg').evaluate(e=>e.style.width),'2300px');
  const entity=page.locator('#erd-view .entity[data-table="content_completions"]');await entity.focus();await entity.press('Enter');
  assert(await page.locator('#erd-view .edge.active').count()>0);
  await page.locator('#zoom').focus();await page.locator('#zoom').press('End');
  assert.equal(await page.locator('#erd-view svg').evaluate(e=>e.style.width),'3450px');
  await page.locator('#fit').click();assert.equal(await page.locator('#erd-view svg').evaluate(e=>e.style.width),'100%');
  await page.locator('#erd').scrollIntoViewIfNeeded();await screenshot('erd-desktop.png');await noOverflow();
 });
 await check('상대 파일 링크 전부 존재하며 오프라인 브라우저로 열림',async()=>{
  const links=await page.locator('a[href]').evaluateAll(es=>[...new Set(es.map(e=>e.getAttribute('href')).filter(x=>!x.startsWith('#')&&!/^(https?:|data:)/.test(x)))]);
  const linkPage=await context.newPage();report.local_links=[];
  for(const link of links){
   const filename=decodeURIComponent(link.split('#')[0]);await access(resolve(root,filename));
   try{await linkPage.goto(pathToFileURL(resolve(root,filename)).href);report.local_links.push({file:link,status:'opened'});}
   catch(e){
    // 일부 MIME(예: mmd)은 브라우저가 다운로드로 처리한다. 존재+파일 바이트 검사와 구분해 기록.
    if(!/download|ERR_ABORTED/i.test(e.message))throw e;
    assert((await readFile(resolve(root,filename))).length>0);report.local_links.push({file:link,status:'download; file bytes checked'});
   }
  }
  await linkPage.close();
 });
 await check('390×844 모바일 표시·가로 본문 넘침 없음·검색 동작',async()=>{
  await page.setViewportSize({width:390,height:844});await page.goto(pathToFileURL(resolve(root,'상세설명.html')).href);
  await noOverflow();await screenshot('mobile.png');await page.locator('#search').fill('completion_must_be_finished_fk');
  assert.equal(await page.locator('.table-card:not(.hidden)').count(),1);await page.locator('#expand').click();await noOverflow();
  await page.locator('#table-content_completions').scrollIntoViewIfNeeded();await screenshot('mobile-detail.png');
 });
 await check('외부 네트워크 요청·페이지 JavaScript 오류 없음',()=>{assert.deepEqual(report.external_requests,[]);assert.deepEqual(report.console_errors,[]);});
 report.passed=report.checks.length;report.failed=0;
}catch(e){report.failed=1;report.error=e.message;throw e;}
finally{await writeFile(resolve(root,'qa/browser-audit.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,failed:report.failed,local_links:report.local_links.length,browser:report.browser_version}));
