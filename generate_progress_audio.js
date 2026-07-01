/*
  سكريبت توليد أصوات شارة التقدم "أنجزتَ X من 28 حرفاً"
  ────────────────────────────────────────────────
  يولّد 28 ملف صوت (لكل عدد من 1 إلى 28) بصوتين: مذكر ومؤنث،
  باستخدام نفس خدمة ElevenLabs المستخدمة في التطبيق.

  طريقة الاستخدام:
    1) ثبّت Node.js (18+ يكفي لدعم fetch المدمج)
    2) في نفس مجلد هذا الملف نفّذ:
         npm init -y
    3) عدّل المتغيرات أدناه (المفتاح موجود بالفعل من ملف التطبيق)
    4) شغّل:
         node generate_progress_audio.js
    5) ستجد الملفات داخل مجلد: audio/progress/
       بالتسمية: progress_1_m.mp3, progress_1_f.mp3 ... حتى 28

  بعدها ضع مجلد audio/progress بجانب ملف الـ HTML على الاستضافة (GitHub Pages)
  تماماً كما هو الحال مع audio/mastery و audio/badges.
*/

const fs = require('fs');
const path = require('path');

/* ── إعدادات ElevenLabs (منسوخة من horofi-v11-9-29.html) ── */
const ELEVENLABS_KEY   = 'sk_3b058a7ccab295dcf2d2ddf2352dfc36a927aed21e5a4d12'; // نفس المفتاح المستخدم في التطبيق
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';

/* صوتان: مذكر ومؤنث — عدّلهما إن أردت صوتاً مختلفاً */
const VOICES = {
  m: 'gMB389pj77Qe5nErWNjd', // نفس الصوت الافتراضي في التطبيق (Sara) — بدّله بصوت ذكوري إن توفر لديك
  f: 'gMB389pj77Qe5nErWNjd', // Sara — عربية فصحى، تعليمية
};

const TOTAL_LETTERS = 28;
const OUT_DIR = path.join(__dirname, 'audio', 'progress');

/* كتابة الأعداد 1-28 بالحروف مع التشكيل الكامل — الأرقام الخام غالباً
   تُنطق بشكل غريب/مشوّه من محرك TTS، بعكس النص المُشكَّل بالكامل */
const NUMBER_WORDS = {
  1: 'حَرْفاً وَاحِداً', 2: 'حَرْفَيْنِ', 3: 'ثَلاثَةَ أَحْرُفٍ', 4: 'أَرْبَعَةَ أَحْرُفٍ',
  5: 'خَمْسَةَ أَحْرُفٍ', 6: 'سِتَّةَ أَحْرُفٍ', 7: 'سَبْعَةَ أَحْرُفٍ', 8: 'ثَمانِيَةَ أَحْرُفٍ',
  9: 'تِسْعَةَ أَحْرُفٍ', 10: 'عَشَرَةَ أَحْرُفٍ', 11: 'أَحَدَ عَشَرَ حَرْفاً', 12: 'اثْنَيْ عَشَرَ حَرْفاً',
  13: 'ثَلاثَةَ عَشَرَ حَرْفاً', 14: 'أَرْبَعَةَ عَشَرَ حَرْفاً', 15: 'خَمْسَةَ عَشَرَ حَرْفاً',
  16: 'سِتَّةَ عَشَرَ حَرْفاً', 17: 'سَبْعَةَ عَشَرَ حَرْفاً', 18: 'ثَمانِيَةَ عَشَرَ حَرْفاً',
  19: 'تِسْعَةَ عَشَرَ حَرْفاً', 20: 'عِشْرِينَ حَرْفاً', 21: 'واحِداً وَعِشْرِينَ حَرْفاً',
  22: 'اثْنَيْنِ وَعِشْرِينَ حَرْفاً', 23: 'ثَلاثَةً وَعِشْرِينَ حَرْفاً', 24: 'أَرْبَعَةً وَعِشْرِينَ حَرْفاً',
  25: 'خَمْسَةً وَعِشْرِينَ حَرْفاً', 26: 'سِتَّةً وَعِشْرِينَ حَرْفاً', 27: 'سَبْعَةً وَعِشْرِينَ حَرْفاً',
  28: 'ثَمانِيَةً وَعِشْرِينَ حَرْفاً',
};

function sentenceFor(count, gender) {
  return gender === 'f'
    ? `أَتْقَنْتِ ${NUMBER_WORDS[count]}! أَحْسَنْتِ`
    : `أَتْقَنْتَ ${NUMBER_WORDS[count]}! أَحْسَنْتَ`;
}

async function generateOne(text, voiceId, outPath) {
  // output_format ثابت (44.1kHz, 128kbps CBR) لتفادي تشوّه الصوت في بعض المشغلات مع صيغ VBR
  const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: { stability: 0.65, similarity_boost: 0.80, style: 0.30, use_speaker_boost: true, speed: 1.2 },
    }),
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok || !contentType.includes('audio')) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs error ${res.status} (content-type: ${contentType}): ${errText.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) {
    throw new Error(`الملف الناتج صغير جداً (${buf.length} بايت) — على الأرجح رسالة خطأ وليست صوتاً`);
  }
  fs.writeFileSync(outPath, buf);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (let count = 1; count <= TOTAL_LETTERS; count++) {
    for (const gender of ['m', 'f']) {
      const text = sentenceFor(count, gender);
      const outPath = path.join(OUT_DIR, `progress_${count}_${gender}.mp3`);
      if (fs.existsSync(outPath)) {
        console.log(`⏭  موجود مسبقاً: progress_${count}_${gender}.mp3`);
        continue;
      }
      process.stdout.write(`🎙  توليد progress_${count}_${gender}.mp3 ... `);
      try {
        await generateOne(text, VOICES[gender], outPath);
        console.log('✅');
      } catch (e) {
        console.log('❌', e.message);
      }
      // تهدئة بسيطة بين الطلبات لتفادي حدود المعدل (rate limit)
      await new Promise(r => setTimeout(r, 400));
    }
  }

  console.log('\nانتهى التوليد. الملفات في:', OUT_DIR);
}

main().catch(err => {
  console.error('فشل السكريبت:', err);
  process.exit(1);
});
