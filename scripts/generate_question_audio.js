/*
  توليد أصوات أسئلة التمارين بالصيغة الجديدة:
  "اِقْرَأِ الْكَلِمَةَ وَاخْتَرِ [الحرف] الصَّحِيحَة فِي [الموضع]"

  يولّد:
    - 22 حرفاً متصلاً × 5 مواضع = 110 ملفاً في audio/questions/{حرف}_{ini|med_c|med_n|fin_c|fin_n}.mp3
    - 6 حروف غير متصلة × ملف واحد = audio/questions/{حرف}_special.mp3

  الاستخدام: node scripts/generate_question_audio.js
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const ELEVENLABS_KEY = 'sk_3b058a7ccab295dcf2d2ddf2352dfc36a927aed21e5a4d12';
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const VOICE_ID = 'gMB389pj77Qe5nErWNjd'; // Sara — نفس صوت التطبيق

const OUT_DIR = path.join(__dirname, '..', 'audio', 'questions');
const HTML = path.join(__dirname, '..', 'horofi-v11-9-29.html');

function ex(v, lines) {
  const i = lines.findIndex(l => l.includes(`const ${v} =`));
  const line = lines[i];
  return JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
}

const lines = fs.readFileSync(HTML, 'utf8').split('\n');
const CONNECTING = ex('CONNECTING_LETTERS', lines);
const NONCONN = ex('NONCONNECTING_LETTERS', lines);

const POS_TEXT = {
  ini:   'فِي بِدَايَةِ الْكَلِمَةِ',
  med_c: 'فِي وَسَطِ الْكَلِمَةِ بَعْدَ حَرْفٍ مُتَّصِلٍ',
  med_n: 'فِي وَسَطِ الْكَلِمَةِ بَعْدَ حَرْفٍ مُنْفَصِلٍ',
  fin_c: 'فِي آخِرِ الْكَلِمَةِ بَعْدَ حَرْفٍ مُتَّصِلٍ',
  fin_n: 'فِي آخِرِ الْكَلِمَةِ بَعْدَ حَرْفٍ مُنْفَصِلٍ',
};

async function generateOne(text, outPath) {
  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: { stability: 0.3, similarity_boost: 0.80, style: 0.0, use_speaker_boost: true, speed: 1.2 },
    }),
  });
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('audio')) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs error ${res.status} (${contentType}): ${errText.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`ملف صغير جداً (${buf.length} بايت)`);
  const rawPath = outPath + '.raw.mp3';
  fs.writeFileSync(rawPath, buf);
  execFileSync(ffmpegPath, ['-y', '-i', rawPath, '-filter:a', 'atempo=1.45', outPath]);
  fs.unlinkSync(rawPath);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0, fail = 0, skip = 0;

  for (const L of CONNECTING) {
    for (const posKey of Object.keys(POS_TEXT)) {
      const outPath = path.join(OUT_DIR, `${L.char}_${posKey}.mp3`);
      if (fs.existsSync(outPath)) { skip++; continue; }
      const text = `اِقْرَأِ الْكَلِمَةَ وَاخْتَرِ ${L.name} الصَّحِيحَةَ ${POS_TEXT[posKey]}.`;
      process.stdout.write(`🎙  ${L.char}_${posKey}.mp3 ... `);
      try { await generateOne(text, outPath); console.log('✅'); ok++; }
      catch (e) { console.log('❌', e.message); fail++; }
      await new Promise(r => setTimeout(r, 350));
    }
  }

  for (const L of NONCONN) {
    const outPath = path.join(OUT_DIR, `${L.char}_special.mp3`);
    if (fs.existsSync(outPath)) { skip++; continue; }
    const text = `اِقْرَأِ الْكَلِمَةَ وَاخْتَرِ ${L.name} الصَّحِيحَةَ وَتَذَكَّرْ أَنَّهَا لَا تَتَّصِلُ بِمَا بَعْدَهَا.`;
    process.stdout.write(`🎙  ${L.char}_special.mp3 ... `);
    try { await generateOne(text, outPath); console.log('✅'); ok++; }
    catch (e) { console.log('❌', e.message); fail++; }
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\nانتهى: ${ok} نجاح، ${fail} فشل، ${skip} موجود مسبقاً.`);
}

main().catch(e => { console.error('فشل السكريبت:', e); process.exit(1); });
