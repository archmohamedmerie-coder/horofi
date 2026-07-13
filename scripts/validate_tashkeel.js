/*
  مدقّق التشكيل الآلي — يكتشف الأخطاء المستحيلة في العربية فقط (المشكلة ب)
  لا يعدّل أي شيء؛ يقرأ CONNECTING_LETTERS و NONCONNECTING_LETTERS من ملف HTML
  ويُخرج قائمة الكلمات ذات التشكيل المستحيل، مصنّفة بحسب نوع الخطأ.

  الاستخدام:  node scripts/validate_tashkeel.js
*/
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'horofi-v11-9-29.html');
const lines = fs.readFileSync(HTML, 'utf8').split('\n');

// ── علامات التشكيل ──
const FATHA='َ', DAMMA='ُ', KASRA='ِ', SUKUN='ْ';
const FATHATAN='ً', DAMMATAN='ٌ', KASRATAN='ٍ', SHADDA='ّ';
const HARAKAT = [FATHA, DAMMA, KASRA];
const TANWIN  = [FATHATAN, DAMMATAN, KASRATAN];
const MADD    = ['ا','ى','و','ي','آ']; // حروف قد تكون مدّاً فتحمل "" (فراغ)

function markName(m){
  return ({[FATHA]:'فتحة',[DAMMA]:'ضمة',[KASRA]:'كسرة',[SUKUN]:'سكون',
    [FATHATAN]:'تنوين فتح',[DAMMATAN]:'تنوين ضم',[KASRATAN]:'تنوين كسر',
    [SHADDA]:'شدة','':'(فراغ)'})[m] || JSON.stringify(m);
}
function vowelize(letters, D){ return letters.map((c,i)=>c+(D[i]||'')).join(''); }

// ── قواعد الخطأ المستحيل (عالية الثقة) ──
// خانة التشكيل قد تكون: "" أو حركة واحدة أو سكون أو تنوين، مع شدة اختيارية قبلها.
function analyzeMark(mk){
  const chars = Array.from(mk);
  const shadda = chars.filter(c=>c===SHADDA).length;
  const rest = chars.filter(c=>c!==SHADDA);
  return { shadda, rest };
}
function checkWord(letters, D){
  const errs = [];
  const n = letters.length;
  for (let i=0;i<n;i++){
    const ch = letters[i];
    const mk = D[i] || '';
    const isLast = (i === n-1);
    const isFirst = (i === 0);
    const { shadda, rest } = analyzeMark(mk);

    // E-a: أكثر من شدة، أو أكثر من علامة أساسية على الحرف الواحد
    if (shadda > 1) errs.push(`شدّتان على «${ch}»`);
    if (rest.length > 1) errs.push(`أكثر من حركة أساسية على «${ch}» (${rest.map(markName).join('+')})`);

    // E-b: شدة على أول حرف — مستحيل (لا تبدأ الكلمة بحرف مشدَّد)
    if (isFirst && shadda) errs.push('شدّة على أول حرف');

    // E-c: شدة + سكون — مستحيل (المشدَّد يحمل حركة أو تنوين لا سكوناً)
    if (shadda && rest[0] === SUKUN) errs.push(`شدّة مع سكون على «${ch}»`);

    // E1: سكون على أول حرف — مستحيل
    if (isFirst && rest[0] === SUKUN) errs.push('سكون على أول حرف');

    // E2: تنوين في غير آخر الكلمة — مستحيل
    if (rest.some(m=>TANWIN.includes(m)) && !isLast) errs.push(`تنوين في وسط الكلمة على «${ch}»`);

    // E5: حركة قصيرة على ألف المدّ التي تسبقها فتحة (يجب أن تكون بلا حركة)
    if (ch === 'ا' && i>0){
      const prev = analyzeMark(D[i-1]||'').rest[0] || '';
      if (rest.some(m=>HARAKAT.includes(m)) && prev === FATHA)
        errs.push('حركة على ألف المدّ (يجب أن تكون بلا حركة)');
    }
  }
  return errs;
}

// ── استخراج البيانات ──
function extractArray(varName){
  const idx = lines.findIndex(l => l.includes(`const ${varName} =`));
  if (idx < 0) return null;
  const line = lines[idx];
  return JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']')+1));
}

const CONNECTING = extractArray('CONNECTING_LETTERS') || [];
const NONCONN    = extractArray('NONCONNECTING_LETTERS') || [];

const flagged = [];

// الحروف المتصلة
for (const L of CONNECTING){
  for (const lvl in (L.levels||{})){
    for (const cat of ['start','mid_c','mid_n','end_c','end_n']){
      const words = L.levels[lvl][cat] || [];
      const D     = L.levels[lvl][cat+'D'] || [];
      words.forEach((w,i)=>{
        const letters = Array.from(w);
        const errs = checkWord(letters, D[i]||[]);
        if (errs.length) flagged.push({ letter:L.char, lvl, cat, word:w, vowel:vowelize(letters,D[i]||[]), errs });
      });
    }
  }
}
// الحروف غير المتصلة
for (const L of NONCONN){
  (L.words||[]).forEach(w=>{
    if (!w.letters) return;
    const errs = checkWord(w.letters, w.diac||[]);
    if (errs.length) flagged.push({ letter:L.char, lvl:'—', cat:w.test||'—', word:w.letters.join(''), vowel:vowelize(w.letters,w.diac||[]), errs });
  });
}

// ── التقرير ──
console.log(`\n=== مدقّق التشكيل — الأخطاء المستحيلة ===`);
console.log(`إجمالي الكلمات المعلَّمة: ${flagged.length}\n`);

// تجميع حسب نوع الخطأ
const byType = {};
for (const f of flagged) for (const e of f.errs){ const key=e.replace(/«[^»]+»/,'«..»'); byType[key]=(byType[key]||0)+1; }
console.log('— توزيع أنواع الأخطاء —');
Object.entries(byType).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`  ${v}×  ${k}`));

console.log('\n— أول 60 كلمة معلَّمة —');
flagged.slice(0,60).forEach(f=>{
  console.log(`  [${f.letter}/${f.lvl}/${f.cat}]  ${f.word}  →  ${f.vowel}   ⟵  ${f.errs.join('، ')}`);
});

// حفظ التقرير الكامل JSON للمراجعة
fs.writeFileSync(path.join(__dirname,'tashkeel_report.json'), JSON.stringify(flagged,null,2), 'utf8');
console.log(`\nالتقرير الكامل محفوظ في scripts/tashkeel_report.json (${flagged.length} كلمة)`);
