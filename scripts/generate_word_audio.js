/*
  توليد صوت نطق كل كلمة مفردة (بلا جملة) تُستخدم في التمارين.
  يُحفَظ باسم الكلمة المجرَّدة (بدون تشكيل) في audio/words/{الكلمة}.mp3
  لأن هذا هو نفس مفتاح البحث المستخدم في playWordAudio(key) داخل التطبيق.

  الاستخدام: node scripts/generate_word_audio.js
*/
const fs = require('fs');
const path = require('path');

const ELEVENLABS_KEY = 'sk_3b058a7ccab295dcf2d2ddf2352dfc36a927aed21e5a4d12';
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const VOICE_ID = 'gMB389pj77Qe5nErWNjd';

const OUT_DIR = path.join(__dirname, '..', 'audio', 'words');
const HTML = path.join(__dirname, '..', 'horofi-v11-9-29.html');

function ex(v, lines) {
  const i = lines.findIndex(l => l.includes(`const ${v} =`));
  const line = lines[i];
  return JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
}
function vz(w, D) { return Array.from(w).map((c, i) => c + ((D && D[i]) || '')).join(''); }

const lines = fs.readFileSync(HTML, 'utf8').split('\n');
const CONNECTING = ex('CONNECTING_LETTERS', lines);
const NONCONN = ex('NONCONNECTING_LETTERS', lines);

// اجمع كل كلمة فريدة (بمفتاحها المجرَّد) مع أول تشكيل نصادفه لها
const words = new Map(); // bareKey -> vocalizedText
for (const L of CONNECTING) {
  for (const lvl in (L.levels || {})) {
    for (const cat of ['start', 'mid_c', 'mid_n', 'end_c', 'end_n']) {
      const ws = L.levels[lvl][cat] || [], D = L.levels[lvl][cat + 'D'] || [];
      ws.forEach((w, i) => { if (!words.has(w)) words.set(w, vz(w, D[i])); });
    }
  }
}
for (const L of NONCONN) {
  (L.words || []).forEach(w => {
    if (!w.letters) return;
    const bare = w.letters.join('');
    if (!words.has(bare)) words.set(bare, vz(bare, w.diac));
  });
}

async function generateOne(text, outPath) {
  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: { stability: 0.65, similarity_boost: 0.80, style: 0.30, use_speaker_boost: true },
    }),
  });
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('audio')) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs error ${res.status} (${contentType}): ${errText.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) throw new Error(`ملف صغير جداً (${buf.length} بايت)`);
  fs.writeFileSync(outPath, buf);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`إجمالي الكلمات الفريدة: ${words.size}`);
  let ok = 0, fail = 0, skip = 0;
  for (const [bare, vocal] of words) {
    const outPath = path.join(OUT_DIR, `${bare}.mp3`);
    if (fs.existsSync(outPath)) { skip++; continue; }
    process.stdout.write(`🎙  ${bare} (${vocal}) ... `);
    try { await generateOne(vocal, outPath); console.log('✅'); ok++; }
    catch (e) { console.log('❌', e.message); fail++; }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\nانتهى: ${ok} نجاح، ${fail} فشل، ${skip} موجود مسبقاً.`);
}

main().catch(e => { console.error('فشل السكريبت:', e); process.exit(1); });
