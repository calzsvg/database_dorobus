const cards=[...document.querySelectorAll('.table-card')];
const searchText=new Map(cards.map(c=>[c,(c.dataset.search+' '+c.textContent).toLowerCase()]));
function filterTables(){const q=document.querySelector('#search').value.trim().toLowerCase(),g=document.querySelector('#group').value;let n=0;cards.forEach(c=>{const ok=searchText.get(c).includes(q)&&(!g||c.dataset.group===g);c.classList.toggle('hidden',!ok);if(ok)n++});document.querySelector('#count').textContent=n+' / '+cards.length+'개 테이블'}
document.querySelector('#search').addEventListener('input',filterTables);
document.querySelector('#group').addEventListener('change',filterTables);
document.querySelector('#expand').onclick=()=>cards.filter(c=>!c.classList.contains('hidden')).forEach(c=>c.open=true);
document.querySelector('#collapse').onclick=()=>cards.forEach(c=>c.open=false);
const chart=document.querySelector('#erd-view svg');
document.querySelector('#fit').onclick=()=>chart.style.width='100%';
document.querySelector('#actual').onclick=()=>chart.style.width='2300px';
document.querySelector('#zoom').oninput=e=>chart.style.width=(2300*Number(e.target.value)/100)+'px';
document.querySelectorAll('#erd-view .entity').forEach(el=>{function select(){const name=el.dataset.table;document.querySelectorAll('#erd-view .entity').forEach(n=>n.classList.toggle('active',n===el));document.querySelectorAll('#erd-view .edge').forEach(n=>n.classList.toggle('active',n.dataset.from===name||n.dataset.to===name));document.querySelector('#selection').textContent=name+' 관련 FK 강조'}el.onclick=select;el.onkeydown=e=>{if(e.key==='Enter')select()}});
document.querySelectorAll('a[href^="#table-"]').forEach(a=>a.addEventListener('click',()=>{const t=document.querySelector(a.getAttribute('href'));if(t){document.querySelector('#search').value='';document.querySelector('#group').value='';filterTables();t.open=true}}));
