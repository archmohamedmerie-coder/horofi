const fs = require('fs');

for (const P of ['horofi-v11-9-29.html', 'android-app/www/index.html']) {
  const lines = fs.readFileSync(P, 'utf8').split('\n');

  // ── تصحيح الشبكة: قص و عز يعودان لسكون آخرهما (أسماء) ──
  const lineIdx = lines.findIndex(l => l.includes('const CONNECTING_LETTERS ='));
  const line = lines[lineIdx];
  const prefix = line.slice(0, line.indexOf('['));
  const arr = JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
  const suffix = line.slice(line.lastIndexOf(']') + 1);
  const byChar = {}; for (const L of arr) byChar[L.char] = L;

  // قَصّْ (ق فتحة، ص شدة+سكون) — بدل قَصَّ
  byChar['ق'].levels.beginner.start[1] = 'قص';
  byChar['ق'].levels.beginner.startD[1] = ['َ', 'ّْ'];

  // عِزّْ (ع كسرة، ز شدة+سكون) — بدل عِزُّ
  byChar['ع'].levels.beginner.start[1] = 'عز';
  byChar['ع'].levels.beginner.startD[1] = ['ِ', 'ّْ'];

  lines[lineIdx] = prefix + JSON.stringify(arr) + suffix;

  // ── تحديث الجمل ──
  const wsStart = lines.findIndex(l => l.includes('const WORD_SENTENCES'));
  let wsEnd = lines.length;
  for (let i = wsStart; i < lines.length; i++) { if (lines[i].trim() === '};') { wsEnd = i; break; } }

  const fixes = {
    'هر': 'الْهِرُّ هُوَ الْقِطُّ.',
    'قص': 'الْقَصُّ هُوَ عَظْمَةُ الصَّدْرِ.',
    'عز': 'الْعِزُّ الشَّرَفُ وَالرِّفْعَةُ بَيْنَ النَّاسِ.',
  };
  for (const [k, v] of Object.entries(fixes)) {
    let found = false;
    for (let i = wsStart; i < wsEnd; i++) {
      const m = lines[i].match(/^\s*"([^"]+)"\s*:/);
      if (m && m[1] === k) { lines[i] = `  "${k}": "${v}",`; found = true; break; }
    }
    if (!found) console.log('⚠️ لم أجد', k, 'في', P);
  }

  fs.writeFileSync(P, lines.join('\n'), 'utf8');
}
console.log('تم.');
