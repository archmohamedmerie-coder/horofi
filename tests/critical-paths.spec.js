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
  /* ⚠️ خطأ مؤكَّد في التطبيق (11.09.2026) — يُصلَح بعد قبول Google لنسخة 2.0 (13):
     عند الإقلاع (قبل استجابة Firebase) تُنشئ loadProfile() من المفتاح القديم
     horofiProfile طفلاً وتحفظه تحت horofiChildren/horofiActiveChild (بلا uid)،
     وlogoutUser() لا يحذف هذين المفتاحين، فيرثهما الضيف التالي عبر مسار الترحيل
     في loadChildren(). الإصلاح: حذف المفتاحين في logoutUser (وربما عدم كتابتهما
     أصلاً حين CURRENT_UID فارغ). حين يُصلَح، احذف test.fail() ليعود الاختبار حارساً. */
  test.fail(true, 'خطأ مؤكَّد: المفتاحان القديمان horofiChildren/horofiActiveChild لا يُحذفان عند الخروج');
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
  /* ⚠️ خطأ مؤكَّد في التطبيق (11.09.2026) — يُصلَح بعد قبول Google لنسخة 2.0 (13):
     الترقية نفسها صحيحة (linkWithCredential، نفس الـuid)، لكن إعادة التوجيه بعدها في
     doRegister() تفحص PROFILE.name فقط وتنسى CHILDREN.length، فيُعاد من تخطّى
     التهيئة إلى التهيئة. الإصلاح: نفس شرط onAuthStateChanged.
     حين يُصلَح، احذف test.fail(). */
  test.fail(true, 'خطأ مؤكَّد: إعادة التوجيه بعد الترقية تتجاهل CHILDREN.length');
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
  expect(await page.evaluate(() => FREE_LETTERS)).toEqual(['ب', 'ت', 'ث', 'ج']);

  // لا مستند للمستخدم في Firestore → غير مشترك رغم localStorage
  await signInAs(page, { uid: 'sub_user', email: 's@x.y' }, 'onboarding');
  await page.waitForFunction(() => isSubscribed === false);
  expect(await page.evaluate(() => [isLetterFree('ب'), isLetterFree('ع'), localStorage.getItem('horofiSubscribed')])).toEqual([true, false, '0']);

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
