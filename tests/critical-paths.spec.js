// @ts-check
/* اختبارات المسارات الحرجة — ستة فقط، كلٌّ منها يمنع خطأً سبّب رفضاً أو تسريباً فعلياً.
   القرار المتفق عليه (06.09.2026): لا إعادة بناء للتطبيق؛ الاختبارات تشغّل الملف
   الحقيقي كما هو وتستدعي دواله مباشرة. */
const { test, expect } = require('@playwright/test');
const { openApp, waitForScreen, signInAs, state } = require('./helpers');

const UID = 'user_A';
const child = (over = {}) => Object.assign(
  { id: 'c1', name: 'سارة', gender: 'female', country: '', nisba_m: '', nisba_f: '', progress: ['ب', 'ت'], stats: { rewardsVersion: 2 } },
  over,
);

/* ─────────────────────────────────────────────────────────────
   1) التوجيه في onAuthStateChanged
   الخطأ الذي يمنعه: الارتداد إلى شاشة التهيئة في كل فتح لمن تخطّاها
   (كان أحد أسباب رفض آبل 5.1.1 الثالث). */
test('1) onAuthStateChanged يوجّه صحيحاً: اسم / تخطّي بلا اسم / لا أطفال / خروج', async ({ page }) => {
  await openApp(page, { seed: {
    [`horofiChildren_${UID}`]: [child()],
    [`horofiActiveChild_${UID}`]: 'c1',
  } });

  // (أ) طفل باسم → الرئيسية، والتحية باسمه
  await signInAs(page, { uid: UID, email: 'a@x.y' }, 'home');
  let s = await state(page);
  expect(s.uid).toBe(UID);
  expect(s.profileName).toBe('سارة');
  expect(s.greeting).toContain('سارة');
  expect(s.completed).toEqual(['ب', 'ت']);

  // (ب) خروج → شاشة الدخول بهيئتها الطبيعية (زر الضيف ظاهر، زر العودة مخفي)
  await signInAs(page, null, 'login');
  s = await state(page);
  expect(s.uid).toBeNull();
  expect(s.backBtn).toBe('none');
  expect(s.guestSec).toBe('');

  // (ج) مستخدم تخطّى التهيئة: طفل محفوظ بلا اسم → الرئيسية لا التهيئة
  await page.evaluate((uid) => {
    localStorage.setItem(`horofiChildren_${uid}`, JSON.stringify([{ id: 'c9', name: '', gender: 'male', progress: [], stats: { rewardsVersion: 2 } }]));
    localStorage.setItem(`horofiActiveChild_${uid}`, 'c9');
  }, 'user_skipped');
  await signInAs(page, { uid: 'user_skipped', isAnonymous: true }, 'home');
  s = await state(page);
  expect(s.profileName).toBe('');
  expect(s.children).toHaveLength(1);

  // (د) مستخدم بلا أي أطفال → التهيئة
  await signInAs(page, null, 'login');
  await signInAs(page, { uid: 'user_fresh', isAnonymous: true }, 'onboarding');
});

/* ─────────────────────────────────────────────────────────────
   2) تنظيف logoutUser() الكامل
   الخطأ الذي يمنعه: تسريب اسم طفل المستخدم السابق إلى المستخدم/الضيف التالي
   على نفس الجهاز عبر PROFILE أو المفتاحين القديمين غير المرتبطين بـuid. */
test('2) logoutUser يمسح كل أثر للطفل السابق ولا يسرّبه للمستخدم التالي', async ({ page }) => {
  /* أُصلح 19.09.2026: saveChildren لا تكتب بلا uid، وlogoutUser/deleteAccount يحذفان المفتاحين القديمين. */
  await openApp(page, { seed: {
    [`horofiChildren_${UID}`]: [child({ name: 'ليلى', progress: ['ب', 'ت', 'ث'] })],
    [`horofiActiveChild_${UID}`]: 'c1',
    // المفتاحان القديمان (بلا uid) — saveProfile تكتبهما كنسخة احتياطية
    horofiProfile: { name: 'ليلى', gender: 'female' },
    horofiProgress: ['ب', 'ت', 'ث'],
  } });
  await signInAs(page, { uid: UID, email: 'a@x.y' }, 'home');
  expect((await state(page)).profileName).toBe('ليلى');

  await page.evaluate(() => logoutUser()); // confirm() تُقبل تلقائياً في helpers
  await waitForScreen(page, 'login');

  const s = await state(page);
  expect(s.uid).toBeNull();
  expect(s.profileName).toBe('');
  expect(s.children).toEqual([]);
  expect(s.activeChild).toBeNull();
  expect(s.completed).toEqual([]);
  expect(s.greeting).not.toContain('ليلى');
  expect(s.ls.horofiProfile).toBeUndefined();
  expect(s.ls.horofiProgress).toBeUndefined();
  // بيانات المستخدم A نفسها تبقى تحت مفتاحه (لا تُحذف — هي حسابه)
  expect(s.ls[`horofiChildren_${UID}`]).toContain('ليلى');

  // ضيف جديد على نفس الجهاز: لا يرث ليلى عبر مسار الترحيل
  await signInAs(page, { uid: 'guest_B', isAnonymous: true }, 'onboarding');
  const t = await state(page);
  expect(t.children).toEqual([]);
  expect(t.profileName).toBe('');
  expect(JSON.stringify(t.ls)).not.toContain(`horofiChildren_guest_B`);
});

/* ─────────────────────────────────────────────────────────────
   3) ترقية الضيف تُبقي نفس الـuid
   الخطأ الذي يمنعه: إنشاء uid جديد عند التسجيل يُفقد الاشتراك المدفوع
   (users/{uid}) وتقدّم الأطفال (المفاتيح المرتبطة بـuid). */
test('3) doRegister لضيف يستخدم linkWithCredential ولا يغيّر الـuid', async ({ page }) => {
  /* أُصلح 19.09.2026: إعادة التوجيه بعد الترقية تفحص CHILDREN.length كما في onAuthStateChanged. */
  await openApp(page);
  await signInAs(page, { uid: 'anon_77', isAnonymous: true }, 'onboarding');
  await page.evaluate(() => skipOnboarding());
  await waitForScreen(page, 'home');
  const before = await state(page);
  expect(before.children).toHaveLength(1);

  await page.evaluate(() => {
    upgradeGuestAccount();
    document.getElementById('regEmail').value = 'parent@example.com';
    document.getElementById('regPass').value = 'Strong#Pass1';
    document.getElementById('regConfirm').value = 'Strong#Pass1';
    doRegister();
  });
  await page.waitForFunction(() => /✅/.test(document.getElementById('regErr').textContent));
  await waitForScreen(page, 'home', 4000); // تعيد التوجيه بعد 1200ms

  const calls = await page.evaluate(() => window.__fb.calls);
  expect(calls.linkWithCredential).toBe(1);
  expect(calls.createUserWithEmailAndPassword).toBe(0);

  const user = await page.evaluate(() => ({ uid: window.__fb.currentUser.uid, anon: window.__fb.currentUser.isAnonymous, email: window.__fb.currentUser.email }));
  expect(user.uid).toBe('anon_77');
  expect(user.anon).toBe(false);
  expect(user.email).toBe('parent@example.com');

  const after = await state(page);
  expect(after.uid).toBe('anon_77');
  expect(after.children).toEqual(before.children); // الطفل نفسه بقي
  expect(await page.evaluate(() => document.getElementById('regErr').textContent)).toContain('تقدّم أطفالك محفوظ');
});

/* ─────────────────────────────────────────────────────────────
   4) بوابة الاشتراك: Firestore هو المرجع لا localStorage
   الخطأ الذي يمنعه: فتح الحروف المدفوعة لمن عبث بـlocalStorage أو لمن انتهى
   اشتراكه بينما الجهاز يحتفظ بقيمة قديمة. */
test('4) isLetterFree لا يمنح وصولاً من localStorage وحده — لقطة Firestore تحكم', async ({ page }) => {
  await openApp(page, { seed: { horofiSubscribed: '1' } }); // قيمة مزوَّرة/قديمة
  expect(await page.evaluate(() => FREE_LETTERS)).toEqual(['ا', 'ب']); // قرار 22.09: الألف والباء

  // لا مستند للمستخدم في Firestore → غير مشترك رغم localStorage
  await signInAs(page, { uid: 'sub_user', email: 's@x.y' }, 'onboarding');
  await page.waitForFunction(() => isSubscribed === false);
  // ا وب مفتوحان، وت أُغلق بقرار 22.09، وع مغلق كبقية الحروف
  expect(await page.evaluate(() => [isLetterFree('ا'), isLetterFree('ب'), isLetterFree('ت'), isLetterFree('ع'), localStorage.getItem('horofiSubscribed')])).toEqual([true, true, false, false, '0']);

  // الخادم يكتب subscribed:false صراحةً → يبقى مغلقاً
  await page.evaluate(() => window.__fb.serverWrite('users/sub_user', { subscribed: false }));
  expect(await page.evaluate(() => isLetterFree('ع'))).toBe(false);

  // الخادم (Cloud Function بعد دفع حقيقي) يكتب subscribed:true → يُفتح
  await page.evaluate(() => window.__fb.serverWrite('users/sub_user', { subscribed: true }));
  await page.waitForFunction(() => isSubscribed === true);
  expect(await page.evaluate(() => isLetterFree('ع'))).toBe(true);

  // انتهى الاشتراك → يُغلق فوراً حتى مع بقاء '1' في localStorage
  await page.evaluate(() => { localStorage.setItem('horofiSubscribed', '1'); window.__fb.serverWrite('users/sub_user', { subscribed: false }); });
  await page.waitForFunction(() => isSubscribed === false);
  expect(await page.evaluate(() => isLetterFree('ع'))).toBe(false);
});

/* ─────────────────────────────────────────────────────────────
   5) skipOnboarding يُنشئ طفلاً بلا اسم ولا يرتدّ للتهيئة عند إعادة الفتح
   الخطأ الذي يمنعه: رفض آبل 5.1.1(v) — إلزام المستخدم ببيانات الطفل. */
test('5) skipOnboarding: طفل بلا اسم، الرئيسية، ولا عودة للتهيئة عند إعادة الفتح', async ({ page }) => {
  await openApp(page);
  await signInAs(page, { uid: 'skipper', isAnonymous: true }, 'onboarding');

  await page.evaluate(() => skipOnboarding());
  await waitForScreen(page, 'home');
  let s = await state(page);
  expect(s.children).toHaveLength(1);
  expect(s.children[0].name).toBe('');
  expect(s.activeChild).toBe(s.children[0].id);
  expect(s.ls[`horofiChildren_skipper`]).toBeDefined();

  // إعادة فتح التطبيق = إعادة إطلاق onAuthStateChanged بنفس المستخدم
  await signInAs(page, null, 'login');
  await signInAs(page, { uid: 'skipper', isAnonymous: true }, 'home');
  s = await state(page);
  expect(s.screen).toBe('home');
  expect(s.children).toHaveLength(1);
});

/* ─────────────────────────────────────────────────────────────
   6) شاشة الدخول لمستخدم مسجَّل: مخرج واضح
   الخطأ الذي يمنعه: الطريق المسدود الذي أوقف مراجع آبل (09.09): ضيف عاد إلى
   شاشة الدخول فلم يجد زر الضيف ولا طريقاً واضحاً للعودة. */
test('6) شاشة الدخول: للمسجَّل زرّ عودة ظاهر وزرّ الضيف مخفي، وللخارج العكس', async ({ page }) => {
  await openApp(page);

  // ضيف داخل التطبيق يفتح شاشة الدخول للترقية
  await signInAs(page, { uid: 'g1', isAnonymous: true }, 'onboarding');
  await page.evaluate(() => upgradeGuestAccount());
  await waitForScreen(page, 'login');
  let s = await state(page);
  expect(s.backBtn).toBe('block');
  expect(s.guestSec).toBe('none');
  const backText = await page.evaluate(() => document.getElementById('loginBackBtn').innerText);
  expect(backText).toContain('العودة إلى التطبيق');
  expect(backText).toContain('Back to the app');
  // الزر يعيده فعلاً إلى التطبيق
  await page.evaluate(() => document.getElementById('loginBackBtn').click());
  await waitForScreen(page, 'home');

  // زر الرجوع في الجهاز من شاشة الدخول لمسجَّل يعيده أيضاً ولا يُخرجه
  await page.evaluate(() => { nav('login'); handleHardwareBack(); });
  await waitForScreen(page, 'home');

  // بعد الخروج: زر الضيف يعود والعودة تختفي
  await signInAs(page, null, 'login');
  s = await state(page);
  expect(s.backBtn).toBe('none');
  expect(s.guestSec).toBe('');
});

/* ─────────────────────────────────────────────────────────────
   7) حساب واحد على جهازين: لا يُفقَد التقدّم الأحدث
   الشبهة (11.09): pullChildrenFromCloud تُفضّل المحلي على السحابي متى وُجد
   الاثنان وتكتبه فوق السحابة بلا مقارنة — فجهاز قديم يُعيد تقدّماً أقدم
   فوق الأحدث، ثم يرث أي جهاز جديد النسخة الناقصة.
   كل «جهاز» سياق متصفح مستقل (localStorage منفصل)؛ السحابة تُنقَل بينها يدوياً
   لأن المحاكي في الذاكرة لكل صفحة. */
test('7) جهازان بحساب واحد: الجهاز القديم لا يمحو تقدّم الجهاز الأحدث', async ({ browser }) => {
  /* أُصلح 19.09.2026: pullChildrenFromCloud تدمج الجهتين بمبدأ «لا يُنقص أبداً» (mergeChildrenLists). */
  const FIVE = ['ب', 'ت', 'ث', 'ج', 'ح'];
  const cloudPath = `users/${UID}`;

  // الجهاز A: الطفل أنجز خمسة أحرف، ورُفعت للسحابة
  const ctxA = await browser.newContext({ locale: 'ar' });
  const pageA = await ctxA.newPage();
  await openApp(pageA, { seed: { [`horofiChildren_${UID}`]: [child({ progress: FIVE })], [`horofiActiveChild_${UID}`]: 'c1' } });
  await signInAs(pageA, { uid: UID, email: 'a@x.y' }, 'home');
  expect((await state(pageA)).completed).toEqual(FIVE);
  await pageA.waitForFunction((p) => !!window.__fb.store[p]?.childrenData, cloudPath);
  const cloudAfterA = await pageA.evaluate((p) => window.__fb.store[p], cloudPath);
  expect(cloudAfterA.childrenData[0].progress).toEqual(FIVE);
  await ctxA.close();

  // الجهاز B: نسخة محلية قديمة بحرفين فقط، ثم يسجّل الدخول بالحساب نفسه
  const ctxB = await browser.newContext({ locale: 'ar' });
  const pageB = await ctxB.newPage();
  await openApp(pageB, { seed: { [`horofiChildren_${UID}`]: [child({ progress: ['ب', 'ت'] })], [`horofiActiveChild_${UID}`]: 'c1' } });
  await pageB.evaluate(([p, d]) => window.__fb.serverWrite(p, d), [cloudPath, cloudAfterA]);
  await signInAs(pageB, { uid: UID, email: 'a@x.y' }, 'home');
  await pageB.waitForTimeout(2500); // أطول من مهلة syncChildrenToCloud (2000ms)
  const cloudAfterB = await pageB.evaluate((p) => window.__fb.store[p], cloudPath);
  // الجهاز B نفسه يكتسب تقدّم A — «لا يُنقص أبداً» في الاتجاهين
  expect((await state(pageB)).completed).toEqual(FIVE);
  // قواعد الدمج على طفل واحد: النقاط الأكبر، الشارات اتحاد، الاسم من الأحدث نشاطاً
  const merged = await pageB.evaluate(() => mergeChild(
    { id: 'c1', name: 'قديم', progress: ['ب'], stats: { lastPlayed: 1, points: 30, totalCorrect: 5, earnedBadges: ['a'], started: 100 }, writingBadges: { 'ب': ['w1'] } },
    { id: 'c1', name: 'جديد', progress: ['ت'], stats: { lastPlayed: 2, points: 10, totalCorrect: 9, earnedBadges: ['b'], started: 200 }, writingBadges: { 'ب': ['w2'], 'ت': ['w3'] } },
  ));
  expect(merged.name).toBe('جديد');
  expect(merged.progress.sort()).toEqual(['ب', 'ت']);
  expect(merged.stats).toMatchObject({ lastPlayed: 2, points: 30, totalCorrect: 9, started: 100 });
  expect(merged.stats.earnedBadges.sort()).toEqual(['a', 'b']);
  expect(merged.writingBadges).toEqual({ 'ب': ['w1', 'w2'], 'ت': ['w3'] });
  await ctxB.close();

  // السحابة يجب أن تبقى على الأحرف الخمسة — الجهاز B لا يملك ما هو أحدث
  expect(cloudAfterB.childrenData[0].progress).toEqual(FIVE);

  // الجهاز A أُعيد تثبيته (لا بيانات محلية) → يستعيد من السحابة: يجب أن يجد الخمسة
  const ctxA2 = await browser.newContext({ locale: 'ar' });
  const pageA2 = await ctxA2.newPage();
  await openApp(pageA2);
  await pageA2.evaluate(([p, d]) => window.__fb.serverWrite(p, d), [cloudPath, cloudAfterB]);
  await signInAs(pageA2, { uid: UID, email: 'a@x.y' }, 'home');
  expect((await state(pageA2)).completed).toEqual(FIVE);
  await ctxA2.close();
});

/* ─────────────────────────────────────────────────────────────
   8–11) الاشتراك عبر المتجرين (إصدار 15 — Google Play Billing مثل Apple)
   بديل Capacitor وهمي يحاكي @squareetlabs/capacitor-subscriptions كما يتصرّف فعلاً:
   في أندرويد purchaseProduct يُرجع «فُتحت النافذة» فقط، والنتيجة تصل بحدث
   ANDROID-PURCHASE-RESPONSE؛ و getLatestTransaction لا يجد شيئاً قبل الشراء. */
async function openNative(page, platform, seed) {
  await page.addInitScript((platform) => {
    const listeners = {};
    const sub = {
      calls: [],
      owned: null,           // purchaseToken بعد اكتمال الشراء
      price: platform === 'android' ? '29,90 kr' : '2,99 €',
      async getProductDetails(o) { sub.calls.push(['getProductDetails', o]); return { responseCode: 0, data: { price: sub.price } }; },
      async purchaseProduct(o) { sub.calls.push(['purchaseProduct', o]); return platform === 'ios' ? { responseCode: 0 } : { responseCode: 0, responseMessage: 'Successfully opened native popover' }; },
      async getLatestTransaction(o) {
        sub.calls.push(['getLatestTransaction', o]);
        if (platform === 'ios') return { responseCode: 0, data: { transactionId: 'tx_ios_1' } };
        return sub.owned ? { responseCode: 0, data: { purchaseToken: sub.owned } } : { responseCode: 3 };
      },
      manageSubscriptions(o) { sub.calls.push(['manageSubscriptions', o]); return new Promise(() => {}); }, // لا ينتهي أبداً في أندرويد
      async addListener(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return { remove() { listeners[ev] = (listeners[ev] || []).filter((x) => x !== cb); } }; },
      // يحاكي Google بعد أن يُكمل وليّ الأمر الدفع أو يلغيه
      finish(result, token) { if (token) sub.owned = token; (listeners['ANDROID-PURCHASE-RESPONSE'] || []).forEach((cb) => cb(result)); },
    };
    window.__sub = sub;
    window.__opened = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => platform,
      Plugins: {
        App: { addListener: () => {}, exitApp: () => {}, getInfo: async () => ({ build: '999' }) },
        Browser: { open: (o) => { window.__opened.push(o.url); } },
        Subscriptions: sub,
      },
    };
  }, platform);
  await openApp(page, { seed });
}
const solveGate = (page) => page.evaluate(() => { document.getElementById('pgInput').value = String(PG_ANSWER); pgConfirm(); });
const subCalls = (page, name) => page.evaluate((n) => window.__sub.calls.filter((c) => c[0] === n).map((c) => c[1]), name);
const callsTo = (page, name) => page.evaluate((n) => window.__fb.callLog.filter((c) => c.name === n).map((c) => c.data), name);

test('8) أندرويد: الشراء عبر Google Play — البوابة أولاً، ولا فتح قبل تأكيد الخادم، ولا Stripe', async ({ page }) => {
  await openNative(page, 'android');
  await signInAs(page, { uid: 'g_user', email: 'g@x.y' }, 'onboarding');
  await page.evaluate(() => skipOnboarding());
  await waitForScreen(page, 'home');

  // الخادم يؤكّد فقط الرمز الذي أصدرته Google فعلاً
  await page.evaluate(() => {
    window.__fb.callables.verifyGoogleSubscription = async (d) => ({ data: { subscribed: d.purchaseToken === 'gp_token_OK_1234567890' } });
  });

  await page.evaluate(() => showSubscriptionPage());
  await waitForScreen(page, 'subscription');
  const ui = await page.evaluate(() => ({
    store: document.getElementById('subStoreBox').style.display,
    web: document.getElementById('subWebBox').style.display,
    storeName: document.getElementById('subStoreName').textContent,
    renew: document.getElementById('subRenewNote').textContent,
    stripeInPage: /stripe/i.test(document.getElementById('subscription').innerText) || /buy.stripe.com|activateSubscription/.test(document.documentElement.outerHTML),
  }));
  expect(ui).toEqual({ store: '', web: 'none', storeName: 'شراء آمن عبر Google Play', renew: 'ما لم تُلغه قبل موعد التجديد', stripeInPage: false });
  // السعر بعملة بلد المستخدم كما يرسله المتجر
  await page.waitForFunction(() => document.getElementById('subPriceLabel').textContent === '29,90 kr / شهر');
  expect(await subCalls(page, 'getProductDetails')).toEqual([{ productIdentifier: 'horofi_monthly' }]);

  // (أ) الشراء يمرّ من بوابة وليّ الأمر أولاً — لا شيء يصل للمتجر قبل حلّها
  await page.evaluate(() => purchaseStoreSubscription());
  expect(await page.evaluate(() => document.getElementById('pgOverlay').style.display)).toBe('flex');
  expect(await subCalls(page, 'purchaseProduct')).toEqual([]);
  await solveGate(page);
  await page.waitForFunction(() => window.__sub.calls.some((c) => c[0] === 'purchaseProduct'));
  expect(await subCalls(page, 'purchaseProduct')).toEqual([{ productIdentifier: 'horofi_monthly' }]);

  // (ب) نافذة Google مفتوحة ولم يكتمل الدفع: لا فتح إطلاقاً
  expect(await page.evaluate(() => [isSubscribed, isLetterFree('ع')])).toEqual([false, false]);

  // (ج) وليّ الأمر ألغى: رسالة، ولا استدعاء للخادم
  await page.evaluate(() => window.__sub.finish({ successful: false }));
  await page.waitForFunction(() => document.getElementById('subStoreMsg').textContent === 'لم تكتمل عملية الشراء');
  expect(await callsTo(page, 'verifyGoogleSubscription')).toEqual([]);
  expect(await page.evaluate(() => document.getElementById('subStoreBuyBtn').disabled)).toBe(false);

  // (د) المحاولة الثانية تكتمل: الرمز يُرسل للخادم، والخادم وحده يفتح
  await page.evaluate(() => purchaseStoreSubscription());
  await solveGate(page);
  await page.waitForFunction(() => window.__sub.calls.filter((c) => c[0] === 'purchaseProduct').length === 2);
  await page.evaluate(() => window.__sub.finish({ successful: 0 }, 'gp_token_OK_1234567890'));
  await page.waitForFunction(() => isSubscribed === true);
  expect(await callsTo(page, 'verifyGoogleSubscription')).toEqual([{ purchaseToken: 'gp_token_OK_1234567890' }]);
  expect(await page.evaluate(() => isLetterFree('ع'))).toBe(true);
  await waitForScreen(page, 'letters');
});

test('9) أندرويد: الخادم يرفض ⇒ يبقى مقفلاً؛ و«إدارة الاشتراك» تذهب لمصدره الصحيح', async ({ page }) => {
  await openNative(page, 'android');
  await signInAs(page, { uid: 'g_user2', email: 'g2@x.y' }, 'onboarding');
  await page.evaluate(() => skipOnboarding());
  await waitForScreen(page, 'home');

  // الخادم يرفض (مثلاً اشتراك منتهٍ) ⇒ لا فتح محلي أبداً
  await page.evaluate(() => { window.__fb.callables.verifyGoogleSubscription = async () => ({ data: { subscribed: false } }); });
  await page.evaluate(() => showSubscriptionPage());
  await page.evaluate(() => purchaseStoreSubscription());
  await solveGate(page);
  await page.waitForFunction(() => window.__sub.calls.some((c) => c[0] === 'purchaseProduct'));
  await page.evaluate(() => window.__sub.finish({ successful: 0 }, 'gp_token_expired_1234567890'));
  await page.waitForFunction(() => /تعذّر إتمام الشراء/.test(document.getElementById('subStoreMsg').textContent));
  expect(await page.evaluate(() => [isSubscribed, isLetterFree('ع')])).toEqual([false, false]);

  // مشترك Google ⇒ صفحة اشتراكات Google Play (بلا انتظار — الاستدعاء لا ينتهي في أندرويد)
  await page.evaluate(() => window.__fb.serverWrite('users/g_user2', { googlePlatform: true }));
  await page.evaluate(() => doManageSubscription());
  await page.waitForFunction(() => window.__sub.calls.some((c) => c[0] === 'manageSubscriptions'));
  expect(await subCalls(page, 'manageSubscriptions')).toEqual([{ productIdentifier: 'horofi_monthly', bid: 'com.horofi.app' }]);
});

test('10) iOS: مسار Apple لم يتغيّر — البوابة، ثم StoreKit، ثم تحقّق الخادم بمعرّف المعاملة', async ({ page }) => {
  await openNative(page, 'ios');
  await signInAs(page, { uid: 'a_user', email: 'a@x.y' }, 'onboarding');
  await page.evaluate(() => skipOnboarding());
  await waitForScreen(page, 'home');
  await page.evaluate(() => { window.__fb.callables.verifyAppleSubscription = async (d) => ({ data: { subscribed: d.transactionId === 'tx_ios_1' } }); });

  await page.evaluate(() => showSubscriptionPage());
  const ui = await page.evaluate(() => ({
    storeName: document.getElementById('subStoreName').textContent,
    renew: document.getElementById('subRenewNote').textContent,
    web: document.getElementById('subWebBox').style.display,
  }));
  expect(ui).toEqual({ storeName: 'شراء آمن عبر App Store', renew: 'ما لم تُلغه قبل 24 ساعة من نهاية المدة', web: 'none' });
  await page.waitForFunction(() => document.getElementById('subPriceLabel').textContent === '2,99 € / شهر');

  await page.evaluate(() => purchaseStoreSubscription());
  expect(await subCalls(page, 'purchaseProduct')).toEqual([]);
  await solveGate(page);
  await page.waitForFunction(() => isSubscribed === true);
  expect(await subCalls(page, 'purchaseProduct')).toEqual([{ productIdentifier: 'com.Horofi.monthly2eur' }]);
  expect(await callsTo(page, 'verifyAppleSubscription')).toEqual([{ transactionId: 'tx_ios_1' }]);
  expect(await callsTo(page, 'verifyGoogleSubscription')).toEqual([]);
});

test('11) الويب: لا بيع إطلاقاً — روابط المتجرين فقط وخلف بوابة وليّ الأمر', async ({ page }) => {
  await openApp(page);
  await signInAs(page, { uid: 'w_user', email: 'w@x.y' }, 'onboarding');
  await page.evaluate(() => skipOnboarding());
  await waitForScreen(page, 'home');
  await page.evaluate(() => showSubscriptionPage());
  const ui = await page.evaluate(() => ({
    store: document.getElementById('subStoreBox').style.display,
    web: document.getElementById('subWebBox').style.display,
    price: document.getElementById('subPriceLabel').textContent,
    stripeInPage: /stripe/i.test(document.getElementById('subscription').innerText) || /buy.stripe.com|activateSubscription/.test(document.documentElement.outerHTML),
    stripeConst: typeof STRIPE_URL,
  }));
  expect(ui).toEqual({ store: 'none', web: '', price: '2.99 € / شهر', stripeInPage: false, stripeConst: 'undefined' });

  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); }; openStoreListing('android'); });
  expect(await page.evaluate(() => [document.getElementById('pgOverlay').style.display, window.__opened.length])).toEqual(['flex', 0]);
  await solveGate(page);
  expect(await page.evaluate(() => window.__opened)).toEqual(['https://play.google.com/store/apps/details?id=com.horofi.app']);
});
