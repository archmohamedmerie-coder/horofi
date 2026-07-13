/*
  تصدير كل كلمات التمارين منظّمة (حرف/مستوى/موضع) مع تشكيلها وجملتها،
  لتسهيل المراجعة اللغوية ورصد الكلمات الشاذة غير المطروقة.
  الاستخدام: node scripts/dump_words.js
*/
const fs=require('fs'), path=require('path');
const HTML=path.join(__dirname,'..','horofi-v11-9-29.html');
const lines=fs.readFileSync(HTML,'utf8').split('\n');

// جمل — نكتشف حدود القسم ديناميكياً بدل رقم سطر ثابت
let sent={};
{
  const wsStart = lines.findIndex(l => l.includes('const WORD_SENTENCES'));
  let wsEnd = lines.length;
  for (let i = wsStart; i < lines.length; i++) { if (lines[i].trim() === '};') { wsEnd = i; break; } }
  for(let i=wsStart;i<wsEnd;i++){const m=lines[i]&&lines[i].match(/^\s*"([^"]+)"\s*:\s*"([^"]+)"/); if(m) sent[m[1]]=m[2];}
}

function ex(v){const i=lines.findIndex(l=>l.includes('const '+v+' ='));const line=lines[i];return JSON.parse(line.slice(line.indexOf('['),line.lastIndexOf(']')+1));}
const C=ex('CONNECTING_LETTERS');
const NC=ex('NONCONNECTING_LETTERS');
function vz(w,D){return Array.from(w).map((c,i)=>c+((D&&D[i])||'')).join('');}

const CATLBL={start:'بداية',mid_c:'وسط-متصل',mid_n:'وسط-منفصل',end_c:'نهاية-متصل',end_n:'نهاية-منفصل'};
let out=[];
for(const L of C){
  out.push(`\n===== حرف ${L.char} (${L.name}) =====`);
  for(const lvl of ['beginner','intermediate','advanced']){
    const LD=L.levels&&L.levels[lvl]; if(!LD) continue;
    out.push(`  --- ${lvl} ---`);
    for(const cat of ['start','mid_c','mid_n','end_c','end_n']){
      const ws=LD[cat]||[], D=LD[cat+'D']||[];
      ws.forEach((w,i)=>{ out.push(`    ${CATLBL[cat].padEnd(11,' ')} ${vz(w,D[i])}   (${w})`); });
    }
  }
}
for(const L of NC){
  out.push(`\n===== حرف ${L.char} (${L.name}) — غير متصل =====`);
  (L.words||[]).forEach(w=>{ if(w.letters) out.push(`    ${w.test||'—'}   ${vz(w.letters.join(''),w.diac)}   (${w.letters.join('')})`); });
}
fs.writeFileSync(path.join(__dirname,'all_words_dump.txt'),out.join('\n'),'utf8');
console.log('تم التصدير:', out.length, 'سطر → scripts/all_words_dump.txt');
