#!/usr/bin/env python3
"""
horofi_tts_write.py — توليد أصوات أسئلة مرحلة اختبار الكتابة.

يولّد:
  1. audio/write/{char}_{pos}.mp3  — سؤال كتابة شكل الحرف في كل موضع
     (pos ∈ ini, med_c, med_n, fin_c, fin_n)
  2. audio/write/word_prompt.mp3   — الجملة العامة قبل نطق الكلمة

ملاحظة: أصوات الكلمات نفسها موجودة مسبقاً في audio/words/ ويُعاد استخدامها،
فلا نولّدها هنا.

الاستخدام:
    py horofi_tts_write.py --key YOUR_ELEVENLABS_KEY --out audio
    py horofi_tts_write.py --key ... --dry-run      # عرض الجمل دون توليد
"""
import os, sys, argparse, requests, time

# طرفية ويندوز تستخدم cp1252 افتراضياً ولا تطبع العربية — نُجبرها على UTF-8
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
MODEL    = "eleven_multilingual_v2"
VOICE_SETTINGS = {"stability":0.85,"similarity_boost":0.75,"style":0.0,"use_speaker_boost":False}

# (الحرف، اسمه مَجْروراً، هل يتصل بما بعده)
# الاسم مجرور لأنه مضاف إليه بعد "حَرْفِ" — "اُكْتُبْ شَكْلَ حَرْفِ الْبَاءِ"
LETTERS = [
    ("ا","الْأَلِفِ",False), ("ب","الْبَاءِ",True),  ("ت","التَّاءِ",True),
    ("ث","الثَّاءِ",True),  ("ج","الْجِيمِ",True),  ("ح","الْحَاءِ",True),
    ("خ","الْخَاءِ",True),  ("د","الدَّالِ",False), ("ذ","الذَّالِ",False),
    ("ر","الرَّاءِ",False), ("ز","الزَّايِ",False), ("س","السِّينِ",True),
    ("ش","الشِّينِ",True),  ("ص","الصَّادِ",True),  ("ض","الضَّادِ",True),
    ("ط","الطَّاءِ",True),  ("ظ","الظَّاءِ",True),  ("ع","الْعَيْنِ",True),
    ("غ","الْغَيْنِ",True),  ("ف","الْفَاءِ",True),  ("ق","الْقَافِ",True),
    ("ك","الْكَافِ",True),  ("ل","اللاَّمِ",True),  ("م","الْمِيمِ",True),
    ("ن","النُّونِ",True),  ("ه","الْهَاءِ",True),  ("و","الْوَاوِ",False),
    ("ي","الْيَاءِ",True),
]

# المواضع الخمسة — مطابقة تماماً لـ WRITE_FORM_QUESTIONS في التطبيق
POSITIONS = [
    ("ini",   "فِي بِدَايَةِ الْكَلِمَة"),
    ("med_c", "فِي وَسَطِ الْكَلِمَة بَعْدَ حَرْفٍ مُتَّصِل"),
    ("med_n", "فِي وَسَطِ الْكَلِمَة بَعْدَ حَرْفٍ غَيْرِ مُتَّصِل"),
    ("fin_c", "فِي نِهَايَةِ الْكَلِمَة بَعْدَ حَرْفٍ مُتَّصِل"),
    ("fin_n", "فِي نِهَايَةِ الْكَلِمَة بَعْدَ حَرْفٍ غَيْرِ مُتَّصِل"),
]

# الحروف غير المتصلة: التطبيق يدمج الأسئلة المكررة الشكل ويُبقي موضعين فقط
NON_CONNECTING_POSITIONS = ["ini", "med_c"]


def build_phrases():
    phrases = {}
    for char, name, connects in LETTERS:
        allowed = [p for p, _ in POSITIONS] if connects else NON_CONNECTING_POSITIONS
        for pos, label in POSITIONS:
            if pos not in allowed:
                continue
            phrases[f"write/{char}_{pos}"] = f"تَتَبَّعْ شَكْلَ حَرْفِ {name} {label}"
    phrases["write/word_prompt"] = "تَتَبَّعْ هَذِهِ الْكَلِمَةَ مَوْصُولَة"
    # جولة التجميع بالنقر منفصلة عن التتبّع اليدوي — نصّها على الشاشة لم يتغيّر
    # ("اُكْتُبْ كَلِمَةَ...")، فتحتاج ملفاً مستقلاً بدل مشاركة word_prompt
    phrases["write/assemble_prompt"] = "اُكْتُبْ هَذِهِ الْكَلِمَةَ مَوْصُولَة"
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
    parser.add_argument("--key", required=False, help="مفتاح ElevenLabs")
    parser.add_argument("--out", default="audio", help="مجلد الإخراج (افتراضي: audio)")
    parser.add_argument("--dry-run", action="store_true", help="عرض الجمل فقط دون توليد")
    parser.add_argument("--force", action="store_true", help="إعادة توليد الملفات الموجودة")
    args = parser.parse_args()

    phrases = build_phrases()
    print(f"عدد الجمل: {len(phrases)}\n")

    if args.dry_run:
        for name, text in phrases.items():
            print(f"{name}\n   {text}\n")
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
        time.sleep(0.35)  # تهدئة الطلبات

    print(f"\n✓ وُلِّد: {done} | تُخُطِّي: {skipped} | فشل: {failed}")


if __name__ == "__main__":
    main()
