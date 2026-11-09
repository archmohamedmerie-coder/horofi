// يجمع مقاطع الرحلات في hosting/journeys/L<رمز الحرف>/ لنشرها على Firebase Hosting (firebase deploy --only hosting)
// الاستعمال: node scripts/build-journey-hosting.cjs   — الحروف = كل ملفات prototypes/assets/journeys/*.json
const fs = require('fs'), path = require('path');
const SRC = 'prototypes/assets/journeys', OUT = 'hosting/journeys';
let n = 0, sz = 0;
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.json'))){
  const J = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
  for (const p of new Set([J.film, ...J.stops.flatMap(s => [s.sad, s.happy])])){
    const i = p.indexOf('/'), d = path.join(OUT, 'L' + p.slice(0, i).codePointAt(0).toString(16));
    fs.mkdirSync(d, {recursive: true});
    const src = path.join(SRC, p); if (!fs.existsSync(src)){ console.log('MISSING', src); process.exitCode = 1; continue; }
    fs.copyFileSync(src, path.join(d, p.slice(i + 1))); n++; sz += fs.statSync(src).size;
  }
}
if (!fs.existsSync('hosting/index.html')) fs.writeFileSync('hosting/index.html', '<!doctype html><meta charset="utf-8"><title>Horofi</title>\n');
console.log(n, 'files', (sz / 1e6).toFixed(1), 'MB');
