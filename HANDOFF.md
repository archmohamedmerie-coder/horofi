# ملف تسليم — صحّح حروفك (17 أغسطس 2026)

> نصيحة: اطلب من كلود قراءة هذا الملف أولاً (`Read HANDOFF.md`) بدل إعادة شرح كل
> شيء. احذف الأقسام القديمة تدريجياً كي يبقى مختصراً ومفيداً.

## ⚠️ الأحدث (17.08.2026): versionCode 10 كان يحمل Billing Library القديمة فعلياً رغم توثيق سابق يقول العكس — أُصلح ورُفع versionCode 11 لمراجعة جوجل

**اكتُشفت المشكلة من واجهة Google Play Console نفسها**، ليس من الكود: صفحة "Neueste
Releases und Bundles" أظهرت أن إصدار الإنتاج **10 (1.8) كانت حالته "Entwurf"
(مسودّة) وليس "Wird überprüft" (قيد المراجعة) كما وثّق HANDOFF السابق** — لم
يُرسَل للمراجعة فعلياً قط، توقّف عند خطوة الحفظ فقط. وفتح تفاصيل الحزمة كشف
**"API-Level: 22 oder höher"**، أي أنها لا تحمل إصلاح Billing Library 9.1.0 /
minSdk 23 الموثَّق في قسم "Google Play Billing Library" أدناه.

**السبب الجذري (تأكّد من تواريخ commits بالضبط)**: حزمة versionCode 10 بُنيت
ورُفعت لجوجل الساعة 17:12 بتاريخ 13.08.2026 — لكن commit إصلاح Billing
Library/minSdk (`5e07b59`) حدث الساعة 20:44 من **نفس اليوم**، أي بعد رفع الحزمة
بأكثر من 3 ساعات. الحزمة المرفوعة إذاً بُنيت من كود **قبل** الإصلاح، رغم أن كود
`main` نفسه كان يحتوي الإصلاح لاحقاً — درس: **تاريخ commit الإصلاح لا يعني أن كل
حزمة مبنية لاحقاً تتضمّنه تلقائياً؛ يجب التحقق من الحزمة الفعلية المرفوعة، لا من
سجل Git وحده.**

**الإصلاح المُنفَّذ ويُتحقَّق منه خطوة بخطوة**:
1. رفع `versionCode` إلى **11** (`f22685c`)، `versionName` بقي "1.8" (لا تغيير
   وظيفي، فقط إعادة تعبئة صحيحة).
2. تحقّقتُ قبل البناء: الباتش (`patch-package`) مُطبَّق فعلياً في `node_modules`،
   و`minSdkVersion = 23` موجود في `variables.gradle`.
3. بُني عبر `./gradlew bundleRelease` — **BUILD SUCCESSFUL**، وتحقّقت من الملف
   الناتج (`app-release.aab`, ~128MB) فعلياً بعد البناء.
4. تحقّقتُ من الـmanifest الفعلي المُعالَج للحزمة
   (`bundle_manifest/release/processApplicationManifestReleaseForBundle/AndroidManifest.xml`،
   بنفس توقيت البناء) — يحتوي **`minSdkVersion="23"`** فعلياً، لا افتراضاً.
5. رُفعت الحزمة الجديدة في Play Console، **حُذفت حزمة 10 القديمة من نفس
   الإصدار** (لتفادي وجود حزمتين كاملتين متعارضتين)، وتأكّد جوجل كونزول نفسه أن
   11 (1.8) تحمل **"API-Level: 23 oder höher"**.
6. **الإرسال الفعلي**: اكتُشف أن "Speichern" في صفحة المعاينة **يحفظ فقط ولا
   يرسل للمراجعة** — الإرسال الحقيقي يتطلّب خطوة منفصلة من صفحة
   "Veröffentlichungen – Übersicht" بزر "X Änderung(en) zur Überprüfung
   einreichen". **هذه على الأرجح بالضبط النقطة التي توقّف عندها versionCode 10
   سابقاً ولم يُكتَشف.** نُفِّذت هذه الخطوة بنجاح لـversionCode 11 — الحالة
   الآن **"Änderungen, die überprüft werden"** (قيد المراجعة فعلياً، تأكّدنا من
   تغيّر عنوان القسم في الواجهة).

**تحذير غير حاسم (لم يُعالَج، ليس عائقاً)**: تحذير Play Console عن غياب ملف
كشف تعتيم (Deobfuscation/R8 mapping file) — اختياري، يخص فقط تحليل الأعطال
المستقبلية، لا يمنع النشر.

## سابقاً (14.08.2026): iOS كان يتعطّل 100%، أُصلح؛ أندرويد وصل فعلياً لـProduction (لكن انظر التصحيح أعلاه)؛ عالقون في ربط بناء iOS بأول مراجعة اشتراك

### 1) 🔴 اكتُشف وأُصلح: تطبيق iOS كان يتعطّل فوراً عند كل إقلاع (100%)

البناء 2 (كان على TestFlight) **رُفع لـCodemagic قبل** commit تسجيل Firebase على iOS
بأكثر من ساعة (تأكّدنا من توقيت git بالضبط) — أي أنه **لا يحتوي `GoogleService-Info.plist`
إطلاقاً**. عند الإقلاع، `FirebaseCrashlyticsPlugin` يستدعي `FIRApp.configure()` تلقائياً
(بلا أي تدخّل من كودنا)، وبما أن الإعداد مفقود يرمي Firebase استثناءً غير مُلتقَط →
SIGABRT فوري، **قبل** ظهور أي واجهة.

**كيف اكتُشف**: أخو المستخدم جرّب التطبيق فتعطّل. حمّلنا ملف `.ips` من App Store Connect
(TestFlight → Crashs → لقطة السحابة) وقرأنا الـ stack trace مباشرة — أظهر بوضوح
`FirebaseCore +[FIRApp configure]` في أعلى `Last Exception Backtrace`. هذا أثبت السبب
بيقين 100%، لا تخمين.

**الإصلاح**: الكود الحالي على `main` يحتوي فعلاً كل تسجيل Firebase الصحيح (مُنجَز من
جلسة سابقة) — فقط رفعنا رقم البناء لـ**3** (`CURRENT_PROJECT_VERSION`)، بنينا عبر
Codemagic، ثم لاحقاً **4** (يضمّ إصلاح "زر التالي" أدناه). **تحقّقنا حيّاً**: أخو
المستخدم حدّث لبناء 3 عبر TestFlight، فتح التطبيق، عمل بلا أي تعطّل.

**درس مهم للمستقبل**: أي مكوّن Firebase/Native SDK يُهيَّأ تلقائياً عند تحميل الإضافة
(Plugin load) — تحقّق دائماً أن ملفات الإعداد (`GoogleService-Info.plist`،
`google-services.json`) موجودة فعلاً في **نفس البناء** المرفوع، لا فقط في الفرع.

### 2) 🎉 أندرويد وصل فعلياً لـProduction (Google وافقت على Produktionszugriff)

بعد الموافقة، بنينا ورفعنا مباشرة (بلا المرور بالاختبار المغلق مجدداً):
- **versionCode 9 / 1.7**: رُفع أولاً للاختبار المغلق (قبل وصول الموافقة).
- **versionCode 10 / 1.8**: يضمّ كل شيء (9 + إصلاح زر التالي) — **رُفع مباشرة لمسار
  Production** واختير "Alle Länder" (كل الدول، لا استثناء فرنسا هنا — القيد كان خاصاً
  بآبل فقط). أُرسل للمراجعة بنجاح، **الحالة الآن: "Wird überprüft" (قيد مراجعة Google)**.
- ملاحظة تقنية: `Versionshinweise` (ملاحظات الإصدار) في Play Console تتطلّب صيغة خاصة
  بوسوم اللغة، وليس نصاً عادياً:
  ```
  <ar>
  نص الملاحظات هنا
  </ar>
  ```
  رمز اللغة `ar` فقط بلا لاحقة إقليمية (`ar-SA` مرفوض/"Nicht unterstützte Sprache").
- إقرار **Werbe-ID (Advertising ID)** كان يحتاج إجابة "Ja" (نعم) وليس "Nein" —
  Firebase Analytics يُدرج إذن `com.google.android.gms.permission.AD_ID` فعلياً في
  **manifest الحزمة (Bundle) النهائي**، حتى لو لم يظهر في `merged_manifest` الخاص
  بـAPK العادي (تحقّق من
  `app/build/intermediates/bundle_manifest/release/.../AndroidManifest.xml` تحديداً
  لا غيره). السبب المختار للاستخدام: "Analyse" فقط (لا إعلانات فعلية في الكود).

### 3) 🔴 تحديث حرج: Google Play Billing Library (مهلة 31.08.2026)

Google Play يرفض أي تحديث يستخدم Billing Library أقل من v8 اعتباراً من 31.08.2026.
مكتبة `@squareetlabs/capacitor-subscriptions` (تُستخدم فقط لتدفّق شراء iOS، لكنها تحمل
تبعية Android أيضاً حتى لو غير مُستدعاة من الواجهة) كانت على 7.1.1.

- رُفعت لـ**9.1.0** (أحدث إصدار، يمنح مهلة حتى 2028).
- هذا كسر واجهات برمجية (breaking API changes) داخل الإضافة نفسها — أُصلحت يدوياً:
  - `queryProductDetailsAsync` الآن يُرجع `QueryProductDetailsResult` وليس `List`
    مباشرة → `.getProductDetailsList().get(0)`.
  - `queryPurchaseHistoryAsync`/`QueryPurchaseHistoryParams`/`PurchaseHistoryRecord`
    **أُزيلت بالكامل** من المكتبة — أُعيدت كتابة `getLatestTransaction()` لاستخدام
    `queryPurchasesAsync` (نفس نمط `getCurrentEntitlements()` الموجود أصلاً).
- `minSdkVersion` رُفع من 22 إلى **23** (متطلَّب من المكتبة الجديدة، يستثني فقط أجهزة
  2015 وما قبل).
- ⚠️ **الإضافة موجودة داخل `node_modules`** (غير متتبَّعة في git أصلاً) — التعديل
  مُثبَّت بشكل دائم عبر **`patch-package`**: `android-app/patches/@squareetlabs+...patch`
  + سكربت `postinstall` في `android-app/package.json`. **أي `npm install` مستقبلي
  سيُطبِّق التصحيح تلقائياً — لا تحذف مجلد `patches/`**.
- **تحقّقتُ حيّاً على المحاكي**: هذا مهم لأن `BillingClient.startConnection()` يعمل
  تلقائياً عند كل إقلاع تطبيق على أندرويد (بغضّ النظر عن الاستخدام الفعلي)، فكان خطر
  تعطّل حقيقي شبيه ببند iOS أعلاه، وليس مجرد خطأ ترجمة (compile) فقط.

### 4) إصلاح واجهة: "زر التالي" لم يكن يظهر بلا سحب الشاشة يدوياً

طفل قد لا ينتبه لضرورة السحب لأعلى لرؤية زر "التالي ←" بعد إجابة صحيحة. أُضيفت دالة
`revealNextBtn()` (بديلة عن `document.querySelector('.btn-next').classList.add('show')`
المباشرة في 8 مواضع) تُمرّر الشاشة تلقائياً (`scrollIntoView smooth`) عند ظهور الزر.
لا تغيير تصميمي، فقط سلوك إضافي. **تحقّقتُ حيّاً على المحاكي** (حالة اصطناعية بفائض
محتوى) أن التمرير يحدث فعلاً عند الحاجة، ولا يحدث شيء إن كان الزر ظاهراً أصلاً.

### 5) Stripe: SEPA مفعَّل + ملف الشركة مكتمل

- **SEPA-Lastschriftverfahren مفعَّل** (بانتظار موافقة Stripe التلقائية) — يدعم
  الدفعات المتكررة، مناسب للسوق الألماني.
- **رقم الهاتف وُثِّق** (كان ناقصاً، يمنع سحب الأموال Auszahlungen).
- **Kontostatus تحقّقنا**: "Es sind keine aktiven Aufgaben abzuschließen" — لا نواقص
  أخرى (فقط Cartes Bancaires الفرنسي معلَّق، غير مؤثِّر).
- تصحيح نص السعر: عرض أندرويد كان يقول "2 يورو" بينما Stripe الفعلي **1.99€** — صُحِّح
  النص في `horofi-v11-9-29.html` (`isIOS ? '2.99...' : '1.99...'`).

### 6) 🔴 عالقون حالياً: لا يمكن ربط بناء iOS (4) بأول مراجعة اشتراك — بانتظار Apple Support

آبل تشترط أن أول اشتراك تلقائي التجديد **يُرسَل مع نسخة تطبيق (Build) في نفس الحزمة**.
لكن على صفحة "iOS-App Version 1.0"، قسم "Build" يعرض البناء القديم (2) من دورة الرفض
الأولى، **ولا يظهر أي زر "+" لتغييره** كما تصف توثيق آبل الرسمي بالضبط. جُرِّب:
- إزالة البناء من الصف (لا خيار).
- "Neue Übermittlung erstellen" (إنشاء إرسال جديد) — نفس المشكلة.
- تكبير الشاشة/تصغير التكبير (Zoom) تحسّباً لواجهة متجاوبة تُخفي الزر — لا فرق.
- كل الأماكن المحتملة لزر ⊕ (بجانب "Build"، بجانب "Element bereit zur Übermittlung"
  في نافذة المسودة) — لا يوجد.

هذا يطابق شكاوى حقيقية من مطوّرين آخرين على منتديات آبل لنفس المشكلة بالضبط. **أُرسلت
تذكرة دعم لآبل** (developer.apple.com/contact → App-Rezension → Andere Fragen) تصف
المشكلة بدقة وتطلب حلاً فورياً + تأكيداً أنها لن تتكرر. **بانتظار الردّ.**

✅ **أُنجز أثناء ذلك** (لا علاقة له بالعقدة أعلاه):
- صورة مراجعة الاشتراك (Screenshot في Prüfinformationen): اكتُشف أن آبل تطلب **مقاساً
  دقيقاً بالضبط 640×920 بكسل** (وليس "على الأقل" كما ظُنّ سابقاً) — أي بكسل واحد زيادة
  يُرفض برسالة "Mindestens ein Screenshot weist falsche Maße auf". وُلِّدت صورة صحيحة
  بهذا المقاس بالضبط (`chrome --headless=new --window-size=640,920 --screenshot=...`
  بلا `--force-device-scale-factor` الذي يُفسِد التوسيط)، رُفعت بنجاح.
- صورة "Bild (optional)" الترويجية (1024×1024): استُخدم
  `android-app/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  (الشعار الرسمي بدقة كاملة) بدل `img/icon.png` القديم (192×192 فقط، غير صالح).
- Lokalisierung لمجموعة الاشتراك: أُضيفت العربية باسم عرض "اشتراك صحّح حروفك".

### 7) أمان: ملفان حسّاسان كانا في مجلد المشروع

`رقم سر الشهادة.jpg` (كلمة مرور شهادة توقيع Codemagic بنص صريح) و
`Apple Developer Portal interegration.jpg` (Issuer ID/Key ID الحقيقيَّين لمفتاح
App Store Connect API) كانا ملفَّين فضفاضين في جذر المشروع (غير مُلتزَمَين بـgit، لكن
خطر إن شُورك المجلد). **أُخرجا من المجلد بمعرفة المستخدم** — تحقّقتُ من زوالهما.

### مهام متبقية فعلية

- **بانتظار ردّ Apple Support** بخصوص عقدة ربط البناء (البند 6) — الأولوية القصوى.
- بعد حلّها: ربط البناء 4 بمراجعة الاشتراك، إرسال الاثنين معاً لمراجعة آبل الكاملة.
- بانتظار ردّ Google على مراجعة Production لأندرويد — **versionCode 11**، أُرسلت
  فعلياً للمراجعة بتاريخ 17.08.2026 (انظر قسم "الأحدث" أعلاه؛ versionCode 10
  السابق لم يكن قد أُرسل فعلياً رغم توثيق سابق يقول العكس).
- بعد نشر الاثنين فعلياً للجمهور: حذف `prelaunch` من `index.html` (لا يزال موجوداً).
- وثيقة فرنسا لآبل (ANSSI Export Compliance) — مؤجَّلة بقرار المستخدم، iOS مستبعد
  فرنسا مؤقتاً من التوزيع.
- صور `img/*-Kopie.png` المكرَّرة — تنظيف اختياري غير عاجل.
- توسعة قائمة بلدان اختيار الطفل لكل دول العالم (نسبة عربية مُشكَّلة لكل دولة) —
  مؤجَّلة بطلب المستخدم صراحة.

## سابقاً: اشتراك iOS الحقيقي + الإعداد المالي/الضريبي (08.08.2026)

- **الدفع الحقيقي على iOS مُنجَز بالكامل** (كود + خادم): `com.Horofi.monthly2eur`،
  2.99€/شهر، مكوّن `@squareetlabs/capacitor-subscriptions@1.0.25` (Capacitor 6،
  **ليس** RevenueCat)، مكتبة `@apple/app-store-server-library` على الخادم للتحقق
  الحقيقي (`verifyAppleSubscription`, `appleServerNotifications`).
- **App Store Connect المالي/الضريبي/التعاقدي مكتمل بالكامل**: Paid Apps Agreement
  موقَّع، حساب بنكي Aktiv، نماذج ضريبية W-8BEN Aktiv، طلب Apple Small Business Program
  مُرسَل، DAC7 "Nein" (ليس تطبيق وساطة). Sandbox Tester:
  `arch.mohamedmerie+sandbox1@gmail.com` / Deutschland.
- **رفض Apple الأول (Submission 163ac6d2) أُصلح بالكامل** — 3 أسباب: اختيار جنس الطفل
  إلزامي بلا حظر، إخفاء زر شراء Stripe على iOS (`Capacitor.getPlatform()==='ios'`)،
  الإجابة الصادقة عن أسئلة التحليلات/الإعلانات. `IPHONEOS_DEPLOYMENT_TARGET` رُفع لـ15.0.
- **مزامنة بيانات الأطفال لـFirestore**: كانت في `localStorage` فقط (خطر ضياع حقيقي)،
  الآن `syncChildrenToCloud()`/`pullChildrenFromCloud()` + حماية `firestore.rules`
  الكاملة لحقول الاشتراك (لا تُكتَب إلا من Cloud Function).
- **Firebase على iOS أُنشئ من الصفر** (`firebase apps:create IOS`)، معالج أخطاء JS
  عام (`_reportJsError`) يصل لـCrashlytics.

## بنية المشروع

- **الملف الرئيسي**: `horofi-v11-9-29.html` — مصدر الحقيقة الوحيد لأندرويد وiOS معاً
  (فحص المنصّة عبر `Capacitor.getPlatform()` داخل نفس الملف). كل تعديل يُنسخ بعده:
  ```
  cp horofi-v11-9-29.html android-app/www/index.html
  cd android-app && npx cap sync android && npx cap sync ios
  ```
- **أندرويد**: `android-app/android/` — بناء محلي:
  ```
  cd android-app/android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease
  ```
  رفع رقم `versionCode`/`versionName` في `app/build.gradle` قبل كل بناء release جديد.
  اختبار عبر محاكي `Pixel_8_stable` **فقط** (لا تُشغِّل محاكيَين معاً، تحقّق بـ
  `tasklist | grep qemu` أولاً). عند تعليق adb بعد استخدام طويل: `adb kill-server`
  ثم أعد تشغيل المحاكي نفسه (ليس فقط adb) إن ظهر الجهاز "offline".
- **iOS**: `android-app/ios/` — **لا بناء محلي على ويندوز**، فقط عبر Codemagic
  (رمز API يُطلب من المستخدم في كل جلسة، لا يُحفظ):
  ```bash
  TOKEN='...'; APP_ID='6a673beaf1d3a42a0686a30b'
  curl -s -X POST -H "x-auth-token: $TOKEN" -H "Content-Type: application/json" \
    -d "{\"appId\":\"$APP_ID\",\"workflowId\":\"ios-testflight\",\"branch\":\"main\"}" \
    https://api.codemagic.io/builds
  ```
  رفع `CURRENT_PROJECT_VERSION` في `project.pbxproj` قبل كل بناء (آبل ترفض تكرار الرقم).
  `ios-simulator-build` للتحقق السريع بلا نشر، `ios-testflight` (موقَّع، يرفع فعلياً)
  فقط بتأكيد صريح من المستخدم في كل مرة.
- **الخلفية**: `horofi/index.js` — أربع Cloud Functions (`stripeWebhook`،
  `createPortalSession`، `verifyAppleSubscription`، `appleServerNotifications`)، تُنشر
  معاً عبر `firebase deploy --only functions:horofi`. `firestore.rules` منفصلة.

## أدوات التصحيح المهمة

**Chrome DevTools Protocol على WebView التطبيق** (أدقّ من `adb shell input tap`):
```bash
ADB="/c/Users/m-hm1/AppData/Local/Android/Sdk/platform-tools/adb.exe"
"$ADB" shell cat /proc/net/unix | grep -o "webview_devtools_remote[^ ]*"
"$ADB" forward tcp:9333 localabstract:webview_devtools_remote_XXXXX
curl -s http://localhost:9333/json   # يعطي webSocketDebuggerUrl
```
ثم `node cdp_eval.js "<wsUrl>" "<jsExpression>"` (سكربت Node صغير بـ`Runtime.evaluate`،
بلا حزم خارجية — أعد كتابته من هذا الملف إن لزم، انظر تاريخ git لنسخة كاملة).

**لقطات شاشة بمقاس دقيق لمتاجر التطبيقات**: `chrome.exe --headless=new
--window-size=W,H --screenshot=out.png "file:///path.html"` — **بلا**
`--force-device-scale-factor` (يُفسِد التوسيط RTL). لمحتوى JS ديناميكي، أضف `<script>`
في نهاية `<body>` يزيّف `window.Capacitor` ويستدعي دالة التنقّل المطلوبة مباشرة.

## معروف/مؤجَّل

- قائمة كاملة لما قبل الإطلاق موجودة في ذاكرة كلود الدائمة
  (`horofi_prelaunch_checklist.md`).
- دراسة استقرار إنتاج شاملة نُشرت كـArtifact في جلسة سابقة.
