#!/usr/bin/env python3
"""
horofi_tts_questions.py — توليد ملفات MP3 لجمل الأسئلة والشارات
الاستخدام:
    py horofi_tts_questions.py --key YOUR_KEY --out audio
    py horofi_tts_questions.py --key YOUR_KEY --out audio --skip-existing
"""

import os
import argparse
import requests
import time

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Sara
MODEL    = "eleven_multilingual_v2"
VOICE_SETTINGS = {
    "stability": 0.85,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": False,
}

# ── الحروف الـ 28 ──
LETTERS = [
    ("ب", "الْبَاء"),
    ("ت", "التَّاء"),
    ("ث", "الثَّاء"),
    ("ج", "الْجِيم"),
    ("ح", "الْحَاء"),
    ("خ", "الْخَاء"),
    ("د", "الدَّال"),
    ("ذ", "الذَّال"),
    ("ر", "الرَّاء"),
    ("ز", "الزَّاي"),
    ("س", "السِّين"),
    ("ش", "الشِّين"),
    ("ص", "الصَّاد"),
    ("ض", "الضَّاد"),
    ("ط", "الطَّاء"),
    ("ظ", "الظَّاء"),
    ("ع", "الْعَيْن"),
    ("غ", "الْغَيْن"),
    ("ف", "الْفَاء"),
    ("ق", "الْقَاف"),
    ("ك", "الْكَاف"),
    ("ل", "اللاَّم"),
    ("م", "الْمِيم"),
    ("ن", "النُّون"),
    ("ه", "الْهَاء"),
    ("و", "الْوَاو"),
    ("ي", "الْيَاء"),
    ("ا", "الْأَلِف"),
]

# الحروف غير المتصلة (لها سؤال خاص)
NON_CONNECTING = {"د", "ذ", "ر", "ز", "و", "ا"}

# ── مواضع الحرف ──
POSITIONS = {
    "ini": "فِي بِدَايَة الْكَلِمَة",
    "med": "فِي وَسَط الْكَلِمَة",
    "fin": "فِي نِهَايَة الْكَلِمَة",
    "iso": "مُنْفَرِدَة",
}

# ── أصوات الشارات ──
BADGES = {
    "badges/first_correct": "أَحْسَنْتَ! حَصَلْتَ عَلَى أُولَى شَارَاتِك",
    "badges/streak_5":      "رَائِع! خَمْسُ إِجَابَاتٍ صَحِيحَة مُتَتَالِيَة",
    "badges/streak_10":     "مُمْتَاز! سِلْسِلَةٌ ذَهَبِيَّة مِنْ عَشْرِ إِجَابَاتٍ",
    "badges/letter_3":      "أَتْقَنْتَ ثَلَاثَةَ حُرُوف! بِدَايَةٌ رَائِعَة",
    "badges/letter_7":      "سُبْحَانَ اللهُ! أَتْقَنْتَ سَبْعَةَ حُرُوف",
    "badges/letter_14":     "مَاشَاءَ اللهُ! أَتْقَنْتَ نِصْفَ الْحُرُوفِ الْعَرَبِيَّة",
    "badges/letter_28":     "مَبْرُوك! أَتْقَنْتَ جَمِيعَ الْحُرُوفِ الثَّمَانِيَةِ وَالْعِشْرِين",
    "badges/accuracy_90":   "أَنْتَ الْمُتْقِنُ الدَّقِيق! دِقَّةُ إِجَابَاتِكَ فَوْقَ التِّسْعِين",
    "badges/sessions_7":    "مَاشَاءَ اللهُ! مُوَاظِبٌ كُلَّ أُسْبُوع",
    "badges/points_100":    "مِئَةُ نُقْطَة! هَكَذَا يُبْدِعُ الْمُتَعَلِّم",
}


def build_phrases():
    phrases = {}

    for char, name in LETTERS:
        is_non_conn = char in NON_CONNECTING

        for pos_key, pos_text in POSITIONS.items():
            # الحروف غير المتصلة لا تظهر في وسط الكلمة متصلة
            if is_non_conn and pos_key == "med":
                # نوع واحد فقط (بدون تمييز متصل/غير متصل)
                text = f"اِخْتَرِ {name} الصَّحِيحَة — {pos_text}"
                safe = char.encode('ascii', errors='replace').decode()
                key = f"questions/{char}_{pos_key}"
                phrases[key] = text
            elif not is_non_conn and pos_key != "iso":
                # متصل بعد حرف متصل
                text = f"اِخْتَرِ {name} الصَّحِيحَة — {pos_text}، بَعْدَ حَرْفٍ مُتَّصِل"
                key = f"questions/{char}_{pos_key}_c"
                phrases[key] = text
                # متصل بعد حرف غير متصل
                text2 = f"اِخْتَرِ {name} الصَّحِيحَة — {pos_text}، بَعْدَ حَرْفٍ مُنْفَصِل"
                key2 = f"questions/{char}_{pos_key}_n"
                phrases[key2] = text2
            else:
                text = f"اِخْتَرِ {name} الصَّحِيحَة — {pos_text}"
                key = f"questions/{char}_{pos_key}"
                phrases[key] = text

    # أصوات الشارات
    phrases.update(BADGES)
    return phrases


def generate_mp3(text, key, out_path):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    body = {
        "text": text,
        "model_id": MODEL,
        "voice_settings": VOICE_SETTINGS,
    }
    try:
        r = requests.post(url, json=body, headers=headers, timeout=30)
        if r.status_code == 200:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(r.content)
            return True
        else:
            print(f"  ✗ خطأ {r.status_code}: {r.text[:100]}")
            return False
    except Exception as e:
        print(f"  ✗ استثناء: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="توليد MP3 أسئلة وشارات حروفي")
    parser.add_argument("--key",  required=True, help="مفتاح ElevenLabs API")
    parser.add_argument("--out",  default="audio", help="مجلد الإخراج (افتراضي: audio)")
    parser.add_argument("--skip-existing", action="store_true", help="تخطّى الملفات الموجودة")
    args = parser.parse_args()

    phrases = build_phrases()
    total = len(phrases)
    done = skipped = failed = 0

    print(f"\n▶ توليد {total} ملف MP3 للأسئلة والشارات ...\n")

    for rel_path, text in phrases.items():
        out_path = os.path.join(args.out, rel_path + ".mp3")

        if args.skip_existing and os.path.exists(out_path):
            print(f"  ⏭  {rel_path}.mp3")
            skipped += 1
            continue

        print(f"  ⏳ {rel_path}.mp3")
        print(f"     «{text}»")
        ok = generate_mp3(text, args.key, out_path)
        if ok:
            size_kb = os.path.getsize(out_path) // 1024
            print(f"  ✓  ({size_kb} KB)\n")
            done += 1
        else:
            failed += 1
            print()

        time.sleep(0.5)

    print(f"{'='*55}")
    print(f"✅ اكتمل: {done} جديد | {skipped} مخطّى | {failed} فشل")
    print(f"{'='*55}")
    print(f"\n  audio/questions/   ← جمل الأسئلة")
    print(f"  audio/badges/      ← أصوات الشارات\n")


if __name__ == "__main__":
    main()
