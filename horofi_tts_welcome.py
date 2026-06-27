#!/usr/bin/env python3
"""
horofi_tts_welcome.py — توليد ملفات MP3 لجملة الترحيب
الاستخدام:
    py horofi_tts_welcome.py --key YOUR_ELEVENLABS_KEY --out audio
"""

import os
import argparse
import requests
import time

WELCOME_PHRASES = {
    "welcome/welcome_pre":      "أَهْلاً يَا",
    "welcome/welcome_suffix_m": "الْمُجْتَهِدُ",
    "welcome/welcome_suffix_f": "الْمُجْتَهِدَةُ",
}

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Sara
MODEL    = "eleven_multilingual_v2"

VOICE_SETTINGS = {
    "stability": 0.85,
    "similarity_boost": 0.75,
    "style": 0.0,
    "use_speaker_boost": False,
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
            print(f"  ✗ خطأ {r.status_code}: {r.text[:100]}")
            return False
    except Exception as e:
        print(f"  ✗ استثناء: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="توليد MP3 جملة الترحيب لحروفي")
    parser.add_argument("--key", required=True, help="مفتاح ElevenLabs API")
    parser.add_argument("--out", default="audio", help="مجلد الإخراج (افتراضي: audio)")
    parser.add_argument("--skip-existing", action="store_true", help="تخطّى الملفات الموجودة")
    args = parser.parse_args()

    print(f"\n▶ توليد {len(WELCOME_PHRASES)} ملفات جملة الترحيب ...\n")

    done = 0
    for rel_path, text in WELCOME_PHRASES.items():
        out_path = os.path.join(args.out, rel_path + ".mp3")

        if args.skip_existing and os.path.exists(out_path):
            print(f"  ⏭  {rel_path}.mp3 (موجود)")
            continue

        print(f"  ⏳ {rel_path}.mp3  ←  «{text}»")
        ok = generate_mp3(text, args.key, out_path)
        if ok:
            size_kb = os.path.getsize(out_path) // 1024
            print(f"  ✓  {out_path}  ({size_kb} KB)")
            done += 1
        time.sleep(0.5)

    print(f"\n{'='*50}")
    print(f"✅ اكتمل: {done} ملف")
    print(f"{'='*50}")
    print(f"\nالملفات المُنشأة:")
    print(f"  audio/welcome/welcome_pre.mp3      ← «أَهْلاً يَا»")
    print(f"  audio/welcome/welcome_suffix_m.mp3 ← «الْمُجْتَهِدُ»")
    print(f"  audio/welcome/welcome_suffix_f.mp3 ← «الْمُجْتَهِدَةُ»\n")


if __name__ == "__main__":
    main()
