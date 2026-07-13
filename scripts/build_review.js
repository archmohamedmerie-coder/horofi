/*
  يبني لوحة مراجعة تفاعلية (review_words.html) لكل كلمات التمارين:
  - مجمّعة حسب الحرف المقصود ← المستوى ← الموضع
  - كل سطر: مربع اختيار + الحرف المقصود (مُبرَز) + الكلمة مُشكَّلة (الحرف المقصود ملوّن) + الجملة
  - الكلمات التي أرصدها شاذّة مؤشَّرة مسبقاً ومظلَّلة
  - أزرار: عرض الشاذ فقط / بحث / تصدير الاختيار
  الاستخدام: node scripts/build_review.js  → ثم افتح review_words.html
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
const C=ex('CONNECTING_LETTERS'), NC=ex('NONCONNECTING_LETTERS');
function vz(w,D){return Array.from(w).map((c,i)=>c+((D&&D[i])||'')).join('');}

// ── قائمة الكلمات الشاذة التي أرصدها (اقتراح مبدئي — قابل للتعديل من اللوحة) ──
const FLAG = new Set(("مشارب وتد وتين رتيب وتيرة سمت وترية رتيبة أتراب نعت مقت ملكوت تنانير "+
"دثر رثة نكث نثار وثاق دثار رثاء نفث وراث أثير رثاثة دثور تبعث منبعث حثيث "+
"زجل دجل سمج سميج جبروت فجور ازدواج امتزاج انزعاج "+
"نضح وحشية "+
"ذخر زخم فلخ سلخ وخيم مسخ فسخ فارخ تنسخ تمسخ تسلخ وخامة رخاوة "+
"رسن وسم حدس نحس وساد تأسس ترأس تهرس "+
"دشت رشف رفش جحش نفش وشوش وشوشة توحش تفحش "+
"وصم تلصص تمصمص ترخص تراص تملص وصوصة انتقاص "+
"تربض تشبض تراقض استعاض وضاءة وضاعة "+
"وطس سرط وطيس تلبط رطانة وطأة "+
"نفظ غلظ شواظ لحاظ ألحاظ ظليم تغلظ إيعاظ توعظ تواعظ استغلاظ استحفاظ استيعاظ وظاهر وظيفية "+
"وعل وعك يراع وزاع رعاشة وعورة "+
"سغب بغى وغر رغد وغل نبغ ثلغ فلغ راغ نزغ وغول تصبغ اندمغ ابتلغ انطبغ انصبغ استصبغ وغرة صياغ "+
"رفث ذفر نقف زرف إتراف "+
"زوق نقيصة "+
"وكز ركاز نهك "+
"جرل أزل ولج ألق "+
"صلم ثلم أدم زمر لثم تمدين تشميل وميضات "+
"ودن ونى إمعان رنانة "+
"فره رهف سفه زهاد رهافة وهدة زهدية استنبه استفقه مشهدية "+
"وري أيامية دواري ماضوي").split(/\s+/).filter(Boolean));

const CATLBL={start:'بداية',mid_c:'وسط (بعد متصل)',mid_n:'وسط (بعد منفصل)',end_c:'نهاية (بعد متصل)',end_n:'نهاية (بعد منفصل)'};
const MARKS='ًٌٍَُِّْ';
const SHADDA='ّ';
// استخراج تشكيل الكلمة من داخل الجملة (بمطابقة الحروف المجرّدة)
function fromSentence(bare, s){
  if(!s) return null;
  const chars=[...s]; let bareSeq=[], units=[]; let i=0;
  while(i<chars.length){ const c=chars[i]; if(MARKS.includes(c)){i++;continue;} let u=c,j=i+1; while(j<chars.length&&MARKS.includes(chars[j])){u+=chars[j];j++;} bareSeq.push(c); units.push(u); i=j; }
  const idx=bareSeq.join('').indexOf(bare);
  if(idx<0) return null;
  return units.slice(idx,idx+[...bare].length);
}
// الحركة الأساسية فقط (تجاهل الشدة) لكل خانة
function baseMark(u){ return [...(u||'')].filter(c=>c!==SHADDA).join(''); }
const SUKUN='ْ';
const MADD_LETTERS = new Set(['ا','و','ي','ى']);
// هل يختلف التشكيل الداخلي بين الشبكة والجملة؟ (تجاهل: آخر حرف، شدة أول حرف من «ال»،
// وسكون حرف المدّ الاختياري — فكلاهما (فراغ / سكون) على حرف مدّ يعنيان نفس النطق)
function tashkeelMismatch(word, D, s){
  const bare=[...word];
  const senUnits=fromSentence(word, s);
  if(!senUnits || senUnits.length!==bare.length) return {mismatch:false};
  const gridUnits=bare.map((c,i)=> c+((D&&D[i])||'') );
  for(let i=0;i<bare.length-1;i++){          // نتجاهل الحرف الأخير (فرق الإعراب مقصود)
    if(i===0) continue;                        // نتجاهل أول حرف (شدة «ال» الشمسية)
    let g=baseMark(D[i]||''), sMark=baseMark(senUnits[i].slice(1));
    // تجاهل فرق (فراغ ⇄ سكون) على حرف مدّ — تدوين مكافئ وليس خطأ
    if(MADD_LETTERS.has(bare[i]) && (g==='' || g===SUKUN) && (sMark==='' || sMark===SUKUN)) continue;
    if(g!==sMark) return {mismatch:true, grid:gridUnits.join(''), sen:senUnits.join('')};
  }
  return {mismatch:false};
}
// إبراز الحرف المقصود داخل الكلمة المشكَّلة
function hilite(vword, target){
  const chars=[...vword]; let out=''; let done=false;
  for(let i=0;i<chars.length;i++){
    if(!done && chars[i]===target){ let unit=chars[i]; let j=i+1; while(j<chars.length&&MARKS.includes(chars[j])){unit+=chars[j];j++;} out+=`<span class="tg">${unit}</span>`; i=j-1; done=true; }
    else out+=chars[i];
  }
  return out;
}

let rows=[];
function addRow(letter,name,lvl,cat,word,D,vword){
  const id=`${letter}|${lvl}|${cat}|${word}`;
  const flagged=FLAG.has(word);
  const s=sent[word]||'';
  const mm=tashkeelMismatch(word, D, s);
  rows.push({letter,name,lvl,cat,word,vword,s,flagged,id,mismatch:mm.mismatch,senForm:mm.sen||''});
}
for(const L of C){
  for(const lvl of ['beginner','intermediate','advanced']){
    const LD=L.levels&&L.levels[lvl]; if(!LD) continue;
    for(const cat of ['start','mid_c','mid_n','end_c','end_n']){
      const ws=LD[cat]||[], D=LD[cat+'D']||[];
      ws.forEach((w,i)=> addRow(L.char,L.name,lvl,cat,w,D[i]||[],vz(w,D[i])) );
    }
  }
}
for(const L of NC){
  (L.words||[]).forEach(w=>{ if(w.letters){ const bw=w.letters.join(''); addRow(L.char,L.name,'—',w.test||'—',bw,w.diac||[],vz(bw,w.diac)); } });
}

const LVLLBL={beginner:'مبتدئ',intermediate:'متوسط',advanced:'متقدم','—':'—'};
// بناء HTML
let body=`<div class="bar">
  <strong>لوحة مراجعة الكلمات</strong> — إجمالي ${rows.length} | شاذّة ${rows.filter(r=>r.flagged).length} | مختلفة التشكيل ${rows.filter(r=>r.mismatch).length}
  <label><input type="checkbox" id="onlyFlagged"> الشاذّ فقط</label>
  <label><input type="checkbox" id="onlyMismatch"> مختلف التشكيل فقط</label>
  <input type="text" id="search" placeholder="بحث عن كلمة...">
  <button id="checkVisible">✔ تحديد كل الظاهر</button>
  <button id="exportBtn">📤 تصدير المحدَّد</button>
</div>
<textarea id="out" placeholder="سيظهر هنا اختيارك بصيغة JSON بعد الضغط على تصدير — انسخه وأرسله لي"></textarea>`;

let cur='';
for(const r of rows){
  if(r.letter!==cur){ cur=r.letter; body+=`<h2 class="lh">الحرف المقصود: <span class="bigt">${r.letter}</span> (${r.name})</h2>`; }
  const mmHint = r.mismatch ? `<span class="mmhint">التشكيل في الجملة: <b>${r.senForm}</b></span>` : '';
  body+=`<div class="row ${r.flagged?'flag':''} ${r.mismatch?'mm':''}" data-word="${r.word}" data-flag="${r.flagged?1:0}" data-mm="${r.mismatch?1:0}">
    <input type="checkbox" class="cb" data-id="${r.id}" ${r.flagged?'checked':''}>
    <span class="chip">${LVLLBL[r.lvl]}</span>
    <span class="chip pos">${CATLBL[r.cat]||r.cat}</span>
    <span class="tgchip">${r.letter}</span>
    <span class="word">${hilite(r.vword,r.letter)}</span>
    ${r.mismatch?'<span class="badge-mm">تشكيل مختلف</span>':''}
    <span class="sent">${r.s||'<em style=color:#c00>لا جملة</em>'} ${mmHint}</span>
  </div>`;
}

const html=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مراجعة كلمات صحّح حروفك</title>
<style>
 body{font-family:'Tahoma','Segoe UI',sans-serif;background:#faf7ff;color:#1a1035;margin:0;padding:0 0 60px}
 .bar{position:sticky;top:0;background:#fff;border-bottom:2px solid #e8dcff;padding:10px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:5}
 .bar input[type=text]{padding:6px 10px;border:1.5px solid #ccc;border-radius:8px;font-family:inherit}
 .bar button{background:#9B5DE5;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-weight:800;cursor:pointer;font-family:inherit}
 #out{width:calc(100% - 28px);height:80px;margin:8px 14px;display:block;border:1.5px solid #ccc;border-radius:8px;font-family:monospace;direction:ltr;padding:8px}
 h2.lh{margin:18px 14px 6px;color:#6d3db5;border-bottom:2px solid #9B5DE5;padding-bottom:4px}
 .bigt{font-family:'Amiri',serif;font-size:1.6rem;font-weight:900}
 .row{display:flex;gap:10px;align-items:center;padding:7px 14px;border-bottom:1px solid #eee}
 .row.flag{background:#fff3f3}
 .row.mm{border-right:4px solid #f59e0b}
 .badge-mm{font-size:.68rem;font-weight:800;background:#f59e0b;color:#fff;border-radius:6px;padding:2px 7px;white-space:nowrap}
 .mmhint{display:block;font-size:.8rem;color:#b45309;margin-top:2px}
 .mmhint b{font-family:'Amiri',serif;font-size:1.1rem}
 .cb{width:20px;height:20px;flex:0 0 auto;cursor:pointer}
 .chip{font-size:.72rem;font-weight:700;background:#eee;border-radius:6px;padding:2px 8px;white-space:nowrap}
 .chip.pos{background:#e8dcff;color:#6d3db5}
 .tgchip{font-family:'Amiri',serif;font-size:1.2rem;font-weight:900;color:#fff;background:#9B5DE5;border-radius:8px;width:30px;text-align:center;flex:0 0 auto}
 .word{font-family:'Amiri',serif;font-size:1.5rem;font-weight:700;min-width:120px}
 .word .tg{color:#e11d48;background:#ffe4e9;border-radius:4px;padding:0 2px}
 .sent{font-size:.9rem;color:#444;flex:1;line-height:1.7}
</style></head><body>${body}
<script>
 const only=document.getElementById('onlyFlagged'), onlyMM=document.getElementById('onlyMismatch'), search=document.getElementById('search');
 function apply(){const q=search.value.trim(); document.querySelectorAll('.row').forEach(r=>{
   let ok=true;
   if(only.checked && r.dataset.flag!=='1') ok=false;
   if(onlyMM.checked && r.dataset.mm!=='1') ok=false;
   if(q && !r.dataset.word.includes(q)) ok=false;
   r.style.display=ok?'':'none';
 });}
 only.onchange=apply; onlyMM.onchange=apply; search.oninput=apply;
 document.getElementById('checkVisible').onclick=()=>{
   document.querySelectorAll('.row').forEach(r=>{ if(r.style.display!=='none'){ const cb=r.querySelector('.cb'); if(cb) cb.checked=true; } });
 };
 document.getElementById('exportBtn').onclick=()=>{
   const sel=[...document.querySelectorAll('.cb:checked')].map(c=>c.dataset.id);
   document.getElementById('out').value=JSON.stringify(sel,null,0);
   document.getElementById('out').scrollIntoView({behavior:'smooth'});
 };
</script></body></html>`;

fs.writeFileSync(path.join(__dirname,'..','review_words.html'),html,'utf8');
console.log('تم بناء لوحة المراجعة: review_words.html');
console.log('عدد الصفوف:',rows.length,'| المؤشَّر مسبقاً:',rows.filter(r=>r.flagged).length);
