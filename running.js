/* Fuel Log running module: all prescriptions remain local until an integration exists. */
(() => {
'use strict';
const $=id=>document.getElementById(id), MI=1609.344;
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=()=>crypto.randomUUID();
const dateAdd=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const monday=d=>dateAdd(d,-((new Date(d+'T12:00:00').getDay()+6)%7));
const pace=s=>{if(!/^\d{1,2}:[0-5]\d$/.test(s))throw Error('Use pace as m:ss, such as 8:30');return Number(s.split(':')[0])*60+Number(s.split(':')[1])};
const fmt=s=>Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0');
const distance=s=>s.unit==='mi'?s.amount:s.unit==='m'?s.amount/MI:0;
const total=w=>(w.steps||[]).reduce((a,s)=>a+distance(s)*s.repeat,0);
function validate(w){
 if(typeof w.title!=='string'||!w.title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(w.date))throw Error('Add a title and date');
 if(!Array.isArray(w.steps)||!w.steps.length)throw Error('Add at least one step');
 w.steps.forEach(s=>{if(!['mi','m','min','sec'].includes(s.unit)||!['easy','open','target','cap','range'].includes(s.target))throw Error('Unsupported step');if(!Number.isFinite(s.amount)||s.amount<=0||!Number.isInteger(s.repeat)||s.repeat<1||s.repeat>50||!Number.isFinite(s.rest)||s.rest<0)throw Error('Steps need positive amounts, 1–50 repeats, and nonnegative recovery');if(['target','cap','range'].includes(s.target)){pace(s.pace);if(s.target==='range'&&pace(s.slow)<pace(s.pace))throw Error('Range must go from faster to slower pace');}});
 return w;
}
const R=()=>state.running;
state.schemaVersion=7;
state.running=state.running||{version:1,raceDate:'2027-01-31',workouts:[],viewDate:todayKey()};
let week=monday(R().viewDate||todayKey()), undo=null, selected=null, drag=null, treadmill=false;
const panel=document.createElement('div'); panel.className='panel';panel.id='p-run';$('p-lift').before(panel);
const nav=document.createElement('button');nav.className='nb';nav.id='n-run';nav.innerHTML='<span class="ic">🏃</span>RUN';nav.onclick=()=>tab('run');$('n-lift').before(nav);
const originalTab=tab;tab=function(t){if(t==='run'){['today','history','goals','lift'].forEach(x=>{$('p-'+x).classList.remove('on');$('n-'+x).classList.remove('on')});$('scroll').scrollTop=0;draw()}else originalTab(t);panel.classList.toggle('on',t==='run');nav.classList.toggle('on',t==='run')};
function persist(){save();draw();render()}
function commitActivity(fn){const before=clone(state);try{fn();localStorage.setItem(KEY,JSON.stringify(state));undo=null;draw();render();return true}catch(e){state=before;toast('Could not save. Change rolled back.');return false}}
function mutate(fn){const prior=clone(R());fn();try{localStorage.setItem(KEY,JSON.stringify(state));undo=prior;draw();render()}catch(e){state.running=prior;toast('Could not save. Your change was rolled back.')}}
const oldDelete=delWorkout;delWorkout=function(i){const a=day(curDate).workouts[i];if(a?.plannedWorkoutId){const w=R().workouts.find(x=>x.id===a.plannedWorkoutId);if(w){w.status='planned';delete w.activityId;undo=null}}oldDelete(i);draw()};
const baseKind=kindOf, baseMiles=milesToday, baseEff=effGoals;
const active=d=>R().workouts.filter(w=>w.date===d&&!['completed','skipped'].includes(w.status));
kindOf=function(d){const ws=active(d);return ws.some(w=>['tempo','interval'].includes(w.kind))?'quality':ws.some(w=>w.kind==='long')?'long':baseKind(d)};
milesToday=function(d){const logged=(day(d).workouts||[]).some(w=>w.type==='run');return logged?baseMiles(d):active(d).filter(w=>w.kind!=='strength').reduce((a,w)=>a+total(w),0)||baseMiles(d)};
effGoals=function(d){const ws=active(d).filter(w=>w.kind!=='strength');if(!ws.length||totals(d).burned>0)return baseEff(d);const g=state.goals;if(!g.adapt)return baseEff(d);const k=KIND[kindOf(d)],extra=Math.round(runBurn(ws.reduce((a,w)=>a+total(w),0),'run')*k.epoc);return {...g,cal:g.cal+extra,carbs:g.carbs+Math.round(extra*k.carb/4),fat:g.fat+Math.round(extra*(1-k.carb)/9),extra,src:'planned',kind:k.label}};
function button(label,fn,cls=''){const b=document.createElement('button');b.textContent=label;b.className=cls;b.onclick=fn;return b}
function heading(el,text,tag='h3'){const h=document.createElement(tag);h.textContent=text;el.append(h);return h}
function actual(d){return day(d).workouts.filter(w=>w.type==='run').reduce((a,w)=>a+(Number.isFinite(w.distanceMi)?w.distanceMi:Number((/([\d.]+)\s*mi/.exec(w.desc||'')||[])[1])||0),0)}
function draw(){
 panel.replaceChildren();const top=document.createElement('div');top.className='run-hero';panel.append(top);
 heading(top,'YOUR ROAD TO 26.2','h2');const days=Math.round((new Date(R().raceDate+'T12:00:00')-new Date(todayKey()+'T12:00:00'))/86400000);heading(top,`${R().raceDate} · ${days>=0?days+' days to go':'Race date passed'}`,'p');
 const toolbar=document.createElement('div');toolbar.className='run-tools';top.append(toolbar);
 toolbar.append(button('＋ Workout',()=>edit()),button('Race date',()=>{const d=prompt('Marathon date (YYYY-MM-DD)',R().raceDate);if(d&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(new Date(d)))mutate(()=>R().raceDate=d)}),button('Undo',()=>{if(undo){state.running=undo;undo=null;persist()}}));
 toolbar.append(button('Load screenshot examples',seed));
 const note=document.createElement('p');note.className='run-muted';note.textContent='Saved on this device · Garmin not connected. Drag by the handle, or use Move / Swap. Examples are prescriptions, not completed runs.';top.append(note);
 const bar=document.createElement('div');bar.className='run-tools';panel.append(bar);bar.append(button('← Week',()=>{week=dateAdd(week,-7);draw()}),button('Today',()=>{week=monday(todayKey());draw()}),button('Week →',()=>{week=dateAdd(week,7);draw()}));
 const jump=document.createElement('input');jump.type='date';jump.value=week;jump.onchange=()=>{if(jump.value){week=monday(jump.value);draw()}};bar.append(jump);
 let planned=0,done=0;for(let i=0;i<7;i++){const d=dateAdd(week,i);planned+=R().workouts.filter(w=>w.date===d&&w.kind!=='strength'&&w.status!=='skipped').reduce((a,w)=>a+total(w),0);done+=actual(d)}
 heading(panel,`${week} — ${dateAdd(week,6)}`);heading(panel,`${planned.toFixed(1)} mi planned · ${done.toFixed(1)} mi logged`,'p');
 for(let i=0;i<14;i++){
  if(i===7){const start=dateAdd(week,7);let p=0,a=0;for(let j=7;j<14;j++){const k=dateAdd(week,j);p+=R().workouts.filter(w=>w.date===k&&w.kind!=='strength'&&w.status!=='skipped').reduce((n,w)=>n+total(w),0);a+=actual(k)}heading(panel,`${start} — ${dateAdd(week,13)}`);heading(panel,`${p.toFixed(1)} mi planned · ${a.toFixed(1)} mi logged`,'p')}
  const d=dateAdd(week,i), row=document.createElement('section');row.className='run-day'+(d===todayKey()?' is-today':'');row.dataset.date=d;
  row.ondragover=e=>e.preventDefault();row.ondrop=e=>{e.preventDefault();if(drag)moveDialog(drag,d);drag=null};
  heading(row,new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}));
  R().workouts.filter(w=>w.date===d).forEach(w=>{
   const card=document.createElement('article');card.className='run-card '+w.kind;card.dataset.id=w.id;
   const handle=button('⠿',()=>{},'run-handle');handle.title='Drag workout';handle.draggable=!['completed'].includes(w.status);handle.ondragstart=e=>{drag=w.id;e.dataTransfer.setData('text/plain',w.id)};
   let timer=null,moving=false;handle.onpointerdown=e=>{if(e.pointerType==='mouse'||w.status==='completed')return;timer=setTimeout(()=>{moving=true;drag=w.id;handle.setPointerCapture(e.pointerId);card.classList.add('dragging')},220)};
   handle.onpointermove=e=>{if(!moving)return;e.preventDefault();const sc=$('scroll'),r=sc.getBoundingClientRect();if(e.clientY>r.bottom-70)sc.scrollTop+=16;if(e.clientY<r.top+70)sc.scrollTop-=16};
   handle.onpointerup=e=>{clearTimeout(timer);if(moving){moving=false;card.classList.remove('dragging');const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-date]');if(target)moveDialog(w.id,target.dataset.date);drag=null}};handle.onpointercancel=()=>{clearTimeout(timer);moving=false;drag=null;card.classList.remove('dragging')};
   card.append(handle);heading(card,w.title);heading(card,`${w.kind==='strength'?'Strength':total(w).toFixed(2)+' mi'} · ${w.status||'planned'}${w.summaryOnly?' · Details needed':''}`,'p');
   card.append(button('Details',()=>detail(w.id)),button('Move / Swap',()=>moveDialog(w.id)),button('Edit',()=>edit(w.id)));row.append(card);
  });
  row.append(button('＋ Add',()=>edit(null,d)));const g=effGoals(d);heading(row,`Nutrition target: ${g.cal} kcal · ${g.carbs}g carbs${g.src?' · '+g.src:''}`,'small');panel.append(row);
 }
 const hard=R().workouts.filter(w=>['interval','tempo','long','strength'].includes(w.kind)&&w.status!=='skipped').sort((a,b)=>a.date.localeCompare(b.date));const warnings=[];for(let i=1;i<hard.length;i++){if(hard[i].date>=week&&hard[i].date<=dateAdd(week,13)&&hard[i].date<=dateAdd(hard[i-1].date,1))warnings.push(`${hard[i-1].title} and ${hard[i].title} are on the same or consecutive days.`)}if(warnings.length){const box=document.createElement('aside');box.className='run-warning';heading(box,'Schedule review');warnings.forEach(w=>heading(box,w,'p'));panel.append(box)}
}
const dlg=document.createElement('dialog');dlg.className='run-dialog';document.body.append(dlg);
function modal(title){dlg.replaceChildren();dlg.append(button('Close',()=>dlg.close(),'run-close'));heading(dlg,title,'h2');if(!dlg.open)dlg.showModal();return dlg}
function field(parent,label,type,value){const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.setAttribute('aria-label',label);input.type=type;input.value=value??'';l.append(input);parent.append(l);return input}
function select(parent,label,options,value){const l=document.createElement('label');l.textContent=label;const input=document.createElement('select');input.setAttribute('aria-label',label);for(const [v,t]of options){const o=document.createElement('option');o.value=v;o.textContent=t;input.append(o)}input.value=value;l.append(input);parent.append(l);return input}
function moveDialog(id,d){const w=R().workouts.find(w=>w.id===id);if(!w)return;if(w.status==='completed'){toast('Completed sessions keep their date');return}const m=modal('Move or swap');const date=field(m,'Destination','date',d||w.date);const choices=document.createElement('div');m.append(choices);function refresh(){choices.replaceChildren();const others=R().workouts.filter(x=>x.date===date.value&&x.id!==id&&x.status!=='completed');choices.append(button('Move here / stack',()=>apply(null)));others.forEach(x=>choices.append(button('Swap with '+x.title,()=>apply(x.id))))}function apply(other){if(!date.value)return;mutate(()=>{if(other)R().workouts.find(x=>x.id===other).date=w.date;w.date=date.value;w.revision=(w.revision||1)+1});dlg.close()}date.onchange=refresh;refresh()}
function detail(id){const w=R().workouts.find(w=>w.id===id),m=modal(w.title);heading(m,`${w.date} · ${total(w).toFixed(2)} mi`,'p');if(w.source)heading(m,w.source,'small');m.append(button(treadmill?'Show outdoor pace':'Show treadmill mph',()=>{treadmill=!treadmill;detail(id)}));if(w.summaryOnly)heading(m,'Only calendar mileage was supplied. Add the workout prescription before using it as a structured session.','p');
 w.steps.forEach(s=>{const box=document.createElement('div');box.className='run-step';let target=s.target==='easy'?'Conversational':s.target==='open'?'No target':s.target==='cap'?'No faster than ':'';if(['cap','target','range'].includes(s.target)){const val=treadmill?(3600/pace(s.pace)).toFixed(1)+' mph':s.pace+'/mi';target+=val;if(s.target==='range')target+=' to '+(treadmill?(3600/pace(s.slow)).toFixed(1)+' mph':s.slow+'/mi')}heading(box,`${s.repeat>1?s.repeat+' × ':''}${s.label} · ${s.amount} ${s.unit}`);heading(box,target,'p');if(s.rest)heading(box,`After each: ${s.rest}s ${s.restMode} recovery`,'p');m.append(box)});
 if(w.status!=='completed'){m.append(button(w.kind==='strength'?'Log completed lift':'Log completed run',()=>complete(id)),button(w.kind==='strength'?'Link existing lift':'Link existing run',()=>link(id)),button(w.status==='skipped'?'Restore planned':'Skip workout',()=>{mutate(()=>w.status=w.status==='skipped'?'planned':'skipped');dlg.close()}))}
 m.append(button('Delete prescription',()=>{if(confirm('Delete this prescription? Completed activity data is retained.')){mutate(()=>R().workouts=R().workouts.filter(x=>x.id!==id));dlg.close()}}));
}
function link(id){const w=R().workouts.find(x=>x.id===id),m=modal('Link an existing run');let count=0;Object.entries(state.days).sort().reverse().forEach(([d,data])=>(data.workouts||[]).forEach((a,i)=>{if(a.type!==(w.kind==='strength'?'lift':'run')||a.plannedWorkoutId)return;count++;m.append(button(d+' · '+a.desc,()=>{if(commitActivity(()=>{a.id=a.id||uid();a.plannedWorkoutId=id;w.activityId=a.id;w.status='completed'}))dlg.close()}))}));if(!count)heading(m,'No unlinked activities available.','p')}
function complete(id){const w=R().workouts.find(x=>x.id===id),m=modal('Record actual results');const strength=w.kind==='strength';const d=field(m,'Actual date','date',w.date),mi=field(m,'Actual miles (runs only)','number',strength?0:total(w).toFixed(2)),mins=field(m,'Moving minutes','number',''),cal=field(m,'Calories (optional)','number','');m.append(button('Save completed run',()=>{if(!d.value||(!strength&&+mi.value<=0)||+mins.value<=0){toast('Enter date, positive miles and minutes');return}if(d.value>todayKey()){toast('Completed runs cannot be in the future');return}if(R().workouts.find(x=>x.id===id).status==='completed')return;const a={id:uid(),plannedWorkoutId:id,type:strength?'lift':'run',desc:strength?`${Number(mins.value)} min · ${w.title}`:`${Number(mi.value)} mi · ${w.title}`,distanceMi:strength?0:+mi.value,mins:+mins.value,cal:Math.max(0,+cal.value||(strength?liftBurn(+mins.value):runBurn(+mi.value,'run')))};if(commitActivity(()=>{day(d.value).workouts.push(a);w.status='completed';w.activityId=a.id}))dlg.close()}))}
function edit(id,date){const existing=R().workouts.find(w=>w.id===id);if(existing?.status==='completed'){toast('Completed prescriptions are locked');return}const w=clone(existing||{id:uid(),title:'',date:date||todayKey(),kind:'easy',status:'planned',steps:[]});const m=modal(existing?'Edit workout':'New workout'),title=field(m,'Workout title','text',w.title),dt=field(m,'Scheduled date','date',w.date),kind=select(m,'Workout type',[['easy','Easy'],['long','Long'],['tempo','Tempo'],['interval','Intervals'],['strength','Strength']],w.kind);const list=document.createElement('div');m.append(list);let readers=[];
 function steps(){list.replaceChildren();readers=[];w.steps.forEach((s,i)=>{const box=document.createElement('div');box.className='run-step';list.append(box);const label=field(box,'Step label','text',s.label),amount=field(box,'Amount','number',s.amount),unit=select(box,'Unit',[['mi','Miles'],['m','Meters'],['min','Minutes'],['sec','Seconds']],s.unit),repeat=field(box,'Repeat count','number',s.repeat),target=select(box,'Target',[['easy','Conversational'],['open','No target'],['target','Target pace'],['cap','No faster than'],['range','Pace range']],s.target),p=field(box,'Pace / fast end (m:ss per mile)','text',s.pace),slow=field(box,'Slow end for range','text',s.slow),rest=field(box,'Recovery after each repeat (seconds)','number',s.rest),restMode=select(box,'Recovery type',[['walk','Walk'],['jog','Jog'],['rest','Rest']],s.restMode);readers.push(()=>({label:label.value,amount:+amount.value,unit:unit.value,repeat:+repeat.value,target:target.value,pace:p.value,slow:slow.value,rest:+rest.value,restMode:restMode.value}));box.append(button('↑',()=>{collect();if(i){[w.steps[i-1],w.steps[i]]=[w.steps[i],w.steps[i-1]];steps()}}),button('Remove',()=>{collect();w.steps.splice(i,1);steps()}))})}
 function collect(){w.steps=readers.map(r=>r())}steps();m.append(button('＋ Step / repeat block',()=>{collect();w.steps.push(step('Run',1,'mi'));steps()}),button('Save workout',()=>{try{collect();Object.assign(w,{title:title.value,date:dt.value,kind:kind.value,summaryOnly:false,revision:(w.revision||0)+1});validate(w);mutate(()=>{const i=R().workouts.findIndex(x=>x.id===w.id);if(i<0)R().workouts.push(w);else R().workouts[i]=w});dlg.close()}catch(e){toast(e.message)}}));
}
function step(label,amount,unit='mi',target='easy',p='',repeat=1,rest=0,slow=''){return {label,amount,unit,target,pace:p,slow,repeat,rest,restMode:'walk'}}
function seed(){if(!confirm('Add the supplied Oct 12–Nov 8 calendar examples? Existing examples will not be added twice.'))return;
 const detailed={
 '2026-10-26':[step('Warmup',1,'mi','cap','8:15'),step('Steady',1,'mi','target','7:35'),step('Tempo',1,'mi','target','6:55',1,90),step('Cooldown',.75)],
 '2026-10-28':[step('Warmup',1,'mi','cap','8:15',1,90),step('Longer reps',.25,'mi','target','6:05',6,90),step('Shorter reps',.12,'mi','target','5:45',5,90),step('Cooldown',.5)],
 '2026-11-02':[step('Warmup',1.5,'mi','cap','8:15'),step('Tempo',2,'mi','range','6:35',2,150,'7:05'),step('Cooldown',1)],
 '2026-11-04':[step('Warmup',1.5,'mi','cap','8:15',1,90),...[[.12,'5:35',60],[.25,'5:45',90],[.5,'6:10',90],[.75,'6:25',120],[.5,'6:10',90],[.25,'5:45',90],[.12,'5:35',60]].map(([d,p,r])=>step('Rep',d,'mi','target',p,1,r)),step('Cooldown',.9)],
 '2026-11-07':[step('Easy start',5),step('Progression',3,'mi','target','7:45'),step('Progression',3,'mi','target','7:20'),step('Finish',3,'mi','target','7:00')]};
 const weeks=[['2026-10-12',[[5,'easy','Easy Run'],[5.5,'tempo','Tempo 2-1'],[4.5,'easy','Easy Run'],[5.5,'interval','K200s'],[0,'strength','Stretch & Stability'],[4.5,'easy','Easy Run'],[12,'long','Long Run']]],['2026-10-19',[[5.5,'tempo','Tempo 2.5mi'],[5,'easy','Easy Run'],[5,'interval','800m Repeats'],[5,'easy','Easy Run'],[4,'easy','Easy Run'],[13.1,'long','Half Marathon Long Run'],[0,'strength','Stretch & Stability']]],['2026-10-26',[[3.8,'tempo','Steady into Tempo'],[4.5,'easy','Easy Run'],[3.6,'interval','400s into 200s'],null,[5,'easy','Easy Run'],[6.5,'long','Long Run'],[0,'strength','Stretch & Stability']]],['2026-11-02',[[6.5,'tempo','Tempo 2 Miles'],[6,'easy','Easy Run'],[4.9,'interval','Pyramid Intervals'],[4.5,'easy','Easy Run'],[3.75,'easy','Easy Run'],[14,'long','Progressive Long Run'],[0,'strength','Stretch & Stability']]]];
 mutate(()=>{weeks.forEach(([start,items])=>items.forEach((v,i)=>{if(!v)return;const d=dateAdd(start,i),id='reference-'+d;if(R().workouts.some(w=>w.id===id))return;R().workouts.push({id,date:d,title:v[2],kind:v[1],status:'planned',revision:1,summaryOnly:!detailed[d],source:'User screenshots; distances as displayed',steps:detailed[d]||[step(v[1]==='strength'?'Mobility':'Calendar distance',v[1]==='strength'?25:v[0],v[1]==='strength'?'min':'mi')]})}))});week='2026-10-12';draw();
}
window.RunningTest={validate,total,pace,dateAdd,monday};
draw();render();
})();

