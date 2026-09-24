/*
  Webhook Stripe — التحقق الحقيقي من الدفع قبل تفعيل الاشتراك
  ────────────────────────────────────────────────────────
  هذه الدالة هي المصدر الوحيد الموثوق لتفعيل حقل subscribed في Firestore.
  الواجهة الأمامية (horofi-v11-9-29.html) لا تستطيع أبداً تفعيل الاشتراك
  بنفسها — فقط تقرأ الحالة التي كتبتها هذه الدالة بعد تحقق حقيقي من Stripe.

  إعداد المفاتيح (السرّية، لا تُكتب في الكود إطلاقاً):
    firebase functions:secrets:set STRIPE_SECRET_KEY
    firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
  (سيطلب منك لصق القيمة في الطرفية، ثم يخزّنها مشفّرة في Google Cloud Secret Manager)

  النشر:
    firebase deploy --only functions:horofi
*/

const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const fs = require("fs");
const path = require("path");

admin.initializeApp();
const db = admin.firestore();

// ── الأسرار: تُقرأ فقط وقت التشغيل من Secret Manager، لا تُخزَّن في الكود أبداً ──
const stripeSecretKey    = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

// ── مفاتيح آبل (App Store Connect API Key، من إعداد المستخدم في Users and Access → Integrations → In-App Purchase) ──
const appleIssuerId   = defineSecret("APPLE_ISSUER_ID");
const appleKeyId      = defineSecret("APPLE_KEY_ID");
const applePrivateKey = defineSecret("APPLE_PRIVATE_KEY"); // محتوى ملف .p8 كاملاً (بما فيه أسطر BEGIN/END)
const APPLE_BUNDLE_ID = "com.horofi.app";
const APPLE_SUBSCRIPTION_PRODUCT_ID = "com.Horofi.monthly2eur";

exports.stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    // نستورد stripe هنا (بعد توفر المفتاح السرّي وقت التشغيل الفعلي)
    const stripe = require("stripe")(stripeSecretKey.value());

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      // req.rawBody متوفر تلقائياً في Cloud Functions (لا حاجة لتحليل JSON يدوياً)
      event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret.value());
    } catch (err) {
      logger.error("❌ توقيع Webhook غير صالح:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      // client_reference_id = uid المستخدم في Firebase Auth (نُرسله من الواجهة الأمامية)
      const uid = session.client_reference_id;

      if (!uid) {
        logger.warn("⚠️ جلسة دفع بدون client_reference_id — تم تجاهلها");
        res.status(200).send("OK (no uid)");
        return;
      }

      try {
        await db.collection("users").doc(uid).set(
          {
            subscribed: true,
            subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
            stripeCustomerId: session.customer || null,
            stripeSessionId: session.id,
          },
          { merge: true }
        );
        logger.info(`✅ تم تفعيل الاشتراك للمستخدم ${uid}`);
      } catch (err) {
        logger.error("خطأ في كتابة Firestore:", err);
        res.status(500).send("Firestore write failed");
        return;
      }
    }

    // الاشتراك انتهى فعلياً (إمّا بعد إلغاء المستخدم من بوابة العميل وانتهاء فترة الفوترة، أو فشل تجديد الدفع)
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const customerId = sub.customer;
      try {
        const snap = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.set({ subscribed: false, paymentStatus: "canceled" }, { merge: true });
          logger.info(`⛔ تم إلغاء الاشتراك فعلياً للعميل ${customerId}`);
        } else {
          logger.warn(`⚠️ لم يُعثر على مستخدم مرتبط بالعميل ${customerId}`);
        }
      } catch (err) {
        logger.error("خطأ في تحديث حالة الإلغاء:", err);
        res.status(500).send("Firestore write failed");
        return;
      }
    }

    // فشل تحصيل دفعة تجديد (بطاقة منتهية/رصيد غير كافٍ...). لا نُلغي الاشتراك هنا فوراً —
    // Stripe يعيد المحاولة تلقائياً (Smart Retries) ثم يُرسل customer.subscription.deleted
    // لاحقاً إن استمر الفشل. هذا الحدث فقط يُسجّل الحالة كي تكون مرئية (دعم/تنبيه مستقبلي)
    // بدل أن يبقى المستخدم "مُفعَّلاً" بصمت دون أي أثر لفشل الدفع.
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      try {
        const snap = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.set(
            { paymentStatus: "failed", lastPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          );
          logger.warn(`⚠️ فشل تحصيل دفعة للعميل ${customerId}`);
        } else {
          logger.warn(`⚠️ لم يُعثر على مستخدم مرتبط بالعميل ${customerId} (invoice.payment_failed)`);
        }
      } catch (err) {
        logger.error("خطأ في تسجيل فشل الدفع:", err);
        res.status(500).send("Firestore write failed");
        return;
      }
    }

    // أي تغيير آخر في حالة الاشتراك (past_due، trialing، active بعد تعافي من فشل دفع...) —
    // نُسجّل الحالة الحالية دوماً كمرجع، دون التأثير على subscribed (يبقى فقط بيد
    // checkout.session.completed و customer.subscription.deleted كما كان).
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object;
      const customerId = sub.customer;
      try {
        const snap = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.set({ paymentStatus: sub.status }, { merge: true });
          logger.info(`ℹ️ حالة اشتراك العميل ${customerId} أصبحت: ${sub.status}`);
        }
      } catch (err) {
        logger.error("خطأ في تحديث حالة الاشتراك:", err);
        res.status(500).send("Firestore write failed");
        return;
      }
    }

    res.status(200).send("OK");
  }
);

/*
  إنشاء جلسة بوابة العميل (Stripe Customer Portal) — تتيح للمستخدم إدارة
  أو إلغاء اشتراكه بأمان مباشرة عبر صفحة Stripe الرسمية، دون أن نلمس
  بيانات الدفع من جهتنا إطلاقاً.
*/
exports.createPortalSession = onCall(
  { secrets: [stripeSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
    }
    const uid = request.auth.uid;
    const doc = await db.collection("users").doc(uid).get();
    const customerId = doc.exists ? doc.data().stripeCustomerId : null;
    if (!customerId) {
      throw new HttpsError("failed-precondition", "لا يوجد اشتراك مرتبط بهذا الحساب");
    }
    const stripe = require("stripe")(stripeSecretKey.value());
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: "https://archmohamedmerie-coder.github.io/horofi/privacy.html",
    });
    return { url: session.url };
  }
);

/*
  ══════════════════════════════════════════════════════════════════════════
  تحقّق اشتراكات آبل (iOS) — مشابه تماماً لمنطق Stripe أعلاه لكن عبر
  App Store Server API (مكتبة آبل الرسمية @apple/app-store-server-library)
  بدل Stripe. نفس المبدأ: الواجهة الأمامية لا تُفعّل subscribed بنفسها أبداً،
  فقط هذا الملف بعد تحقق حقيقي من خوادم آبل.

  إعداد المفاتيح (App Store Connect → Users and Access → Integrations →
  In-App Purchase → أنشئ مفتاحاً جديداً، انسخ Issuer ID وKey ID، ونزّل ملف .p8
  مرة واحدة فقط):
    firebase functions:secrets:set APPLE_ISSUER_ID
    firebase functions:secrets:set APPLE_KEY_ID
    firebase functions:secrets:set APPLE_PRIVATE_KEY   (الصق محتوى ملف .p8 كاملاً)

  النشر:
    firebase deploy --only functions:horofi
  ══════════════════════════════════════════════════════════════════════════
*/
const {
  AppStoreServerAPIClient,
  SignedDataVerifier,
  Environment,
} = require("@apple/app-store-server-library");

const appleRootCA = fs.readFileSync(path.join(__dirname, "certs", "AppleRootCA-G3.cer"));

function appleApiClient(environment) {
  return new AppStoreServerAPIClient(
    applePrivateKey.value(),
    appleKeyId.value(),
    appleIssuerId.value(),
    APPLE_BUNDLE_ID,
    environment
  );
}
function appleVerifier(environment) {
  return new SignedDataVerifier([appleRootCA], true, environment, APPLE_BUNDLE_ID);
}

/*
  آبل لا تخبرنا مسبقاً إن كانت معاملة ما (transactionId) من بيئة Sandbox أم
  Production — المعاملة الحقيقية دائماً بيئة Production، لكن اختبار TestFlight
  ينتج معاملات Sandbox فقط. النمط الموثّق من آبل: نجرّب Production أولاً،
  وإن أعادت "غير موجودة" نجرّب Sandbox.
*/
async function fetchAppleTransaction(transactionId) {
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const client = appleApiClient(environment);
      const info = await client.getTransactionInfo(transactionId);
      const verifier = appleVerifier(environment);
      const decoded = await verifier.verifyAndDecodeTransaction(info.signedTransactionInfo);
      return { decoded, environment };
    } catch (err) {
      logger.warn(`⚠️ تعذّر جلب المعاملة ${transactionId} من بيئة ${environment}:`, err.message);
    }
  }
  return null;
}

exports.verifyAppleSubscription = onCall(
  { secrets: [appleIssuerId, appleKeyId, applePrivateKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
    }
    const uid = request.auth.uid;
    const transactionId = request.data && request.data.transactionId;
    if (!transactionId) {
      throw new HttpsError("invalid-argument", "transactionId مفقود");
    }

    const result = await fetchAppleTransaction(transactionId);
    if (!result) {
      throw new HttpsError("not-found", "تعذّر التحقق من المعاملة لدى آبل");
    }
    const { decoded, environment } = result;

    if (decoded.bundleId !== APPLE_BUNDLE_ID || decoded.productId !== APPLE_SUBSCRIPTION_PRODUCT_ID) {
      logger.error(`❌ معاملة لا تطابق التطبيق/المنتج: ${JSON.stringify(decoded)}`);
      throw new HttpsError("permission-denied", "المعاملة لا تخص هذا الاشتراك");
    }
    if (decoded.revocationReason !== undefined || (decoded.expiresDate && decoded.expiresDate < Date.now())) {
      throw new HttpsError("failed-precondition", "الاشتراك غير فعّال حالياً");
    }

    await db.collection("users").doc(uid).set(
      {
        subscribed: true,
        subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
        applePlatform: true,
        appleOriginalTransactionId: decoded.originalTransactionId,
        appleEnvironment: environment,
      },
      { merge: true }
    );
    // فهرس عكسي: يسمح لإشعارات آبل اللاحقة (تجديد/إلغاء) بإيجاد المستخدم عبر
    // originalTransactionId فقط (لا تحمل الإشعارات uid الخاص بنا مطلقاً).
    await db.collection("appleTransactions").doc(decoded.originalTransactionId).set({ uid }, { merge: true });

    logger.info(`✅ تم تفعيل اشتراك آبل للمستخدم ${uid} (${environment})`);
    return { subscribed: true };
  }
);

/* ── App Store Server Notifications V2 — تجديد/إلغاء/استرداد يصل تلقائياً بلا فتح التطبيق ── */
exports.appleServerNotifications = onRequest(
  { secrets: [appleIssuerId, appleKeyId, applePrivateKey] },
  async (req, res) => {
    const signedPayload = req.body && req.body.signedPayload;
    if (!signedPayload) {
      res.status(400).send("Missing signedPayload");
      return;
    }

    let notification, transaction, environment;
    for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
      try {
        const verifier = appleVerifier(env);
        notification = await verifier.verifyAndDecodeNotification(signedPayload);
        if (notification.data && notification.data.signedTransactionInfo) {
          transaction = await verifier.verifyAndDecodeTransaction(notification.data.signedTransactionInfo);
        }
        environment = env;
        break;
      } catch (err) {
        logger.warn(`⚠️ فشل التحقق من إشعار آبل ببيئة ${env}:`, err.message);
      }
    }
    if (!notification) {
      logger.error("❌ توقيع إشعار آبل غير صالح");
      res.status(400).send("Invalid signature");
      return;
    }
    if (!transaction || !transaction.originalTransactionId) {
      // إشعارات لا تحمل معاملة (TEST مثلاً) — نُقرّ بالاستلام فقط
      res.status(200).send("OK (no transaction)");
      return;
    }

    const mapDoc = await db.collection("appleTransactions").doc(transaction.originalTransactionId).get();
    if (!mapDoc.exists) {
      logger.warn(`⚠️ لا يوجد مستخدم مرتبط بمعاملة آبل ${transaction.originalTransactionId}`);
      res.status(200).send("OK (no uid mapping)");
      return;
    }
    const uid = mapDoc.data().uid;
    const type = notification.notificationType;

    try {
      if (type === "SUBSCRIBED" || type === "DID_RENEW") {
        await db.collection("users").doc(uid).set(
          { subscribed: true, paymentStatus: "active", appleEnvironment: environment },
          { merge: true }
        );
        logger.info(`✅ آبل: تفعيل/تجديد اشتراك ${uid}`);
      } else if (type === "EXPIRED" || type === "GRACE_PERIOD_EXPIRED" || type === "REVOKE") {
        await db.collection("users").doc(uid).set(
          { subscribed: false, paymentStatus: type.toLowerCase() },
          { merge: true }
        );
        logger.info(`⛔ آبل: إلغاء اشتراك ${uid} (${type})`);
      } else if (type === "REFUND") {
        await db.collection("users").doc(uid).set(
          { subscribed: false, paymentStatus: "refunded" },
          { merge: true }
        );
        logger.info(`↩️ آبل: استرداد اشتراك ${uid}`);
      } else if (type === "DID_FAIL_TO_RENEW") {
        // مثل invoice.payment_failed في Stripe: لا نُلغي فوراً، آبل تعيد المحاولة تلقائياً
        await db.collection("users").doc(uid).set(
          { paymentStatus: "failed", lastPaymentFailedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        logger.warn(`⚠️ آبل: فشل تجديد دفع ${uid}`);
      } else {
        // تغييرات معلوماتية أخرى (DID_CHANGE_RENEWAL_STATUS...) — تُسجَّل فقط دون تأثير على subscribed
        logger.info(`ℹ️ إشعار آبل ${type} للمستخدم ${uid} — بلا تأثير على subscribed`);
      }
    } catch (err) {
      logger.error("خطأ في كتابة Firestore (إشعار آبل):", err);
      res.status(500).send("Firestore write failed");
      return;
    }

    res.status(200).send("OK");
  }
);

/* ══════════════════════════════════════════════════════════════════════
   Google Play Billing — نفس مبدأ آبل: التطبيق لا يفعّل شيئاً بنفسه
   ──────────────────────────────────────────────────────────────────────
   verifyGoogleSubscription: التطبيق يرسل purchaseToken فقط؛ الخادم يسأل Google
     (purchases.subscriptionsv2) ويقرّر عبر googleEntitlement في googlePlay.js.
   googlePlayNotifications: إشعارات Google الفورية (RTDN) عبر Pub/Sub — تجديد،
     فترة سماح، تعليق، إلغاء، انتهاء، استرداد. في كل إشعار نسأل Google عن الحالة
     الحقيقية بدل الوثوق بنوع الإشعار (الإشعارات قد تصل متأخرة أو بغير ترتيب).
   الصلاحية: حساب خدمة الدوال مدعوّ في Play Console (Users & permissions) — لا مفاتيح سرّية.
   ══════════════════════════════════════════════════════════════════════ */
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { GoogleAuth } = require("google-auth-library");
const {
  GOOGLE_PACKAGE_NAME,
  GOOGLE_SUBSCRIPTION_PRODUCT_ID,
  googleEntitlement,
  googleStatusLabel,
  googleTokenKey,
  isPlausiblePurchaseToken,
} = require("./googlePlay");

const GOOGLE_RTDN_TOPIC = "play-rtdn";
const ANDROID_PUBLISHER = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}`;
const googleAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] });

async function fetchGoogleSubscription(purchaseToken) {
  const client = await googleAuth.getClient();
  const res = await client.request({
    url: `${ANDROID_PUBLISHER}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  });
  return res.data;
}

/* بلا تأكيد خلال 3 أيام تستردّ Google المال تلقائياً. الإضافة تؤكّد من الجهاز، وهذا احتياط
   لو أُغلق التطبيق قبل ذلك أو كان الشراء معلّقاً. */
async function acknowledgeGoogleSubscription(purchaseToken) {
  const client = await googleAuth.getClient();
  await client.request({
    url: `${ANDROID_PUBLISHER}/purchases/subscriptions/${GOOGLE_SUBSCRIPTION_PRODUCT_ID}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    method: "POST",
    data: {},
  });
}

/* خطأ نهائي من Google (رمز غير صالح/غير موجود) — لا فائدة من إعادة المحاولة */
function isPermanentGoogleError(err) {
  const status = err && err.response && err.response.status;
  return status === 400 || status === 404 || status === 410;
}

exports.verifyGoogleSubscription = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
  }
  const uid = request.auth.uid;
  const purchaseToken = request.data && request.data.purchaseToken;
  if (!isPlausiblePurchaseToken(purchaseToken)) {
    throw new HttpsError("invalid-argument", "purchaseToken مفقود أو غير صالح");
  }

  let sub;
  try {
    sub = await fetchGoogleSubscription(purchaseToken);
  } catch (err) {
    logger.warn(`⚠️ تعذّر جلب اشتراك Google (${err && err.response && err.response.status}):`, err.message);
    throw new HttpsError("not-found", "تعذّر التحقق من الشراء لدى Google");
  }

  const ent = googleEntitlement(sub);
  if (!ent.valid) {
    logger.error(`❌ شراء Google لا يطابق المنتج (${ent.reason}): ${JSON.stringify(sub.lineItems || [])}`);
    throw new HttpsError("permission-denied", "الشراء لا يخص هذا الاشتراك");
  }
  if (!ent.entitled) {
    throw new HttpsError("failed-precondition", `الاشتراك غير فعّال حالياً (${googleStatusLabel(ent.state)})`);
  }

  if (sub.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING") {
    try {
      await acknowledgeGoogleSubscription(purchaseToken);
      logger.info(`✅ Google: أُكِّد استلام الشراء من الخادم للمستخدم ${uid}`);
    } catch (err) {
      // لا نُفشل التفعيل بسببه: الإضافة تؤكّد من الجهاز أيضاً، والإشعارات اللاحقة تعيد المحاولة
      logger.warn("⚠️ تعذّر تأكيد استلام شراء Google:", err.message);
    }
  }

  const key = googleTokenKey(purchaseToken);
  await db.collection("users").doc(uid).set(
    {
      subscribed: true,
      subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
      googlePlatform: true,
      googlePurchaseKey: key,
      googleTestPurchase: !!sub.testPurchase,
      paymentStatus: googleStatusLabel(ent.state),
    },
    { merge: true }
  );
  // فهرس عكسي كـappleTransactions: الإشعارات تحمل purchaseToken فقط، لا uid الخاص بنا
  await db.collection("googlePurchases").doc(key).set({ uid, purchaseToken }, { merge: true });

  logger.info(`✅ تم تفعيل اشتراك Google للمستخدم ${uid}${sub.testPurchase ? " (شراء اختباري)" : ""}`);
  return { subscribed: true };
});

exports.googlePlayNotifications = onMessagePublished(
  { topic: GOOGLE_RTDN_TOPIC, retry: true },
  async (event) => {
    let msg;
    try {
      msg = event.data.message.json;
    } catch (err) {
      logger.error("❌ رسالة RTDN غير قابلة للقراءة:", err.message);
      return;
    }
    if (!msg || msg.packageName !== GOOGLE_PACKAGE_NAME) {
      logger.warn(`⚠️ RTDN لحزمة غير متوقعة: ${msg && msg.packageName}`);
      return;
    }
    if (msg.testNotification) {
      logger.info("ℹ️ Google RTDN: إشعار تجريبي من Play Console — القناة تعمل");
      return;
    }

    // استرداد/إبطال من Google أو البنك: يُقفل فوراً
    if (msg.voidedPurchaseNotification) {
      const token = msg.voidedPurchaseNotification.purchaseToken;
      const map = token ? await db.collection("googlePurchases").doc(googleTokenKey(token)).get() : null;
      if (map && map.exists) {
        await db.collection("users").doc(map.data().uid).set(
          { subscribed: false, paymentStatus: "refunded" },
          { merge: true }
        );
        logger.info(`↩️ Google: استرداد/إبطال شراء للمستخدم ${map.data().uid}`);
      }
      return;
    }

    const n = msg.subscriptionNotification;
    if (!n || !n.purchaseToken) {
      logger.info("ℹ️ Google RTDN بلا subscriptionNotification — تجاهل");
      return;
    }

    let sub;
    try {
      sub = await fetchGoogleSubscription(n.purchaseToken);
    } catch (err) {
      if (isPermanentGoogleError(err)) {
        logger.warn(`⚠️ Google RTDN: رمز غير صالح (${err.response.status}) — تجاهل`);
        return;
      }
      throw err; // خطأ مؤقت ← Pub/Sub يعيد المحاولة (retry: true)
    }

    const key = googleTokenKey(n.purchaseToken);
    let map = await db.collection("googlePurchases").doc(key).get();
    // إعادة اشتراك/تغيير خطة: Google يصدر رمزاً جديداً يشير إلى القديم عبر linkedPurchaseToken
    if (!map.exists && sub.linkedPurchaseToken) {
      const old = await db.collection("googlePurchases").doc(googleTokenKey(sub.linkedPurchaseToken)).get();
      if (old.exists) {
        await db.collection("googlePurchases").doc(key).set(
          { uid: old.data().uid, purchaseToken: n.purchaseToken },
          { merge: true }
        );
        map = await db.collection("googlePurchases").doc(key).get();
      }
    }
    if (!map.exists) {
      // الشراء لم يُتحقَّق منه من التطبيق بعد — verifyGoogleSubscription سيُنشئ الربط
      logger.info(`ℹ️ Google RTDN (نوع ${n.notificationType}) لرمز غير مربوط بعد — تجاهل`);
      return;
    }

    const uid = map.data().uid;
    const ent = googleEntitlement(sub);
    if (!ent.valid) {
      logger.warn(`⚠️ Google RTDN لمنتج غير متوقع للمستخدم ${uid} — تجاهل`);
      return;
    }
    const update = {
      subscribed: ent.entitled,
      paymentStatus: googleStatusLabel(ent.state),
      googlePlatform: true,
      googlePurchaseKey: key,
    };
    if (ent.state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" || ent.state === "SUBSCRIPTION_STATE_ON_HOLD") {
      update.lastPaymentFailedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await db.collection("users").doc(uid).set(update, { merge: true });
    logger.info(`${ent.entitled ? "✅" : "⛔"} Google RTDN نوع ${n.notificationType}: ${uid} ← ${update.paymentStatus}`);
  }
);
