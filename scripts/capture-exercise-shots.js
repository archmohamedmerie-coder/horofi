/* يلتقط لقطات حقيقية من التطبيق على محاكي أندرويد لصفحة الهبوط.
   المتطلّبات: المحاكي يعمل، التطبيق (نسخة debug) مفتوح على الشاشة الرئيسية كضيف،
   و adb forward tcp:9222 localabstract:webview_devtools_remote_<pid> مُفعَّل.
   الاستدعاء: node scripts/capture-exercise-shots.js */
const { chromium } = require('@playwright/test');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ADB = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const OUT = path.join(__dirname, '..', 'img');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function screencap(name) {
  const png = execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  fs.writeFileSync(path.join(OUT, name), png);
  console.log('captured', name, png.length, 'bytes');
}
function swipe(x1, y1, x2, y2, ms = 300) { execFileSync(ADB, ['shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(ms)]); }

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => /horofi|صحّح/.test(p.url() + (p.title ? '' : ''))) || ctx.pages()[0];
  console.log('connected to', await page.title());

  const L_BA = await page.evaluate(() => CONNECTING_LETTERS[0].char);
  console.log('letter for writing exercises:', L_BA);

  /* 2) تركيب الكلمة — أول جولة assemble في مرحلة الكتابة لحرف الباء */
  await page.evaluate(() => {
    startWritingOnly(CONNECTING_LETTERS[0]);
    WRI = WROUNDS.findIndex(w => w.kind === 'assemble');
    buildWriteRound();
    window.scrollTo(0, 0);
  });
  await sleep(1200);
  // اختيار الشكل الصحيح لأول حرف كي تبدو اللوحة حيّة (الحرف الأول من الكلمة)
  await page.evaluate(() => {
    const W = WROUNDS[WRI];
    const want = W.letters[0];
    const cards = [...document.querySelectorAll('.asm-panel .asm-card, .asm-panel button, .asm-panel [data-ch]')];
    const c = cards.find(x => (x.dataset.ch || x.textContent.trim())[0] === want) || null;
    if (c) c.click();
  }).catch(() => {});
  await sleep(800);
  screencap('exercise-assemble.png');

  /* 3) الكتابة بالإصبع — أول جولة glyph (تتبّع) */
  await page.evaluate(() => {
    startWritingOnly(CONNECTING_LETTERS[0]);
    WRI = WROUNDS.findIndex(w => w.kind === 'glyph');
    buildWriteRound();
    window.scrollTo(0, 0);
  });
  await sleep(1200);
  // رسم خط قصير على اللوح ليظهر أثر الإصبع
  const box = await page.evaluate(() => { const c = document.getElementById('wCanvas'); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, dpr: window.devicePixelRatio }; });
  const dpr = box.dpr;
  swipe((box.x + box.w * 0.62) * dpr, (box.y + box.h * 0.45) * dpr, (box.x + box.w * 0.40) * dpr, (box.y + box.h * 0.62) * dpr, 350);
  await sleep(800);
  screencap('exercise-trace.png');

  /* 4) تمرين الحروف الستة التي لا تتصل — حرف الدال */
  await page.evaluate(() => {
    const L = NONCONNECTING_LETTERS.find(l => l.char === 'د') || NONCONNECTING_LETTERS[0];
    startSpecialIdentifyLetter(L);
    window.scrollTo(0, 0);
  });
  await sleep(1200);
  screencap('exercise-special.png');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
