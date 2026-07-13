const fs = require('fs');
const fixes = {
  'صح': 'صَحَّ الطِّفْلُ مِنْ مَرَضِهِ وَعَادَ يَلْعَبُ بِنَشَاطٍ.',
  'عز': 'الْعِزُّ الشَّرَفُ وَالرِّفْعَةُ بَيْنَ النَّاسِ.',
  'هر': 'الْهِرُّ صَوْتُ الْقِطَّةِ.',
  'مر': 'الْمُرُّ الشَّيْءُ ذُو الطَّعْمِ الْكَرِيهِ.',
  'لج': 'لَجَّ الرَّجُلُ فِي رَأْيِهِ وَلَمْ يَتَرَاجَعْ.',
  'قص': 'قَصَّ الْوَلَدُ الْوَرَقَةَ بِالْمِقَصِّ.',
  'غص': 'غَصَّ الطِّفْلُ بِقِطْعَةٍ مِنَ الطَّعَامِ.',
};
for (const P of ['horofi-v11-9-29.html', 'android-app/www/index.html']) {
  const lines = fs.readFileSync(P, 'utf8').split('\n');
  const wsStart = lines.findIndex(l => l.includes('const WORD_SENTENCES'));
  let wsEnd = lines.length;
  for (let i = wsStart; i < lines.length; i++) { if (lines[i].trim() === '};') { wsEnd = i; break; } }
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
