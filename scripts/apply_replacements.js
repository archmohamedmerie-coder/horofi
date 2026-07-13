/*
  تطبيق استبدال الكلمات الشاذّة المعتمدة (45 كلمة) على horofi-v11-9-29.html
  - يقرأ الكلمة الجديدة كنص مُشكَّل بالكامل (سهل المراجعة البشرية)
  - يُحلّلها تلقائياً إلى (كلمة مجرَّدة + مصفوفة تشكيل) بنفس منطق المدقّق المُختبَر
  - يستبدل الكلمة القديمة في CONNECTING_LETTERS بموقعها الدقيق (حرف/مستوى/فئة/index)
  - يضيف/يُحدِّث الجملة في WORD_SENTENCES بمفتاح الكلمة الجديدة (لا يحذف مفاتيح قديمة تفادياً لأي أثر جانبي)
  - عند "skip: true" لا يُغيَّر شيء في الشبكة، فقط تُحدَّث الجملة إن وُجدت (sentenceOnly)
  الاستخدام: node scripts/apply_replacements.js
*/
const fs = require('fs');
const path = require('path');
const HTML = path.join(__dirname, '..', 'horofi-v11-9-29.html');
const AND_WWW = path.join(__dirname, '..', 'android-app', 'www', 'index.html');

const MARKS = 'ًٌٍَُِّْ';
// يحوّل نصاً مُشكَّلاً بالكامل إلى {bare, D}
function parseVocalized(v) {
  const chars = [...v];
  let bare = [], D = [];
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (MARKS.includes(c)) { i++; continue; } // احتياط، لن يحدث لأننا نبدأ بحرف
    let mark = '';
    let j = i + 1;
    while (j < chars.length && MARKS.includes(chars[j])) { mark += chars[j]; j++; }
    bare.push(c);
    D.push(mark);
    i = j;
  }
  return { bare: bare.join(''), D };
}

/* ── قائمة الاستبدالات المعتمدة (46 → 45 بعد حذف المكرَّر) ── */
const REPLACEMENTS = [
  { loc: ['ت','advanced','start',1],   old:'تنانير', newV:'تَنُّور',   sentence:'التَّنُّورُ فُرْنٌ نَخْبِزُ فِيهِ الْخُبْزَ.' },
  { loc: ['ث','beginner','mid_n',1],   old:'دثر',    newV:'دَثَّر',   sentence:'دَثَّرَ يَعْنِي غَطَّى وَسَتَّرَ بِالثِّيَابِ.' },
  { loc: ['ث','beginner','end_c',1],   old:'نكث',    newV:'نَكَثَ',   sentence:null }, // جملتها صحيحة — لا تغيير
  { loc: ['ل','beginner','mid_n',2],   old:'ألق',    skip:true },  // تبقى كما هي
  { loc: ['ث','intermediate','mid_n',2], old:'رثاء', skip:true },  // تبقى كما هي
  { loc: ['خ','beginner','end_c',2],   old:'فلخ',    newV:'مَلَخَ',   sentence:'مَلَخَ: كَيَّفَهُ بِالتَّمْرِينِ.' },
  { loc: ['خ','intermediate','end_n',1], old:'فارخ', newV:'فَرْخ',   sentence:'الْفَرْخُ صَغِيرُ الطَّائِرِ.' },
  { loc: ['خ','advanced','end_c',0],   old:'تنسخ',   newV:'تَنَسُّخ', sentence:'تَنْسَخُ الْمُوَظَّفَةُ الْوَرَقَةَ.' },
  { loc: ['خ','advanced','end_c',1],   old:'تمسخ',   newV:'مَسَخَ',   sentence:'مَسَخَ اللهُ الْمُجْرِمِينَ قِرَدَةً.' },
  { loc: ['س','intermediate','mid_n',2], old:'وساد', newV:'وِسَادَة', sentence:'الْوِسَادَةُ مِخَدَّةٌ تَقْلِيدِيَّةٌ مِنَ الْقُطْنِ أَوِ الصُّوفِ.' },
  { loc: ['ش','beginner','mid_n',2],   old:'دشت',    newV:'وَشَق',   sentence:'الْوَشَقُ حَيَوَانٌ مِنْ فَصِيلَةِ الْقِطَطِ.' },
  { loc: ['ش','intermediate','end_c',2], old:'جحش',  newV:'جَحَش',   sentence:'الْجَحَشُ حَيَوَانٌ عَاشِبٌ.' },
  { loc: ['ص','intermediate','end_c',2], old:'تمصمص', newV:'رَخِيص', sentence:'الرَّخِيصُ هُوَ الَّذِي ثَمَنُهُ قَلِيلٌ.' },
  { loc: ['ض','intermediate','mid_n',2], old:'وضاءة', newV:'وُضُوء', sentence:'الْوُضُوءُ شَرْطُ الصَّلَاةِ.' },
  { loc: ['ض','intermediate','end_n',2], old:'تراقض', newV:'حَوْض', sentence:'حَوْضُ السَّمَكِ نَظِيفٌ وَمَاؤُهُ نَقِيٌّ.' },
  { loc: ['ض','advanced','end_c',0],   old:'تشبض',   newV:'تَمَضْمَض', sentence:'تَمَضْمَضَ الرَّجُلُ بَعْدَ الطَّعَامِ.' },
  { loc: ['ض','advanced','end_c',2],   old:'استعاض', newV:'اِسْتِعَاض', sentence:'اِسْتَعَاضَ الطِّفْلُ بِالْحَلِيبِ عَنِ الْحَلْوَى.' },
  { loc: ['ط','beginner','mid_n',2],   old:'وطس',    newV:'رُطَب',   sentence:'الرُّطَبُ نَوْعٌ مِنَ التَّمْرِ.' },
  { loc: ['ط','beginner','end_n',2],   old:'سرط',    newV:'فَرَطَ',   sentence:'فَرَطَ الْعِقْدُ عَنْ خَيْطِهِ.' },
  { loc: ['ظ','beginner','end_c',0],   old:'نفظ',    newV:'لَحَظَ',   sentence:'لَحَظَ الطِّفْلُ عُصْفُورًا عَلَى الشَّجَرَةِ.' },
  { loc: ['ظ','beginner','end_n',1],   old:'شواظ',   skip:true },  // تبقى كما هي
  { loc: ['ظ','advanced','mid_n',2],   old:'وظاهر',  newV:'أَظَافِر', sentence:'يَجِبُ قَصُّ الْأَظَافِرِ كُلَّ أُسْبُوعَيْنِ.' },
  { loc: ['ع','beginner','mid_n',0],   old:'وعل',    newV:'وَعْل',    sentence:'الْوَعْلُ حَيَوَانٌ يَعِيشُ فِي الْجِبَالِ.' },
  { loc: ['غ','beginner','end_c',2],   old:'فلغ',    newV:'صَبَغَ',   sentence:'صَبَغَ الْعَامِلُ الثِّيَابَ بِالْأَلْوَانِ.' },
  { loc: ['غ','intermediate','end_c',1], old:'اندمغ', newV:'يَدْمَغُ', sentence:'يَدْمَغُ الْمُوَظَّفُ الْمَلَفَّ بِخَتْمٍ رَسْمِيٍّ.' },
  { loc: ['غ','intermediate','end_c',2], old:'ابتلغ', newV:'يَبْلُغُ', sentence:'يَبْلُغُ الْمُسَافِرُ غَايَتَهُ بَعْدَ عَنَاءٍ.' },
  { loc: ['غ','beginner','mid_n',0],   old:'وغر',    newV:'وَغْرَة',  sentence:'تَرَكَتِ الشَّمْسُ فِي جَوِّهِ وَغْرَةً.' },
  { loc: ['غ','advanced','end_n',1],   old:'صياغ',   newV:'صِيَاغ',   sentence:'صِيَاغُ الْمِهْنِيِّ مِنَ الذَّهَبِ عِقْدًا.' },
  { loc: ['غ','advanced','end_c',0],   old:'انطبغ',  newV:'مَضَغَ',   sentence:'مَضَغَ الطَّعَامَ بِأَسْنَانِهِ جَيِّدًا.' },
  { loc: ['ف','beginner','end_n',0],   old:'زرف',    newV:'عَرَفَ',   sentence:'عَرَفَ الْمُذْنِبُ بِخَطَئِهِ فَاسْتَغْفَرَ رَبَّهُ.' },
  { loc: ['ل','beginner','end_n',0],   old:'جرل',    newV:'عَدْل',    sentence:'الْعَدْلُ أَسَاسُ الْمُلْكِ.' },
  { loc: ['م','beginner','mid_n',2],   old:'زمر',    newV:'دَمَجَ',   sentence:'دَمَجَ التِّلْمِيذُ صُورَتَيْنِ فِي صُورَةٍ وَاحِدَةٍ.' },
  { loc: ['م','beginner','end_c',1],   old:'صلم',    newV:'عِلْم',    sentence:'عِلْمُ بِلَادِي يُرَفْرِفُ عَالِيًا.' },
  { loc: ['م','beginner','end_c',2],   old:'ثلم',    newV:'ظَلَمَ',   sentence:'ظَلَمَ التَّحْكِيمُ مُنْتَخَبَ مِصْرَ فِي كَأْسِ الْعَالَمِ.' },
  { loc: ['م','beginner','end_n',2],   old:'أدم',    newV:'رَدَمَ',   sentence:'رَدَمَ الرَّجُلُ الْحُفْرَةَ بِالتُّرَابِ.' },
  { loc: ['ن','beginner','mid_n',0],   old:'ونى',    newV:'دَنَا',    sentence:'ثُمَّ دَنَا فَتَدَلَّى.' },
  { loc: ['ن','beginner','end_n',2],   old:'ودن',    newV:'مَرِن',    sentence:'الرِّيَاضَةُ تَجْعَلُ الْجِسْمَ مَرِنًا.' },
  { loc: ['ه','advanced','end_c',1],   old:'استنبه', skip:true },  // تبقى كما هي
  { loc: ['ه','advanced','mid_n',0],   old:'وهدة',   newV:'وَهْم',    sentence:'الْوَهْمُ الشَّيْءُ الْخَيَالِيُّ غَيْرُ الْحَقِيقِيِّ.' },
  { loc: ['ه','beginner','end_n',0],   old:'فره',    newV:'رَفَاه',   sentence:'الرَّفَاهُ الْعَيْشُ الطَّيِّبُ وَالْحَيَاةُ الرَّغِيدَةُ.' },
  { loc: ['ي','beginner','end_n',1],   old:'وري',    newV:'سِرِّيّ',  sentence:'تَذَكَّرْ أَنَّهُ مَا دَارَ بَيْنَنَا سِرِّيٌّ جِدًّا.' },
  { loc: ['ي','advanced','mid_n',2],   old:'أيامية', newV:'أَزْيَاء', sentence:'الْأَزْيَاءُ أَشْكَالُ الْمَلَابِسِ الْجَدِيدَةِ.' },
  { loc: ['ي','advanced','end_n',0],   old:'ماضوي',  newV:'أَوْلَوِيّ', sentence:'الْأَوْلَوِيُّ هُوَ مَا يَجِبُ عَمَلُهُ أَوَّلًا.' },
  { loc: ['ي','advanced','end_n',2],   old:'دواري',  newV:'وُدِّيّ',  sentence:'كَانَ يَتَعَامَلُ مَعَهُ وُدِّيًّا جِدًّا.' },
];

function main() {
  const lines = fs.readFileSync(HTML, 'utf8').split('\n');
  const lineIdx = lines.findIndex(l => l.includes('const CONNECTING_LETTERS ='));
  const line = lines[lineIdx];
  const prefix = line.slice(0, line.indexOf('['));
  const arr = JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
  const suffix = line.slice(line.lastIndexOf(']') + 1);

  const byChar = {};
  for (const L of arr) byChar[L.char] = L;

  let applied = 0, skipped = 0, errors = [];

  for (const r of REPLACEMENTS) {
    const [ch, lvl, cat, idx] = r.loc;
    const L = byChar[ch];
    if (!L || !L.levels || !L.levels[lvl] || !L.levels[lvl][cat]) {
      errors.push(`موقع غير موجود: ${ch}/${lvl}/${cat}`); continue;
    }
    const wordsArr = L.levels[lvl][cat];
    const dArrName = cat + 'D';
    const dArr = L.levels[lvl][dArrName];
    const currentWord = wordsArr[idx];
    if (currentWord !== r.old) {
      errors.push(`⚠️ الكلمة الحالية في ${ch}/${lvl}/${cat}/idx${idx} هي "${currentWord}" وليست "${r.old}" كما هو متوقَّع — تم التخطي لتفادي استبدال خاطئ`);
      continue;
    }

    if (r.skip) {
      skipped++;
      continue; // لا تغيير على الشبكة، ولا جملة (كلها "تبقى")
    }

    const { bare, D } = parseVocalized(r.newV);
    wordsArr[idx] = bare;
    dArr[idx] = D;
    applied++;
  }

  if (errors.length) {
    console.log('❌ توجد أخطاء أوقفت بعض الاستبدالات:');
    errors.forEach(e => console.log('  -', e));
  }

  // إعادة كتابة سطر CONNECTING_LETTERS
  lines[lineIdx] = prefix + JSON.stringify(arr) + suffix;

  // تحديث WORD_SENTENCES: نبحث عن نهاية الكائن (السطر الذي يحوي "};" بعد بداية WORD_SENTENCES)
  const wsStart = lines.findIndex(l => l.includes('const WORD_SENTENCES'));
  let wsEnd = wsStart;
  for (let i = wsStart; i < lines.length; i++) { if (lines[i].trim() === '};') { wsEnd = i; break; } }

  const newSentenceLines = [];
  for (const r of REPLACEMENTS) {
    if (r.skip || !r.sentence) continue;
    const { bare } = parseVocalized(r.newV);
    // هروب علامات التنصيص المزدوجة إن وُجدت (غير متوقّع هنا لكن للأمان)
    const safeWord = bare.replace(/"/g, '\\"');
    const safeSentence = r.sentence.replace(/"/g, '\\"');
    newSentenceLines.push(`  "${safeWord}": "${safeSentence}",`);
  }
  lines.splice(wsEnd, 0, ...newSentenceLines);

  const outHtml = lines.join('\n');
  fs.writeFileSync(HTML, outHtml, 'utf8');
  fs.writeFileSync(AND_WWW, outHtml, 'utf8');

  console.log(`\n✅ تم تطبيق ${applied} استبدالاً، وتخطّي ${skipped} (تبقى كما هي)، وإضافة ${newSentenceLines.length} جملة جديدة.`);
  console.log('تم تحديث: horofi-v11-9-29.html و android-app/www/index.html');
}

main();
