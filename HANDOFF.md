# ملف تسليم — صحّح حروفك (08 أغسطس 2026)

> نصيحة: اطلب من كلود قراءة هذا الملف أولاً (`Read HANDOFF.md`) بدل إعادة شرح كل
> شيء. احذف الأقسام القديمة تدريجياً كي يبقى مختصراً ومفيداً — هذه النسخة
> نفسها اختصرت تاريخاً طويلاً من جلسات سابقة (فحص كتابة الحروف اليدوية، إصلاحات
> صوت/CSS قديمة) لأنها انتهت ولم تعد مرتبطة بالعمل الحالي.

## ⚠️ الأحدث: اشتراك iOS حقيقي عبر StoreKit 2 + إعداد App Store Connect المالي/الضريبي بالكامل (08.08.2026، جلسة ثانية)

### 1) الدفع الحقيقي على iOS — مُنجَز بالكامل من الكود والخادم (غير مُختبَر على جهاز حقيقي بعد)

**Product ID الفعلي المُعتمَد**: `com.Horofi.monthly2eur` (كان موجوداً مسبقاً في App Store
Connect باسم مختلف عمّا خُطِّط له أولاً — الكود يطابقه الآن). السعر على iOS **2.99€/شهر**
(مختلف عمداً عن 2€ أندرويد، تعويضاً لعمولة آبل — أُنشئ سعر ألمانيا الفعلي بعد صعوبة كبيرة في
واجهة "Alle Preise und Währungen"، اتضح أن السبب الحقيقي للفشل المتكرر كان عقد
التطبيقات المدفوعة غير مُفعَّل بعد، وليس خطأ في الخطوات).

- **العميل** (`horofi-v11-9-29.html`): مكوّن `@squareetlabs/capacitor-subscriptions@1.0.25`
  (تعمّدت اختيار مكتبة متوافقة مع Capacitor 6 الحالي — **ليس** RevenueCat ولا مكتبات تتطلب
  Capacitor 8، تجنّباً لتكرار مشكلة Crashlytics 6.x/8.x). دوال جديدة:
  `purchaseIOSSubscription()`, `confirmAppleTransactionWithServer()`,
  `restoreIOSPurchases()` (لا يوجد "استعادة" منفصلة في StoreKit 2 — تُعاد نفس دالة التحقق).
  `showSubscriptionPage()` تُظهر الآن أزرار شراء حقيقية على iOS بدل رسالة "غير متاح".
- **الخادم** (`horofi/index.js`): مكتبة آبل الرسمية `@apple/app-store-server-library`
  (تتولى التحقق من التوقيع/سلسلة الشهادات بأمان — تجنّبت كتابة تشفير يدوي). شهادة
  `AppleRootCA-G3.cer` في `horofi/certs/`. دالتان جديدتان:
  - `verifyAppleSubscription` (onCall): تُستدعى فور الشراء، تتحقق حقيقة من آبل (تجرّب
    Production ثم Sandbox تلقائياً) قبل كتابة `subscribed:true`.
  - `appleServerNotifications` (onRequest): يستقبل تجديد/إلغاء/استرداد تلقائياً، بنفس
    فلسفة `stripeWebhook` (لا يُفعّل الاشتراك محلياً أبداً من العميل).
  - فهرس عكسي `appleTransactions/{originalTransactionId} → uid` لأن إشعارات آبل لا تحمل
    uid الخاص بنا.
  - **الأسرار مضبوطة ومنشورة فعلياً**: `APPLE_ISSUER_ID`, `APPLE_KEY_ID`,
    `APPLE_PRIVATE_KEY` (عبر `firebase functions:secrets:set`، نفّذها المستخدم بنفسه في
    طرفيته الخاصة — لم تمرّ عبر المحادثة). **نُشر بنجاح** عبر
    `firebase deploy --only functions:horofi`.
  - رابط الإشعارات `https://us-central1-horofi.cloudfunctions.net/appleServerNotifications`
    **مسجَّل فعلياً** في App Store Connect (App-Informationen → App Store-Server-Benachrichtigungen)
    لكلا Production وSandbox.
- `firestore.rules` **لم تحتَج تعديلاً** — الحقول الجديدة (`applePlatform`,
  `appleOriginalTransactionId`, `appleEnvironment`) محمية تلقائياً بنفس القائمة البيضاء
  الموجودة أصلاً (`hasOnly(['childrenData','childrenUpdatedAt'])`).

### 2) App Store Connect — الجانب المالي/الضريبي/التعاقدي مكتمل بالكامل

كل هذه أصبحت **Aktiv** فعلياً اليوم (كانت جميعها ناقصة قبل الجلسة):
- **Vertrag für gebührenpflichtige Apps** (Paid Apps Agreement): وُقِّع، Aktiv.
- **Bankkonto**: Ostsächsische Sparkasse Dresden، Aktiv.
- **Steuerformulare**: `U.S. Form W-8BEN` و`U.S. Certificate of Foreign Status of
  Beneficial Owner`، كلاهما Aktiv (Line 10 في W-8BEN تُرِك فارغاً عمداً — تعليمات آبل
  الرسمية "Tips Sheet" تقول صراحة إنه لا ينطبق عادةً للأفراد؛ الحقل 6.a احتوى
  Steuer-Identifikationsnummer الشخصي وليس Steuernummer/Finanzamt).
- **Apple Small Business Program**: طلب الانضمام أُرسِل بنجاح عبر
  `developer.apple.com/app-store/small-business-program/enroll` (صفحة منفصلة عن
  App Store Connect نفسه) — بانتظار رد آبل بالبريد (تأكيد استلام وصل فعلاً).
- **DAC7**: أُجيب "Nein" على سؤال "الخدمات الشخصية" (التطبيق تعليمي/اشتراك محتوى، ليس
  منصة وساطة كUber/Fiverr) — التنبيه اختفى، لا حاجة لمزيد من المعلومات.
- **Sandbox Tester**: `arch.mohamedmerie+sandbox1@gmail.com` (بصيغة Gmail alias `+`،
  لا تحتاج بريداً حقيقياً جديداً — آبل لا ترسل تحقق أصلاً) / Deutschland — جاهز
  للاختبار لاحقاً.

### 3) مهم: لا يوجد بعد بناء iOS حقيقي يحتوي هذا الكود

كل ما سبق **كود وخادم فقط** — آخر بناء iOS مرفوع لـTestFlight (رقم 2) **سابق** لكل هذا
العمل ولا يحتوي StoreKit إطلاقاً. **قبل أي اختبار شراء فعلي**: يلزم بناء جديد عبر
Codemagic (`ios-simulator-build` للتحقق أولاً، ثم `ios-testflight` بتأكيد صريح من
المستخدم). رمز Codemagic API لم يُحفظ من الجلسة السابقة (أمان)، يحتاج طلبه من المستخدم
من جديد عند الحاجة الفعلية للبناء.

### 4) اكتُشف اليوم: أندرويد ليس منشوراً للجمهور فعلياً بعد

خطأ فهم مبدئي مني هذه الجلسة (صحّحته لاحقاً): تبيّن من **Dashboard الفعلي** لتطبيق
أندرويد في Play Console أن **"Produktion: Inaktiv"** — كل شروط الاختبار المغلق مكتملة
(12+ مختبراً، 14 يوماً) لكن **زر "Produktionszugriff beantragen" لم يُضغط بعد**. هذه
خطوة إطلاق حقيقية منفصلة تماماً عن عمل آبل، لم تُنفَّذ بعد، تحتاج قراراً/تأكيداً صريحاً
من المستخدم قبل الضغط.

### 5) تحديث لاحق نفس اليوم: Stripe Live + بناء أندرويد جديد + طلب Produktionszugriff — كلها مُنجَزة

- **Stripe Live مُفعَّل بالكامل**: حساب Stripe فُعِّل (Live-Konto)، رابط دفع حي جديد
  (`https://buy.stripe.com/aFa28r2MQdUuassdcK3F600`، نُسخ من إعداد Sandbox عبر ميزة
  "Live-Kopie" الجديدة في Stripe بدل إعادة الإنشاء يدوياً)، Webhook حي جديد
  (`horofi-live-webhook`) بنفس الأحداث الأربعة يشير لـ
  `https://stripewebhook-6bz55o5iqq-uc.a.run.app`. المفتاحان السرّيان
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` أُعيدا تعيينهما بالقيم الحية عبر
  `firebase functions:secrets:set` (نفّذها المستخدم بنفسه)، والدالتان (`stripeWebhook`،
  `createPortalSession`) أُعيد نشرهما تلقائياً بنجاح. `STRIPE_URL` في
  `horofi-v11-9-29.html` مُحدَّث للرابط الحي.
  - ⚠️ تنبيه أمني وقع أثناء الإعداد: القيمة الملتصقة باسم السر في محاولة فاشلة (نفس
    خطأ Apple سابقاً) **كانت في الواقع مفتاح Test** لا Live (تحقّقنا لاحقاً) — لا خطر
    فعلي وقع، لكن القاعدة تبقى: انتظر دائماً سؤال "Enter a value for..." المنفصل قبل
    اللصق، لا تُلحِق القيمة مباشرة بالأمر.
- **نسخة أندرويد جديدة مبنية ومُوقَّعة**: `versionCode` رُفع من 7 إلى **8**،
  `versionName` من "1.5" إلى **"1.6"** في
  `android-app/android/app/build.gradle`. بُنيت عبر
  `./gradlew bundleRelease` (توقيع Release موجود مسبقاً عبر
  `android-app/android/keystore.properties`، لم يُطلَّع على محتواه). الملف الناتج
  `app-release.aab` أُرسل للمستخدم مباشرة (لم يُرفَع لـPlay Console من هنا — لا
  صلاحية رفع مباشر، المستخدم يرفعه يدوياً).
- **طلب Produktionszugriff لأندرويد أُرسل بنجاح** (08.08.2026 23:13) — أُجيب على
  استبيان Google الكامل (كيفية تجنيد المختبرين: عائلة وأصدقاء، الفئة المستهدفة: أهالي
  أطفال عرب 4-10 سنوات، التغييرات بعد الاختبار: التحويل لـStripe Live + إضافة
  Crash-Reporting). **بانتظار رد Google حتى 7 أيام**. لم يُرفَع بعد الإصدار الجديد
  (versionCode 8) فعلياً لأي مسار في Play Console — ننتظر رد الموافقة أولاً، ثم
  المستخدم يرفعه لمسار Production.

### 6) مهام متبقية فعلية

- **بناء iOS جديد عبر Codemagic** (راجع البند 3 أعلاه) — لم يبدأ، يحتاج رمز API من
  المستخدم من جديد.
- **رفع `app-release.aab` (versionCode 8) لمسار Production في Play Console** — بعد
  موافقة Google على طلب Produktionszugriff.
- **إزالة `prelaunch` من صفحة الهبوط**: مؤجَّلة حتى تأكيد نجاح كل ما سبق فعلياً على
  الجمهور (الآن Stripe Live جاهز من ناحية الخادم، لكن لا يوجد بعد إصدار عام يستخدمه).

## سابقاً: رفض App Store وإصلاحه بالكامل + مزامنة سحابية + Codemagic API (08.08.2026، جلسة أولى)

### 1) رفض Apple لنسخة iOS 1.0 — 3 أسباب حقيقية، الثلاثة أُصلحت ونُشرت

Apple رفضت النسخة (Submission `163ac6d2`) بثلاثة أسباب حقيقية (قرأنا الرسالة
الكاملة من Resolution Center، لا الملخّص المقتضب الأول):

1. **Guideline 5.1.1(v)**: اختيار جنس الطفل في التسجيل كان إلزامياً (لا يمكن
   المتابعة بلا ضغط "ولد"/"بنت" صراحة). **الإصلاح**: يبدأ الآن بقيمة افتراضية
   ظاهرة بصرياً ("ولد" محدَّد) قابلة للتغيير، بلا أي حظر للمتابعة —
   `resetGenderPicker()`/`selectGender()`/`completeOnboarding()` في
   `horofi-v11-9-29.html`. (تنبيه: هذا يختلف عن الافتراض الصامت في نسخة أقدم
   قديمة كانت تسبب خطأ جنس حقيقي — هنا الافتراض **مرئي دائماً** على الزر.)
2. **Guideline 2.1(b)**: زر "اشترك الآن" كان يفتح رابط دفع Stripe خارجي بلا أي
   فحص منصّة — يعمل على iOS بنفس طريقة أندرويد، وهذا يخالف إلزامية In-App
   Purchase لأي محتوى رقمي على iOS. **الإصلاح**: `showSubscriptionPage()` تفحص
   الآن `Capacitor.getPlatform()==='ios'` وتُخفي أزرار الشراء بالكامل على iOS
   (تستبدلها برسالة "غير متاح حالياً")، بلا أي تأثير على أندرويد.
3. **Guideline 2.1 (معلومات مطلوبة)**: أسئلة عن التحليلات/الإعلانات/مشاركة
   البيانات — أُجيبت كتابياً وبصدق (لا Analytics ولا إعلانات في كود الويب
   المشترك، Firebase فقط لمصادقة/تخزين، بيانات الطفل تُستخدم فقط لتخصيص المحتوى).

**أيضاً أُضيف استباقياً (لم تطلبه Apple لكنه معيار عام)**: رابط "سياسة
الخصوصية" ظاهر داخل التطبيق نفسه (شاشة الدخول + شاشة الحساب) يفتح
`https://archmohamedmerie-coder.github.io/horofi/privacy.html` عبر
`openPrivacyPolicy()`.

**النتيجة**: بُني إصدار موقَّع جديد (Build **2**، بعد حل تعارض رقم البناء
المكرَّر — Apple ترفض رفع نفس الرقم مرتين)، رُفع بنجاح عبر Codemagic، اختير
كبناء للنسخة 1.0 في App Store Connect، أُرسل ردّ كامل لـApple يذكر رقم البناء
الجديد، وأُعيد الإرسال للمراجعة. **الحالة الآن: "Bereit zur Prüfung" (بانتظار
مراجعة Apple)**.

⚠️ **تحذير إضافي وارد من Apple (غير حاسم)**: `ITMS-90068 MinimumOSVersion too
low` — اعتباراً من ربيع 2027 ستُلزم Apple دعم iOS 15.0+ كحد أدنى. **أُصلح
استباقياً بالفعل**: `IPHONEOS_DEPLOYMENT_TARGET` و`platform :ios` في
`project.pbxproj`/`Podfile` صارا `15.0` (كانا `13.0`).

### 2) مزامنة بيانات الأطفال إلى Firestore (إصلاح خطر فقدان بيانات حقيقي)

كانت كل بيانات الطفل (التقدّم، النقاط، الشارات) في `localStorage` فقط —
حذف التطبيق/تغيير الجهاز = ضياع كل شيء نهائياً حتى للمشتركين المدفوعين. الآن:
- `syncChildrenToCloud()` (مُهيَّأة بتأخير 2 ثانية) تُستدعى من `saveChildren()`.
- `pullChildrenFromCloud()` تُستدعى عند تسجيل الدخول، قبل `loadProfile()` —
  تستعيد من السحابة إن كان الجهاز جديداً بلا بيانات محلية.
- `firestore.rules` عُدِّلت للسماح للعميل بكتابة حقل `childrenData` فقط على
  وثيقته، مع حماية كاملة (`allow update` diff check) لحقول الاشتراك
  (`subscribed`, `stripeCustomerId`...) — تبقى حصراً لـCloud Function.
- **تحقّقت حيّاً**: أنشأت حساب اختبار، أضفت طفلاً، مسحت البيانات المحلية
  (محاكاة تثبيت جديد)، استعدتُ نفس البيانات من السحابة بنجاح. وحاولت أيضاً
  كتابة `subscribed:true` مباشرة من العميل ورُفضت (`permission-denied`) —
  الحماية تعمل كما هو مخطَّط.

### 3) Stripe Webhook — معالجة أحداث ناقصة

`horofi/index.js` كان يعالج فقط `checkout.session.completed` و
`customer.subscription.deleted`. أُضيف الآن:
- `invoice.payment_failed` → يسجّل `paymentStatus:'failed'` (بلا إلغاء فوري،
  Stripe يعيد المحاولة تلقائياً).
- `customer.subscription.updated` → يسجّل `paymentStatus` الحالي (past_due،
  trialing...) كمرجع، بلا تأثير على `subscribed` (يبقى بيد الحدثين الأصليين
  فقط كما كان). نُشر فعلاً عبر `firebase deploy --only functions:horofi`.

### 4) Firebase على iOS — لم يكن موجوداً إطلاقاً، أُنشئ بالكامل

لم يكن هناك أي تطبيق iOS مسجَّل في مشروع Firebase (Crashlytics/Analytics كانا
لأندرويد فقط). أُنشئ مباشرة عبر CLI بلا حاجة لواجهة الويب:
```
firebase apps:create IOS "صحّح حروفك" --bundle-id com.horofi.app --project horofi
firebase apps:sdkconfig IOS <appId> -o android-app/ios/App/App/GoogleService-Info.plist
```
ثم رُبط الملف يدوياً بمشروع Xcode (`project.pbxproj`: PBXBuildFile +
PBXFileReference + إضافة لمجموعة App وResources build phase). المكوّن
(`@capacitor-firebase/crashlytics@6.3.1` — **إصدار 6.x تحديداً**، الإصدار
الأحدث 8.x يتطلب Capacitor 8 ولا يتوافق مع هذا المشروع على Capacitor 6) يستدعي
`FirebaseApp.configure()` تلقائياً عند التحميل، فلا حاجة لتعديل AppDelegate.

### 5) معالج أخطاء JS عام + جسر Crashlytics

لم يكن هناك أي `window.onerror`/`unhandledrejection` في الكود إطلاقاً — أي
استثناء غير متوقّع كان يسقط بصمت. أُضيف `_reportJsError()` يرسل التفاصيل لـ
`FirebaseCrashlytics.recordException()` على الجوّال. **تحقّقتُ حيّاً على
أندرويد**: رميت `ReferenceError` حقيقياً و`Promise.reject` غير معالَج، وتأكّدت
من وصولهما فعلياً عبر الجسر الأصلي (`Capacitor/Plugin` log) بلا أي تجمّد للتطبيق.

### 6) Codemagic API — إعداد وصول كامل من هذه الجلسة

رمز API شخصي (Account settings → API token في Codemagic، **ليس** ضمن صفحة
"Personal account settings/Integrations" كما قد يُظَن) يُستخدم هكذا:
```bash
TOKEN='<CODEMAGIC_API_TOKEN>'   # لا يُحفظ في أي ملف — فقط متغيّر بيئة مؤقّت
APP_ID='6a673beaf1d3a42a0686a30b'   # معرّف تطبيق horofi في Codemagic

# تشغيل بناء (workflowId: ios-simulator-build = آمن بلا نشر، ios-testflight = موقَّع يرفع فعلياً)
curl -s -X POST -H "x-auth-token: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"appId\":\"$APP_ID\",\"workflowId\":\"ios-simulator-build\",\"branch\":\"main\"}" \
  https://api.codemagic.io/builds
# يرجع {"buildId": "..."} — تابع الحالة عبر:
curl -s -H "x-auth-token: $TOKEN" "https://api.codemagic.io/builds/<buildId>"
```
⚠️ **الرمز الحالي ظهر في نص المحادثة** — يُفضَّل إلغاؤه وتوليد رمز جديد من نفس
الصفحة إن استمر استخدامه لاحقاً بأمان أعلى.

**قاعدة عمل مهمة تبنّيتها هذه الجلسة**: `ios-simulator-build` (بلا توقيع، بلا
نشر) للتحقّق السريع من أي تعديل كود قبل المخاطرة بـ`ios-testflight` (يرفع
بناءً حقيقياً لـApp Store Connect). لا تُشغِّل `ios-testflight` إلا بتأكيد
صريح من المستخدم في كل مرة.

### 7) TestFlight — اختبار خارجي (External Testing) يعمل الآن

اكتُشف أن قسم "External Testing" **لا يظهر في الشريط الجانبي إطلاقاً** حتى
تُنشأ مجموعة اختبار داخلي (Internal) واحدة أولاً — شرط مسبق إلزامي من Apple
غير موثَّق بوضوح في الواجهة نفسها (تأكّد من
[توثيق Apple الرسمي](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)).
الحالة الحالية: مجموعة داخلية "Tester" فارغة (فقط لتفعيل الخيار)، مجموعة
خارجية "Familie" تحتوي البناء رقم 2 ورابط عام:
`https://testflight.apple.com/join/Hmw9Fuap` — **لن يعمل حتى توافق Apple على
مراجعة Beta الخفيفة** (منفصلة عن مراجعة App Store الكاملة، أُرسلت لكنها لم
تُحسَم بعد وقت كتابة هذا الملف).

### 8) محاكي أندرويد — استبدال الصورة التجريبية المعطوبة

صورة النظام القديمة (`sdk_gphone16k_x86_64`, "16k" تجريبية) كانت السبب في:
تعطّل Chrome (`dlopen failed... libmonochrome_64.so`) عند فتح أي رابط خارجي
(بوابة Stripe سابقاً)، وتعليق أوامر ADB بعد استخدام طويل. **الحل الجذري (لا
ترقيع)**: ثُبِّت `cmdline-tools` عبر تنزيل مباشر (لم يكن موجوداً أصلاً على
الجهاز)، ونُصِّبت صورة نظام قياسية `system-images;android-34;google_apis_playstore;x86_64`،
وأُنشئ AVD جديد اسمه **`Pixel_8_stable`** — هو المحاكي الوحيد الذي يجب
استخدامه من الآن فصاعداً (لا `Pixel_8` القديم).

⚠️ **قاعدة مهمة جداً**: **لا تُشغِّل محاكيَين في آن واحد** — هذا استنزف موارد
النظام وسبَّب تعليق كليهما (اكتُشف هذا اليوم: `Pixel_8` القديم كان لا يزال
يعمل في الخلفية دون علمي بجانب `Pixel_8_stable`). تحقّق دائماً بـ
`tasklist | grep qemu` قبل تشغيل أي AVD جديد، وأنهِ أي عملية qemu قديمة أولاً.

### قرارات معلَّقة بانتظار المستخدم

- **دفع حقيقي على iOS**: ✅ منجَز بالكامل (كود + خادم + App Store Connect)، راجع
  قسم "الأحدث" أعلاه. المتبقي: بناء iOS جديد عبر Codemagic ثم اختبار فعلي عبر
  Sandbox Tester.
- التطبيق ليس منشوراً على App Store بعد — بانتظار نتيجة المراجعة.
- **أندرويد أيضاً ليس منشوراً للجمهور بعد** (Produktion: Inaktiv في Play
  Console) — يحتاج ضغط "Produktionszugriff beantragen" بتأكيد صريح من المستخدم.
- **Stripe لا يزال test mode** — يحتاج المستخدم دخول `dashboard.stripe.com`
  لإنشاء رابط دفع + webhook حيّين قبل إزالة `prelaunch` من صفحة الهبوط.

## بنية المشروع

- **الملف الرئيسي**: `horofi-v11-9-29.html` — ملف واحد ضخم (HTML+CSS+JS)، هذا هو
  مصدر الحقيقة الوحيد لكل من أندرويد وiOS معاً (لا فرع منفصل لكل منصّة — أي
  فحص خاص بمنصّة يكون شرطاً داخل نفس الملف عبر `Capacitor.getPlatform()`).
  أي تعديل يُنسخ بعده لكل من:
  ```
  cp horofi-v11-9-29.html android-app/www/index.html
  cd android-app && npx cap sync android && npx cap sync ios
  ```
- **مشروع أندرويد**: `android-app/android/` — بناء محلي:
  ```
  cd android-app/android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug
  ```
  ثم تثبيت عبر `adb install -r app/build/outputs/apk/debug/app-debug.apk` على
  محاكي `Pixel_8_stable` (راجع القسم أعلاه).
- **مشروع iOS**: `android-app/ios/` — **لا يمكن بناؤه محلياً على ويندوز
  إطلاقاً** (لا Xcode). كل بناء iOS يمرّ عبر Codemagic (راجع قسم Codemagic API
  أعلاه)، مدفوعاً من نفس فرع `main` على GitHub.
- **الخلفية (Backend)**: `horofi/index.js` — أربع Cloud Functions:
  `stripeWebhook` + `createPortalSession` (Stripe/أندرويد)،
  `verifyAppleSubscription` + `appleServerNotifications` (آبل/iOS، جديدتان
  08.08.2026). تُنشر جميعها معاً عبر `firebase deploy --only functions:horofi`.
  `firestore.rules` منفصلة، تُنشر عبر `firebase deploy --only firestore:rules`.
  شهادة `horofi/certs/AppleRootCA-G3.cer` جزء من الكود، تُنشر تلقائياً معه.
- **الصوت**: مجلد `audio/` بالجذر (يُنسخ لـ`android-app/www/audio/`). سكربتات
  `horofi_tts_*.py` تستخدم ElevenLabs API (مفتاح المستخدم فقط، غير محفوظ).

## أدوات التصحيح المهمة

**Chrome DevTools Protocol** على WebView التطبيق (أدقّ وأسرع من `adb shell
input tap`):
```bash
ADB="/c/Users/m-hm1/AppData/Local/Android/Sdk/platform-tools/adb.exe"
"$ADB" shell cat /proc/net/unix | grep -o "webview_devtools_remote[^ ]*"
"$ADB" forward tcp:9333 localabstract:webview_devtools_remote_XXXXX
curl -s http://localhost:9333/json   # يعطي webSocketDebuggerUrl
```
ثم `cdp_eval.js` (أعد كتابته إن لزم من جلسة سابقة — سكربت Node صغير بلا حزم
خارجية):
```js
const wsUrl = process.argv[2], expr = process.argv[3];
const ws = new WebSocket(wsUrl);
ws.addEventListener('open', () => ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:expr, returnByValue:true, awaitPromise:true}})));
ws.addEventListener('message', (e) => { const m=JSON.parse(e.data); if(m.id===1){ console.log(JSON.stringify(m.result,null,2)); ws.close(); process.exit(0);} });
setTimeout(()=>{console.error('timeout');process.exit(1);}, 15000);
```
استدعاء: `node cdp_eval.js "<wsUrl>" "<jsExpression>"`.

**Codemagic API** — راجع قسم "Codemagic API" أعلاه للأوامر الكاملة.

## معروف/مؤجَّل

- تحذير توافق 16KB لمكتبة `libdigitalink.so` القديمة — لم تعد ذات صلة (تلك
  الميزة/المكتبة حُذفت نهائياً من المشروع منذ جلسات سابقة).
- قائمة كاملة لما قبل الإطلاق (Play Console/Stripe) موجودة في ملف الذاكرة الدائم
  (`~/.claude/projects/.../memory/horofi_prelaunch_checklist.md`) — حُدِّثت
  08.08.2026 لتعكس الحالة الحقيقية (راجع قسم "الأحدث" أعلاه لتفاصيل أدق).
- دراسة استقرار إنتاج شاملة (منع الانهيارات/التعليق، مبنية على فحص كود فعلي)
  نُشرت كـArtifact في جلسة سابقة — إن احتجت استعادتها اطلب من كلود البحث عنها.
