/*
  يزيل مفاتيح WORD_SENTENCES المكرَّرة، مُبقياً فقط آخر ظهور لكل مفتاح
  (وهو المُعتمَد فعلياً وقت التشغيل في JS، فلا يتغيّر أي سلوك — فقط تنظيف).
*/
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, '..', 'horofi-v11-9-29.html');
const AND_WWW = path.join(__dirname, '..', 'android-app', 'www', 'index.html');

function dedupe(html) {
  const lines = html.split('\n');
  const wsStart = lines.findIndex(l => l.includes('const WORD_SENTENCES'));
  let wsEnd = lines.length;
  for (let i = wsStart; i < lines.length; i++) { if (lines[i].trim() === '};') { wsEnd = i; break; } }

  // اجمع آخر فهرس سطر لكل مفتاح
  const lastIdxForKey = {};
  for (let i = wsStart; i < wsEnd; i++) {
    const m = lines[i].match(/^\s*"([^"]+)"\s*:/);
    if (m) lastIdxForKey[m[1]] = i;
  }
  const keep = new Set(Object.values(lastIdxForKey));

  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (i >= wsStart && i < wsEnd) {
      const m = lines[i].match(/^\s*"([^"]+)"\s*:/);
      if (m && !keep.has(i)) continue; // احذف التكرار القديم
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

const html = fs.readFileSync(HTML, 'utf8');
const cleaned = dedupe(html);
fs.writeFileSync(HTML, cleaned, 'utf8');
fs.writeFileSync(AND_WWW, cleaned, 'utf8');
console.log('تم التنظيف.');
