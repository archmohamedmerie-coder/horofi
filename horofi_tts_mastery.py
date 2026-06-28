#!/usr/bin/env python3
"""
horofi_tts_mastery.py — توليد ملفات MP3 لجملة إتقان الحرف
الاستخدام:
    py horofi_tts_mastery.py --key YOUR_KEY --out audio
"""
import os, argparse, requests, time

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
MODEL    = "eleven_multilingual_v2"
VOICE_SETTINGS = {"stability":0.85,"similarity_boost":0.75,"style":0.0,"use_speaker_boost":False}

PHRASES = {
    "mastery/mastery_m": "أَبْدَعْتَ أَيُّهَا الرَّائِع! لَقَدْ أَتْقَنْتَ هَذَا الْحَرْف",
    "mastery/mastery_f": "أَبْدَعْتِ أَيَّتُهَا الرَّائِعَة! لَقَدْ أَتْقَنْتِ هَذَا الْحَرْف",
}

def generate_mp3(text, key, out_path):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    body = {"text": text, "model_id": MODEL, "voice_settings": VOICE_SETTINGS}
    try:
        r = requests.post(url, json=body, headers=headers, timeout=30)
        if r.status_code == 200:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f: f.write(r.content)
            return True
        else:
            print(f"  ✗ {r.status_code}: {r.text[:100]}")
            return False
    except Exception as e:
        print(f"  ✗ {e}")
        return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", required=True)
    parser.add_argument("--out", default="audio")
    args = parser.parse_args()
    for rel_path, text in PHRASES.items():
        out_path = os.path.join(args.out, rel_path + ".mp3")
        print(f"  ⏳ {rel_path}.mp3 ← «{text}»")
        ok = generate_mp3(text, args.key, out_path)
        if ok: print(f"  ✓  ({os.path.getsize(out_path)//1024} KB)")
        time.sleep(0.5)
    print("\n✅ اكتمل — audio/mastery/mastery_m.mp3 + mastery_f.mp3")

if __name__ == "__main__":
    main()
