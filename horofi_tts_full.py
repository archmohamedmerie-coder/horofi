#!/usr/bin/env python3
"""
horofi_tts_full.py — توليد ملفات MP3 كاملة بدون اسم الطفل
الاستخدام:
    py horofi_tts_full.py --key YOUR_KEY --out audio
    py horofi_tts_full.py --key YOUR_KEY --out audio --skip-existing
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

PHRASES = {
    # ── الترحيب ──
    "welcome/welcome_m": "أَهْلاً أَيُّهَا التِّلْمِيذُ الْمُجْتَهِدُ",
    "welcome/welcome_f": "أَهْلاً أَيَّتُهَا التِّلْمِيذَةُ الْمُجْتَهِدَةُ",

    # ── التهنئة — 5 مستويات ──
    "praise/praise_m_1_full": "أَحْسَنْتَ أَيُّهَا التِّلْمِيذُ الْمُجْتَهِد",
    "praise/praise_f_1_full": "أَحْسَنْتِ أَيَّتُهَا التِّلْمِيذَةُ الْمُجْتَهِدَة",

    "praise/praise_m_2_full": "رَائِع أَيُّهَا التِّلْمِيذُ! اِسْتَمِرَّ هَكَذَا",
    "praise/praise_f_2_full": "رَائِعَة أَيَّتُهَا التِّلْمِيذَة! اِسْتَمِرِّي هَكَذَا",

    "praise/praise_m_3_full": "مَا شَاءَ اللهُ! أَنْتَ نَجْمٌ مُتَأَلِّق",
    "praise/praise_f_3_full": "مَا شَاءَ اللهُ! أَنْتِ نَجْمَةٌ مُتَأَلِّقَة",

    "praise/praise_m_4_full": "مُذْهِل! لَا أَحَدَ يَسْتَطِيعُ إِيقَافَك",
    "praise/praise_f_4_full": "مُذْهِلَة! لَا أَحَدَ يَسْتَطِيعُ إِيقَافَكِ",

    "praise/praise_m_5_full": "يَالَكَ مِنْ عَبْقَرِيٍّ خَطِير! أَحْسَنْتَ الْإِجَابَة",
    "praise/praise_f_5_full": "يَالَكِ مِنْ عَبْقَرِيَّةٍ خَطِيرَة! أَحْسَنْتِ الْإِجَابَة",

    # ── الخطأ ──
    "wrong/wrong_m_1_full": "لَا بَأْسَ أَيُّهَا التِّلْمِيذُ، اِنْتَبِهْ لِلْخَطَأ وَصَحِّحْ فِي الْأَسْئِلَةِ التَّالِيَة",
    "wrong/wrong_f_1_full": "لَا بَأْسَ أَيَّتُهَا التِّلْمِيذَة، اِنْتَبِهِي لِلْخَطَأ وَصَحِّحِي فِي الْأَسْئِلَةِ التَّالِيَة",

    "wrong/wrong_m_2_full": "أَعْتَقِدُ أَنَّكَ أَكَلْتَ الْفُولَ بِاللَّبَنِ الْيَوْم",
    "wrong/wrong_f_2_full": "أَعْتَقِدُ أَنَّكِ أَكَلْتِ الْفُولَ بِاللَّبَنِ الْيَوْم",

    # ── المقدمة ──
    "intro/intro_m_full": "اِسْتَمِعْ لِهَذِهِ الْجُمْلَة",
    "intro/intro_f_full": "اِسْتَمِعِي لِهَذِهِ الْجُمْلَة",
}


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
            print(f"  ✗ خطأ {r.status_code}: {r.text[:120]}")
            return False
    except Exception as e:
        print(f"  ✗ استثناء: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="توليد MP3 كاملة لحروفي بدون اسم")
    parser.add_argument("--key",  required=True, help="مفتاح ElevenLabs API")
    parser.add_argument("--out",  default="audio", help="مجلد الإخراج (افتراضي: audio)")
    parser.add_argument("--skip-existing", action="store_true", help="تخطّى الملفات الموجودة")
    args = parser.parse_args()

    total = len(PHRASES)
    done = skipped = failed = 0

    print(f"\n▶ توليد {total} ملف MP3 كامل بدون اسم ...\n")
    print(f"  إعدادات: stability=0.85  style=0.0  speaker_boost=False\n")

    for rel_path, text in PHRASES.items():
        out_path = os.path.join(args.out, rel_path + ".mp3")

        if args.skip_existing and os.path.exists(out_path):
            print(f"  ⏭  {rel_path}.mp3 (موجود)")
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
    print(f"\nالملفات المُنشأة في:")
    print(f"  audio/welcome/   ← 2 ملف ترحيب")
    print(f"  audio/praise/    ← 10 ملفات تهنئة كاملة")
    print(f"  audio/wrong/     ← 4 ملفات خطأ كاملة")
    print(f"  audio/intro/     ← 2 ملفات مقدمة\n")


if __name__ == "__main__":
    main()
