/*
  إعادة توليد صوت الجُمل التي تغيّر نصها فعلياً خلال جلسة تصحيح الكلمات الشاذّة
  (استُخرجت هذه القائمة بمقارنة Git بين ما قبل وبعد الجلسة — راجع المحادثة للتفاصيل).
  يستبدل الملفات الموجودة (لأن النص تغيّر ولا بد من نطق جديد).

  الاستخدام: node scripts/generate_updated_sentence_audio.js
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const ELEVENLABS_KEY = 'sk_3b058a7ccab295dcf2d2ddf2352dfc36a927aed21e5a4d12';
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const VOICE_ID = 'gMB389pj77Qe5nErWNjd';

const OUT_DIR = path.join(__dirname, '..', 'audio', 'sentences');
const HTML = path.join(__dirname, '..', 'horofi-v11-9-29.html');

const KEYS = [
  'أزياء','أظافر','أولوي','استعاض','انقض','تجارب','تمضمض','تنسخ','تنور','جحش',
  'حوض','دثر','دمج','دنا','رخيص','ردم','رطب','رفاه','سري','صبغ','صياغ',
  'عدل','عرف','علم','فرخ','فرط','قص','لحظ','مر','مرن','مسخ','مضغ','ملخ',
  'نضج','هر','ودي','وسادة','وشق','وضوء','وعل','وغرة','وهم','يبلغ','يدمغ',
];

function ex(v, lines) {
  const i = lines.findIndex(l => l.includes(`const ${v} =`));
  const line = lines[i];
  return JSON.parse(line.slice(line.indexOf('['), line.lastIndexOf(']') + 1));
}

const lines = fs.readFileSync(HTML, 'utf8').split('\n');
const wsStart = lines.findIndex(l => l.includes('const WORD_SENTENCES'));
let wsEnd = lines.length;
for (let i = wsStart; i < lines.length; i++) { if (lines[i].trim() === '};') { wsEnd = i; break; } }
const sent = {};
for (let i = wsStart; i < wsEnd; i++) {
  const m = lines[i].match(/^\s*"([^"]+)"\s*:\s*"([^"]+)"/);
  if (m) sent[m[1]] = m[2];
}

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
  if (buf.length < 500) throw new Error(`ملف صغير جداً (${buf.length} بايت)`);
  const rawPath = outPath + '.raw.mp3';
  fs.writeFileSync(rawPath, buf);
  execFileSync(ffmpegPath, ['-y', '-i', rawPath, '-filter:a', 'atempo=1.6675', outPath]);
  fs.unlinkSync(rawPath);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0, fail = 0, missing = 0;
  for (const key of KEYS) {
    const sentence = sent[key];
    if (!sentence) { console.log('⚠️ لا جملة لـ', key); missing++; continue; }
    const outPath = path.join(OUT_DIR, `${key}.mp3`);
    process.stdout.write(`🎙  ${key} ... `);
    try { await generateOne(sentence, outPath); console.log('✅'); ok++; }
    catch (e) { console.log('❌', e.message); fail++; }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(`\nانتهى: ${ok} نجاح، ${fail} فشل، ${missing} بلا جملة.`);
}

main().catch(e => { console.error('فشل السكريبت:', e); process.exit(1); });
