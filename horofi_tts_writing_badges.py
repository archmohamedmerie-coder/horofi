#!/usr/bin/env python3
"""
horofi_tts_writing_badges.py — توليد أصوات شارتي مرحلة الكتابة الجديدتين
(خطّاط الشكل، كاتب الكلمات) لكل حرف من الحروف الـ28 وبكلا الجنسين.

يولّد:
  audio/badges/glyph_master_{char}_m.mp3   audio/badges/glyph_master_{char}_f.mp3
  audio/badges/word_master_{char}_m.mp3    audio/badges/word_master_{char}_f.mp3

النصوص مطابقة تماماً لنص الشارة المعروض في الواجهة (بدون جزء النقاط، ليصلح كنطق طبيعي).
أسماء الحروف مُستخرجة من نفس مصفوفات CONNECTING_LETTERS/NONCONNECTING_LETTERS في
horofi-v11-9-29.html نفسه (عبر أداة تصحيح المتصفح أثناء تطوير هذه الميزة)، فهي مطابقة
حرفياً لما يستخدمه التطبيق في رسائل مثل "أتقنتَ حرف الباء".

الاستخدام:
    py horofi_tts_writing_badges.py --key YOUR_ELEVENLABS_KEY
    py horofi_tts_writing_badges.py --dry-run
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

# (الحرف، اسمه كما يستخدمه التطبيق فعلاً — مطابق حرفياً لمصفوفات CONNECTING_LETTERS/NONCONNECTING_LETTERS)
LETTERS = [
    ("ب","الْبَاء"), ("ت","التَّاء"), ("ث","الثَّاء"), ("ج","الْجِيم"), ("ح","الْحَاء"),
    ("خ","الْخَاء"), ("س","السِّين"), ("ش","الشِّين"), ("ص","الصَّاد"), ("ض","الضَّاد"),
    ("ط","الطَّاء"), ("ظ","الظَّاء"), ("ع","الْعَيْن"), ("غ","الْغَيْن"), ("ف","الْفَاء"),
    ("ق","الْقَاف"), ("ك","الْكَاف"), ("ل","اللاَّم"), ("م","الْمِيم"), ("ن","النُّون"),
    ("ه","الْهَاء"), ("ي","الْيَاء"), ("ا","الْأَلِف"), ("د","الدَّال"), ("ذ","الذَّال"),
    ("ر","الرَّاء"), ("ز","الزَّاي"), ("و","الْوَاو"),
]


def build_phrases():
    phrases = {}
    for char, name in LETTERS:
        phrases[f"badges/glyph_master_{char}_m"] = f"كَتَبْتَ شَكْلَ حَرْفِ {name} بِنَفْسِكَ فِي كُلِّ مَوَاضِعِهِ!"
        phrases[f"badges/glyph_master_{char}_f"] = f"كَتَبْتِ شَكْلَ حَرْفِ {name} بِنَفْسِكِ فِي كُلِّ مَوَاضِعِهِ!"
        phrases[f"badges/word_master_{char}_m"]  = f"كَتَبْتَ كَلِمَاتٍ كَامِلَةً بِحَرْفِ {name} بِنَفْسِكَ!"
        phrases[f"badges/word_master_{char}_f"]  = f"كَتَبْتِ كَلِمَاتٍ كَامِلَةً بِحَرْفِ {name} بِنَفْسِكِ!"
    # مساران عامّان بلا حرف/جنس — احتياط showBadgePopup الأخير (badge.id + '.mp3')
    # لم يوجَدا من قبل؛ محتوى محايد الجنس لأن المسار لا يحمل لاحقة جنس.
    phrases["badges/glyph_master"] = "شَارَةُ خَطَّاطِ الشَّكْلِ!"
    phrases["badges/word_master"]  = "شَارَةُ كَاتِبِ الْكَلِمَاتِ!"
    return phrases


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

    phrases = build_phrases()
    print(f"عدد الجمل: {len(phrases)}  (28 حرفاً × شارتان × جنسان)\n")

    if args.dry_run:
        for name, text in list(phrases.items())[:8]:
            print(f"{name}\n   {text}\n")
        print("...")
        return

    if not args.key:
        parser.error("--key مطلوب (أو استخدم --dry-run)")

    done = skipped = failed = 0
    for i, (name, text) in enumerate(phrases.items(), 1):
        out_path = os.path.join(args.out, name + ".mp3")
        if os.path.exists(out_path) and not args.force:
            skipped += 1
            continue
        print(f"[{i}/{len(phrases)}] {name}")
        if generate_mp3(text, args.key, out_path):
            done += 1
        else:
            failed += 1
        time.sleep(0.35)

    print(f"\n✓ وُلِّد: {done} | تُخُطِّي: {skipped} | فشل: {failed}")


if __name__ == "__main__":
    main()
