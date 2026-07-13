/* تصحيح تشكيل 15 كلمة + استبدال كلمة واحدة (تقبض←انقض) + تصحيح جملتين */
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, '..', 'horofi-v11-9-29.html');
const AND_WWW = path.join(__dirname, '..', 'android-app', 'www', 'index.html');

const MARKS = 'ًٌٍَُِّْ';
function parseVocalized(v) {
  const chars = [...v]; let bare = [], D = []; let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    let mark = ''; let j = i + 1;
    while (j < chars.length && MARKS.includes(chars[j])) { mark += chars[j]; j++; }
    bare.push(c); D.push(mark); i = j;
  }
  return { bare: bare.join(''), D };
}

const TASHKEEL_FIXES = [
  { loc:['ب','advanced','mid_n',0], old:'مربية', newV:'مُرَبِّيَةُ' },
  { loc:['ث','beginner','mid_c',0], old:'كثر',   newV:'كَثُرَ' },
  { loc:['ث','beginner','mid_c',1], old:'نثر',   newV:'نَثْرْ' },
  { loc:['ح','beginner','mid_n',1], old:'رحم',   newV:'رَحِمْ' },
  { loc:['خ','advanced','end_c',0], old:'تنسخ',  newV:'تَنْسَخُ' },
  { loc:['ص','intermediate','end_c',0], old:'تخصص', newV:'تَخَصُّصُ' },
  { loc:['ض','intermediate','end_c',0], old:'تناقض', newV:'تَنَاقُضُ' },
  { loc:['ض','advanced','end_c',2], old:'استعاض', newV:'اِسْتَعَاضَ' },
  { loc:['ش','intermediate','end_n',1], old:'وحش', newV:'وَحْشْ' },
  { loc:['ط','intermediate','start',2], old:'طليعة', newV:'طَلِيعَةْ' },
  { loc:['ف','beginner','end_c',1], old:'ثقف',   newV:'ثَقِفَ' },
  { loc:['ه','advanced','end_c',1], old:'استنبه', newV:'اِسْتَنْبَهَ' },
  { loc:['ي','beginner','end_c',0], old:'فتي',   newV:'فَتِيّ' },
  { loc:['ي','beginner','end_c',2], old:'شجي',   newV:'شَجِيّ' },
];

const REPLACEMENT = { loc:['ض','intermediate','end_c',1], old:'تقبض', newV:'اِنْقَضَّ', sentence:'اِنْقَضَّ الْقِطُّ عَلَى الْفَأْرِ.' };

const SENTENCE_FIXES = [
  { key:'تجارب', newSentence:'التَّجَارُبُ نَتَعَلَّمُ مِنْهَا وَنَكْبُرُ بِهَا.' },
  { key:'نضج',   newSentence:'نَضَجَ الثَّمَرُ يَعْنِي اكْتَمَلَ وَصَارَ صَالِحًا لِلْأَكْل.' },
];

for (const P of [HTML, AND_WWW]) {
  const lines = fs.readFileSync(P, 'utf8').split('\n');
  const lineIdx = lines.findIndex(l => l.includes('const CONNECTING_LETTERS ='));
  const line = lines[lineIdx];
  const prefix = line.slice(0, line.indexOf('['));
  const arr = JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
  const suffix = line.slice(line.lastIndexOf(']') + 1);
  const byChar = {}; for (const L of arr) byChar[L.char] = L;

  let applied = 0, errors = [];
  for (const r of [...TASHKEEL_FIXES, REPLACEMENT]) {
    const [ch, lvl, cat, idx] = r.loc;
    const L = byChar[ch];
    const wordsArr = L.levels[lvl][cat];
    const dArr = L.levels[lvl][cat + 'D'];
    if (wordsArr[idx] !== r.old) { errors.push(`${ch}/${lvl}/${cat}/${idx}: متوقَّع "${r.old}" لكن الموجود "${wordsArr[idx]}"`); continue; }
    const { bare, D } = parseVocalized(r.newV);
    wordsArr[idx] = bare;
    dArr[idx] = D;
    applied++;
  }
  if (errors.length) { console.log('❌ أخطاء في', P, ':'); errors.forEach(e => console.log(' -', e)); }

  lines[lineIdx] = prefix + JSON.stringify(arr) + suffix;

  const wsStart = lines.findIndex(l => l.includes('const WORD_SENTENCES'));
  let wsEnd = lines.length;
  for (let i = wsStart; i < lines.length; i++) { if (lines[i].trim() === '};') { wsEnd = i; break; } }

  // إضافة جملة الكلمة المُستبدَلة الجديدة
  const { bare: newBare } = parseVocalized(REPLACEMENT.newV);
  const newLine = `  "${newBare}": "${REPLACEMENT.sentence}",`;
  lines.splice(wsEnd, 0, newLine);
  wsEnd++; // تحديث الحد بعد الإضافة

  // تصحيح جملتين موجودتين
  for (const sf of SENTENCE_FIXES) {
    let found = false;
    for (let i = wsStart; i < wsEnd; i++) {
      if (lines[i].match(new RegExp(`^\\s*"${sf.key}"\\s*:`))) {
        lines[i] = `  "${sf.key}": "${sf.newSentence}",`;
        found = true; break;
      }
    }
    if (!found) console.log('⚠️ لم أجد جملة', sf.key, 'في', P);
  }

  fs.writeFileSync(P, lines.join('\n'), 'utf8');
  console.log(`${P}: طُبِّق ${applied} تصحيح تشكيل + استبدال واحد + جملتان مُصحَّحتان.`);
}
