// @ts-check
const path = require('path');

const MOCK = path.join(__dirname, 'firebase-mock.js');
const APP = '/horofi-v11-9-29.html';

/* يفتح التطبيق الحقيقي مع:
   - استبدال سكربتات Firebase بالمحاكي
   - حجب كل طلب خارجي آخر (خطوط، ElevenLabs، Formspree…) كي لا يعتمد الاختبار على الشبكة
   - قبول كل نوافذ confirm/alert تلقائياً (logoutUser تستخدم confirm)
   - تهيئة localStorage قبل تنفيذ أي سكربت في الصفحة عبر seed() */
async function openApp(page, { seed } = {}) {
  // ترتيب التسجيل مهم: Playwright يطابق آخر مسجَّل أولاً
  await page.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await page.route(/firebasejs\/.*\.js$/, r => r.fulfill({ body: '', contentType: 'application/javascript' }));
  await page.route(/firebasejs\/.*firebase-app-compat\.js$/, r => r.fulfill({ path: MOCK, contentType: 'application/javascript' }));

  page.on('dialog', d => d.accept());

  if (seed) {
    await page.addInitScript((entries) => {
      Object.entries(entries).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
    }, seed);
  }

  await page.goto(APP);
  await page.waitForFunction(() => typeof window.nav === 'function' && !!window.__fb);
}

const activeScreen = (page) => page.evaluate(() => document.querySelector('.screen.active')?.id ?? null);

async function waitForScreen(page, id, timeout = 5000) {
  await page.waitForFunction((want) => document.querySelector('.screen.active')?.id === want, id, { timeout });
}

/* يُطلق onAuthStateChanged بمستخدم (أو null) وينتظر أن يستقرّ التوجيه على شاشة */
async function signInAs(page, userProps, expectScreen) {
  await page.evaluate((props) => window.__fb.setUser(props ? window.__fb.mkUser(props) : null), userProps);
  if (expectScreen) await waitForScreen(page, expectScreen);
}

/* ملاحظة: متغيّرات التطبيق العليا مُعلَنة بـ let/const فلا تظهر على window —
   لكنها في النطاق العام للصفحة، فنقرؤها بأسمائها المجرّدة داخل evaluate */
const state = (page) => page.evaluate(() => ({
  screen: document.querySelector('.screen.active')?.id ?? null,
  /* eslint-disable no-undef */
  uid: CURRENT_UID,
  profileName: PROFILE.name,
  children: CHILDREN.map(c => ({ id: c.id, name: c.name })),
  activeChild: ACTIVE_CHILD_ID,
  completed: [...completedLetters],
  subscribed: isSubscribed,
  /* eslint-enable no-undef */
  greeting: document.getElementById('homeGreeting')?.textContent ?? '',
  backBtn: document.getElementById('loginBackBtn')?.style.display,
  guestSec: document.getElementById('guestSection')?.style.display,
  ls: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])),
}));

module.exports = { openApp, activeScreen, waitForScreen, signInAs, state };
