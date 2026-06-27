#!/usr/bin/env python3
"""
horofi_tts_static.py — توليد ملفات MP3 الثابتة للتهنئة والخطأ والمقدمة
الاستخدام:
    py horofi_tts_static.py --key YOUR_ELEVENLABS_KEY --out audio
    py horofi_tts_static.py --key YOUR_ELEVENLABS_KEY --out audio --skip-existing
"""

import os
import argparse
import requests
import time

# ── الجمل الثابتة ──
STATIC_PHRASES = {
    # التهنئة (قبل الاسم)
    "praise/praise_m_1": "أَحْسَنْتَ يَا",
    "praise/praise_f_1": "أَحْسَنْتِ يَا",
    "praise/praise_m_2": "رَائِع يَا",
    "praise/praise_f_2": "رَائِعَة يَا",
    "praise/praise_m_3": "مَا شَاءَ اللهُ يَا",
    "praise/praise_f_3": "مَا شَاءَ اللهُ يَا",
    "praise/praise_m_4": "مُذْهِل يَا",
    "praise/praise_f_4": "مُذْهِلَة يَا",
    "praise/praise_m_5": "يَالَكَ مِنْ عَبْقَرِيٍّ خَطِير يَا",
    "praise/praise_f_5": "يَالَكِ مِنْ عَبْقَرِيَّةٍ خَطِيرَة يَا",
    # التهنئة (بعد الاسم) — tier 1 لا شيء
    "praise/praise_m_2b": "اِسْتَمِرَّ هَكَذَا",
    "praise/praise_f_2b": "اِسْتَمِرِّي هَكَذَا",
    "praise/praise_m_3b": "أَنْتَ نَجْمٌ مُتَأَلِّق",
    "praise/praise_f_3b": "أَنْتِ نَجْمَةٌ مُتَأَلِّقَة",
    "praise/praise_m_4b": "لَا أَحَدَ يَسْتَطِيعُ إِيقَافَك",
    "praise/praise_f_4b": "لَا أَحَدَ يَسْتَطِيعُ إِيقَافَكِ",
    "praise/praise_m_5b": "أَحْسَنْتَ الْإِجَابَة",
    "praise/praise_f_5b": "أَحْسَنْتِ الْإِجَابَة",
    # الخطأ (قبل الاسم)
    "wrong/wrong_m_1": "لَا بَأْسَ يَا",
    "wrong/wrong_f_1": "لَا بَأْسَ يَا",
    "wrong/wrong_m_2": "أَعْتَقِدُ أَنَّكَ أَكَلْتَ الْفُولَ بِاللَّبَنِ الْيَوْم يَا",
    "wrong/wrong_f_2": "أَعْتَقِدُ أَنَّكِ أَكَلْتِ الْفُولَ بِاللَّبَنِ الْيَوْم يَا",
    # الخطأ (بعد الاسم)
    "wrong/wrong_m_1b": "اِنْتَبِهْ لِلْخَطَأ وَصَحِّحْ فِي الْأَسْئِلَةِ التَّالِيَة",
    "wrong/wrong_f_1b": "اِنْتَبِهِي لِلْخَطَأ وَصَحِّحِي فِي الْأَسْئِلَةِ التَّالِيَة",
    # المقدمة
    "intro/intro_m": "اِسْتَمِعْ لِهَذِهِ الْجُمْلَةِ يَا",
    "intro/intro_f": "اِسْتَمِعِي لِهَذِهِ الْجُمْلَةِ يَا",
    "intro/intro_suffix_m": "الْمُجْتَهِد",
    "intro/intro_suffix_f": "الْمُجْتَهِدَة",
}

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Sara
MODEL    = "eleven_multilingual_v2"

# إعدادات صوت محسّنة — تمنع الموسيقى والتأثيرات الغريبة
VOICE_SETTINGS = {
    "stability": 0.85,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": False,
}


def generate_mp3(text: str, key: str, out_path: str) -> bool:
    """توليد MP3 واحد عبر ElevenLabs API."""
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
    parser = argparse.ArgumentParser(description="توليد MP3 ثابتة لحروفي")
    parser.add_argument("--key", required=True, help="مفتاح ElevenLabs API")
    parser.add_argument("--out", default="audio", help="مجلد الإخراج (افتراضي: audio)")
    parser.add_argument("--skip-existing", action="store_true", help="تخطّى الملفات الموجودة")
    args = parser.parse_args()

    total   = len(STATIC_PHRASES)
    done    = 0
    skipped = 0
    failed  = 0

    print(f"\n▶ توليد {total} ملف صوتي ثابت ...\n")
    print(f"  إعدادات: stability=0.85  style=0.0  speaker_boost=False\n")

    for rel_path, text in STATIC_PHRASES.items():
        out_path = os.path.join(args.out, rel_path + ".mp3")

        if args.skip_existing and os.path.exists(out_path):
            print(f"  ⏭  {rel_path}.mp3 (موجود)")
            skipped += 1
            continue

        print(f"  ⏳ {rel_path}.mp3  ←  «{text[:35]}»")
        ok = generate_mp3(text, args.key, out_path)
        if ok:
            size_kb = os.path.getsize(out_path) // 1024
            print(f"  ✓  {out_path}  ({size_kb} KB)")
            done += 1
        else:
            failed += 1

        time.sleep(0.5)  # تجنّب rate-limit

    print(f"\n{'='*50}")
    print(f"✅ اكتمل: {done} جديد | {skipped} مخطّى | {failed} فشل")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
