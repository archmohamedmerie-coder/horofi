#!/usr/bin/env python3
"""
horofi_tts_questions3.py — توليد الملفات الناقصة:
  1. ini.mp3 لكل حرف متصل (بداية الكلمة بدون تفريق)
  2. special.mp3 لكل حرف غير متصل (جملة واحدة للمكانين)
الاستخدام:
    py horofi_tts_questions3.py --key YOUR_KEY --out audio
"""
import os, argparse, requests, time

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
MODEL    = "eleven_multilingual_v2"
VOICE_SETTINGS = {"stability":0.85,"similarity_boost":0.75,"style":0.0,"use_speaker_boost":False}

CONNECTING = [
    ("ب","الْبَاءَ"),("ت","التَّاءَ"),("ث","الثَّاءَ"),("ج","الْجِيمَ"),
    ("ح","الْحَاءَ"),("خ","الْخَاءَ"),("س","السِّينَ"),("ش","الشِّينَ"),
    ("ص","الصَّادَ"),("ض","الضَّادَ"),("ط","الطَّاءَ"),("ظ","الظَّاءَ"),
    ("ع","الْعَيْنَ"),("غ","الْغَيْنَ"),("ف","الْفَاءَ"),("ق","الْقَافَ"),
    ("ك","الْكَافَ"),("ل","اللاَّمَ"),("م","الْمِيمَ"),("ن","النُّونَ"),
    ("ه","الْهَاءَ"),("ي","الْيَاءَ"),
]

NON_CONNECTING = [
    ("د","الدَّالَ","الدَّالَ"),
    ("ذ","الذَّالَ","الذَّالَ"),
    ("ر","الرَّاءَ","الرَّاءَ"),
    ("ز","الزَّايَ","الزَّايَ"),
    ("و","الْوَاوَ","الْوَاوَ"),
    ("ا","الْأَلِفَ","الْأَلِفَ"),
]

def build_phrases():
    phrases = {}
    # 1. بداية الكلمة — جملة واحدة لكل حرف متصل
    for char, name in CONNECTING:
        phrases[f"questions/{char}_ini"] = f"اِخْتَرِ {name} الصَّحِيحَة — فِي بِدَايَة الْكَلِمَة"
    # 2. special — جملة واحدة لكل حرف غير متصل
    for char, name, name2 in NON_CONNECTING:
        phrases[f"questions/{char}_special"] = f"اِخْتَرِ {name} الصَّحِيحَة — وَتَذَكَّرْ أَنَّ {name2} لَا تَتَّصِلُ بِمَا بَعْدَهَا"
    return phrases

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
        print(f"  ✗ {r.status_code}: {r.text[:80]}")
        return False
    except Exception as e:
        print(f"  ✗ {e}"); return False

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", required=True)
    parser.add_argument("--out", default="audio")
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    phrases = build_phrases()
    total = len(phrases)
    done = skipped = failed = 0
    print(f"\n▶ توليد {total} ملف (22 بداية + 6 خاص) ...\n")

    for rel_path, text in phrases.items():
        out_path = os.path.join(args.out, rel_path + ".mp3")
        if args.skip_existing and os.path.exists(out_path):
            print(f"  ⏭  {rel_path}.mp3"); skipped += 1; continue
        print(f"  ⏳ {rel_path}.mp3\n     «{text}»")
        ok = generate_mp3(text, args.key, out_path)
        if ok:
            print(f"  ✓  ({os.path.getsize(out_path)//1024} KB)\n"); done += 1
        else:
            failed += 1
        time.sleep(0.5)

    print(f"{'='*50}")
    print(f"✅ {done} جديد | {skipped} مخطّى | {failed} فشل")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    main()
