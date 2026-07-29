#!/usr/bin/env python3
"""
horofi_tts_result_screens.py — توليد أصوات نصوص شاشات النتائج والاحتفالات
التي كانت مكتوبة على الشاشة لكن بلا صوت إطلاقاً:
  1. شاشة "بطل حروفي" (إتقان الحروف الـ28)
  2. نتيجة الجولة الأولى (شاشة "أنهيتَ جزء التمييز")
  3. النتيجة النهائية — نجاح جزئي (50-99%)
  4. النتيجة النهائية — أقل من 50%
  5. رسالة "اقتربتَ من إتقان الحرف" (غير الإتقان الكامل)

كل النصوص عامة بلا اسم طفل أو اسم حرف (نفس نمط audio/mastery/mastery_m.mp3 الحالي)،
بصيغتَي مذكر ومؤنث (كسرة على التاء في صيغة المؤنث: أحسنتِ، أتقنتِ، اقتربتِ، حاولي).

الاستخدام:
    py horofi_tts_result_screens.py --key YOUR_ELEVENLABS_KEY
    py horofi_tts_result_screens.py --dry-run
"""
import os, sys, argparse, requests, time

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
MODEL    = "eleven_multilingual_v2"
VOICE_SETTINGS = {"stability":0.85,"similarity_boost":0.75,"style":0.0,"use_speaker_boost":False}

PHRASES = {
    "results/champion_m": "بُطُلُ حُرُوفِي! أَتْقَنْتَ جَمِيعَ الْحُرُوفِ الثَّمَانِيَةَ وَالْعِشْرِينَ — أَنْتَ بَطَلٌ حَقِيقِيٌّ يَسْتَحِقُّ كُلَّ الْإِعْجَاب!",
    "results/champion_f": "بَطَلَةُ حُرُوفِي! أَتْقَنْتِ جَمِيعَ الْحُرُوفِ الثَّمَانِيَةَ وَالْعِشْرِينَ — أَنْتِ بَطَلَةٌ حَقِيقِيَّةٌ تَسْتَحِقُّ كُلَّ الْإِعْجَاب!",

    "results/round1_done_m": "أَحْسَنْتَ! أَنْهَيْتَ جُزْءَ التَّمْيِيز، بَقِيَ اخْتِبَارُ الْكِتَابَة",
    "results/round1_done_f": "أَحْسَنْتِ! أَنْهَيْتِ جُزْءَ التَّمْيِيز، بَقِيَ اخْتِبَارُ الْكِتَابَة",

    "results/partial_m": "أَحْسَنْتَ، وَلَكِنْ بَعْضُ الْأَسْئِلَةِ بِحَاجَةٍ إِلَى إِعَادَة",
    "results/partial_f": "أَحْسَنْتِ، وَلَكِنْ بَعْضُ الْأَسْئِلَةِ بِحَاجَةٍ إِلَى إِعَادَة",

    "results/retry_m": "حَاوِلْ مَرَّةً أُخْرَى!",
    "results/retry_f": "حَاوِلِي مَرَّةً أُخْرَى!",

    "results/close_m": "اِقْتَرَبْتَ مِنْ إِتْقَانِ هٰذَا الْحَرْف",
    "results/close_f": "اِقْتَرَبْتِ مِنْ إِتْقَانِ هٰذَا الْحَرْف",
}


def generate_mp3(text, key, out_path):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    body = {"text": text, "model_id": MODEL, "voice_settings": VOICE_SETTINGS}
    try:
        r = requests.post(url, json=body, headers=headers, timeout=30)
        if r.status_code == 200:
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(r.content)
            return True
        print(f"  ✗ {r.status_code}: {r.text[:120]}")
        return False
    except Exception as e:
        print(f"  ✗ {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--key", required=False)
    parser.add_argument("--out", default="audio")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    print(f"عدد الجمل: {len(PHRASES)}\n")
    if args.dry_run:
        for name, text in PHRASES.items():
            print(f"{name}\n   {text}\n")
        return

    if not args.key:
        parser.error("--key مطلوب (أو استخدم --dry-run)")

    done = skipped = failed = 0
    for i, (name, text) in enumerate(PHRASES.items(), 1):
        out_path = os.path.join(args.out, name + ".mp3")
        if os.path.exists(out_path) and not args.force:
            skipped += 1
            continue
        print(f"[{i}/{len(PHRASES)}] {name}")
        if generate_mp3(text, args.key, out_path):
            done += 1
        else:
            failed += 1
        time.sleep(0.35)

    print(f"\n✓ وُلِّد: {done} | تُخُطِّي: {skipped} | فشل: {failed}")


if __name__ == "__main__":
    main()
