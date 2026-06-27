#!/usr/bin/env python3
"""
horofi_tts.py
=============
سكريبت لتحويل جمل تطبيق حروفي إلى صوت عبر ElevenLabs API
يدعم:
  - الجمل الثابتة من WORD_SENTENCES (1276 جملة)
  - جمل المديح الديناميكية (مع اسم الطفل)
  - التحقق من الملفات الموجودة لتفادي إعادة الطلب

الاستخدام:
  python3 horofi_tts.py --html horofi-v11-9-29.html --out audio --key YOUR_API_KEY
  python3 horofi_tts.py --html horofi-v11-9-29.html --out audio --key YOUR_API_KEY --names محمد فاطمة علي
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

# ─── إعدادات ElevenLabs ───────────────────────────────────────────────────────
VOICE_ID        = "EXAVITQu4vr4xnSDxMaL"   # Sara (عربي)
MODEL_ID        = "eleven_multilingual_v2"
STABILITY       = 0.5
SIMILARITY      = 0.85
STYLE           = 0.0
SPEAKER_BOOST   = True
API_BASE        = "https://api.elevenlabs.io/v1"
REQUESTS_PER_MIN = 30   # حد ElevenLabs المجاني
DELAY_BETWEEN   = 60 / REQUESTS_PER_MIN  # ثانيتان بين كل طلب

# ─── استخراج البيانات ─────────────────────────────────────────────────────────

def extract_sentences(html_path: str) -> dict[str, str]:
    """استخراج WORD_SENTENCES من ملف HTML"""
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()
    m = re.search(r'const WORD_SENTENCES = \{(.*?)\};', content, re.DOTALL)
    if not m:
        sys.exit("❌ لم يُوجد WORD_SENTENCES في الملف")
    pairs = re.findall(r'"([^"]+)":\s*"([^"]+)"', m.group(1))
    return {k: v for k, v in pairs}


def build_name_sentences(names: list[str]) -> dict[str, str]:
    """
    بناء جمل المديح الديناميكية لكل اسم.
    كل اسم يحصل على النسختين: ذكر وأنثى.
    المفتاح: "praise_male_محمد_1" أو "praise_female_فاطمة_1"
    """
    # جمل المديح الثابتة (بدون إيموجي)
    praise_male = [
        "أَحْسَنْتَ يَا {name}",
        "رَائِعٌ يَا {name}، اِسْتَمِرَّ هَكَذَا",
        "مَا شَاءَ اللهُ يَا {name}، أَنْتَ نَجْمٌ مُتَأَلِّقٌ",
        "مُذْهِلٌ يَا {name}، لَا أَحَدَ يَسْتَطِيعُ إِيقَافَكَ",
        "يَا لَكَ مِنْ عَبْقَرِيٍّ خَطِيرٍ يَا {name}، أَحْسَنْتَ الْإِجَابَةَ",
        "أَعْتَقِدُ أَنَّكَ أَكَلْتَ الْفُولَ بِاللَّبَنِ الْيَوْمَ يَا {name}",
        "لَا بَأْسَ يَا {name}، اِنْتَبِهْ لِلْخَطَأِ وَصَحِّحْ فِي الْأَسْئِلَةِ التَّالِيَةِ",
        "هَيَّا يَا {name}، أَخْبِرْ أَبَوَيْكَ مَاذَا فَهِمْتَ",
        "إِسْتَمِعْ لِهَذِهِ الْجُمْلَةِ يَا {name} الْمُجْتَهِدَ",
        "أَهْلاً يَا {name} الْمُجْتَهِدُ",
    ]
    praise_female = [
        "أَحْسَنْتِ يَا {name}",
        "رَائِعَةٌ يَا {name}، اِسْتَمِرِّي هَكَذَا",
        "مَا شَاءَ اللهُ يَا {name}، أَنْتِ نَجْمَةٌ مُتَأَلِّقَةٌ",
        "مُذْهِلَةٌ يَا {name}، لَا أَحَدَ يَسْتَطِيعُ إِيقَافَكِ",
        "يَا لَكِ مِنْ عَبْقَرِيَّةٍ خَطِيرَةٍ يَا {name}، أَحْسَنْتِ الْإِجَابَةَ",
        "أَعْتَقِدُ أَنَّكِ أَكَلْتِ الْفُولَ بِاللَّبَنِ الْيَوْمَ يَا {name}",
        "لَا بَأْسَ يَا {name}، اِنْتَبِهِي لِلْخَطَأِ وَصَحِّحِي فِي الْأَسْئِلَةِ التَّالِيَةِ",
        "هَيَّا يَا {name}، أَخْبِرِي أَبَوَيْكِ مَاذَا فَهِمْتِ",
        "إِسْتَمِعِي لِهَذِهِ الْجُمْلَةِ يَا {name} الْمُجْتَهِدَةُ",
        "أَهْلاً يَا {name} الْمُجْتَهِدَةُ",
    ]

    result = {}
    for name in names:
        for i, tmpl in enumerate(praise_male, 1):
            key = f"praise_male_{name}_{i}"
            result[key] = tmpl.format(name=name)
        for i, tmpl in enumerate(praise_female, 1):
            key = f"praise_female_{name}_{i}"
            result[key] = tmpl.format(name=name)
    return result


# ─── ElevenLabs API ───────────────────────────────────────────────────────────

def tts_request(text: str, api_key: str) -> bytes:
    """إرسال طلب TTS إلى ElevenLabs وإرجاع بيانات MP3"""
    url = f"{API_BASE}/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": STABILITY,
            "similarity_boost": SIMILARITY,
            "style": STYLE,
            "use_speaker_boost": SPEAKER_BOOST,
        },
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    if resp.status_code == 200:
        return resp.content
    elif resp.status_code == 429:
        raise RuntimeError("RATE_LIMIT")
    else:
        raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:200]}")


def safe_filename(key: str) -> str:
    """تحويل المفتاح إلى اسم ملف آمن"""
    # للجمل العربية: نستخدم المفتاح كما هو (unicode آمن على Linux/Mac)
    # نزيل فقط الأحرف غير الآمنة
    name = re.sub(r'[\\/:*?"<>|]', '_', key)
    return name + ".mp3"


# ─── المعالجة الرئيسية ────────────────────────────────────────────────────────

def process_batch(items: dict[str, str], out_dir: Path, api_key: str,
                  label: str, dry_run: bool = False, regen: list = []):
    """معالجة مجموعة من النصوص وحفظها كملفات MP3"""
    total     = len(items)
    skipped   = 0
    done      = 0
    errors    = []

    print(f"\n{'─'*60}")
    print(f"📦 {label}: {total} عنصر")
    if regen:
        print(f"🔄 إعادة توليد: {', '.join(regen)}")
    print(f"{'─'*60}")

    for i, (key, text) in enumerate(items.items(), 1):
        fname    = safe_filename(key)
        fpath    = out_dir / fname
        progress = f"[{i:4d}/{total}]"

        # إذا كانت الكلمة في قائمة regen → احذف الملف القديم وأعد التوليد
        if regen and key in regen:
            if fpath.exists():
                fpath.unlink()
                print(f"{progress} 🔄 {key[:40]} (حذف القديم)")

        # تخطي الموجود مسبقاً (ما لم يكن في regen)
        if fpath.exists() and fpath.stat().st_size > 500:
            skipped += 1
            print(f"{progress} ⏭  {key[:40]}")
            continue

        if dry_run:
            print(f"{progress} 🔍 [DRY] {key[:40]} → {fname}")
            done += 1
            continue

        # إرسال الطلب مع إعادة المحاولة
        attempt = 0
        while attempt < 3:
            try:
                audio = tts_request(text, api_key)
                fpath.write_bytes(audio)
                done += 1
                print(f"{progress} ✅ {key[:40]} ({len(audio)//1024}KB)")
                break
            except RuntimeError as e:
                if "RATE_LIMIT" in str(e):
                    wait = 60 + attempt * 30
                    print(f"{progress} ⏳ rate limit — انتظار {wait}s")
                    time.sleep(wait)
                    attempt += 1
                else:
                    errors.append((key, str(e)))
                    print(f"{progress} ❌ {key[:30]}: {e}")
                    break
            except Exception as e:
                errors.append((key, str(e)))
                print(f"{progress} ❌ {key[:30]}: {e}")
                break

        # تأخير بين الطلبات
        if not dry_run:
            time.sleep(DELAY_BETWEEN)

    print(f"\n{'─'*60}")
    print(f"✅ مكتمل: {done}  |  ⏭  متخطى: {skipped}  |  ❌ أخطاء: {len(errors)}")
    if errors:
        print("الأخطاء:")
        for k, e in errors:
            print(f"  • {k}: {e}")
    return done, skipped, errors


# ─── نقطة الدخول ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="تحويل جمل حروفي إلى صوت عبر ElevenLabs"
    )
    parser.add_argument("--html",  required=True,  help="مسار ملف horofi HTML")
    parser.add_argument("--out",   default="audio", help="مجلد الحفظ (افتراضي: audio)")
    parser.add_argument("--key",   required=True,  help="ElevenLabs API Key")
    parser.add_argument("--names", nargs="*", default=[],
                        help="أسماء الأطفال لتوليد جمل المديح (مثل: محمد فاطمة)")
    parser.add_argument("--only",  choices=["sentences","names","all"], default="all",
                        help="ما الذي تريد معالجته (افتراضي: all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="معاينة فقط بدون إرسال طلبات API")
    parser.add_argument("--filter", default="",
                        help="معالجة الكلمات التي تحتوي هذا النص فقط (للاختبار)")
    parser.add_argument("--regen", nargs="*", default=[],
                        help="إعادة توليد كلمات محددة فقط (تستبدل ملفاتها القديمة)")

    args = parser.parse_args()

    # إنشاء مجلدات الإخراج
    out_dir       = Path(args.out)
    sentences_dir = out_dir / "sentences"
    names_dir     = out_dir / "names"
    sentences_dir.mkdir(parents=True, exist_ok=True)
    names_dir.mkdir(parents=True, exist_ok=True)

    print(f"""
╔══════════════════════════════════════════════════════════╗
║           حروفي TTS — ElevenLabs (Sara)                 ║
╠══════════════════════════════════════════════════════════╣
║  الملف  : {args.html:<45} ║
║  المجلد : {args.out:<45} ║
║  الوضع  : {('معاينة فقط' if args.dry_run else ('regen: '+','.join(args.regen)) if args.regen else 'تشغيل فعلي'):<45} ║
╚══════════════════════════════════════════════════════════╝
""")

    total_done = 0
    total_skip = 0
    total_err  = []

    # ── الجمل الثابتة ──
    if args.only in ("sentences", "all"):
        sentences = extract_sentences(args.html)
        if args.filter:
            sentences = {k: v for k, v in sentences.items() if args.filter in k or args.filter in v}
        d, s, e = process_batch(sentences, sentences_dir, args.key,
                                 "الجمل التعليمية", dry_run=args.dry_run, regen=args.regen)
        total_done += d; total_skip += s; total_err += e

    # ── جمل الأسماء ──
    if args.only in ("names", "all") and args.names:
        name_items = build_name_sentences(args.names)
        d, s, e = process_batch(name_items, names_dir, args.key,
                                 f"جمل الأسماء ({', '.join(args.names)})",
                                 dry_run=args.dry_run)
        total_done += d; total_skip += s; total_err += e
    elif args.only in ("names", "all") and not args.names:
        print("\n⚠️  لم تحدد أسماء الأطفال. استخدم --names محمد فاطمة ...")

    # ── ملخص نهائي ──
    print(f"""
╔══════════════════════════════════════════════════════════╗
║                    الملخص النهائي                       ║
╠══════════════════════════════════════════════════════════╣
║  ✅ مكتمل  : {total_done:<44} ║
║  ⏭  متخطى  : {total_skip:<44} ║
║  ❌ أخطاء  : {len(total_err):<44} ║
║  📁 المجلد : {str(out_dir.resolve()):<44} ║
╚══════════════════════════════════════════════════════════╝
""")

    # حفظ تقرير الأخطاء
    if total_err:
        report = out_dir / "errors.json"
        report.write_text(json.dumps(
            [{"key": k, "error": e} for k, e in total_err],
            ensure_ascii=False, indent=2
        ), encoding='utf-8')
        print(f"📄 تقرير الأخطاء محفوظ في: {report}")

    # حفظ فهرس الملفات
    index = {
        "sentences": {k: f"sentences/{safe_filename(k)}"
                      for k in extract_sentences(args.html)},
        "names": {k: f"names/{safe_filename(k)}"
                  for k in (build_name_sentences(args.names) if args.names else {})}
    }
    index_path = out_dir / "index.json"
    index_path.write_text(
        json.dumps(index, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    print(f"📋 فهرس الملفات محفوظ في: {index_path}")


if __name__ == "__main__":
    main()
