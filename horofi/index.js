/*
  الوصول المدفوع يُباع حصرياً عبر متجرَي المنصّتين (App Store وGoogle Play) بثلاثة
  خيارات: شهري، سنوي، وشراء دائم لمرة واحدة — راجع verifyAppleSubscription
  وverifyGoogleSubscription أدناه (الاسمان قديمان ويشملان الخيارات الثلاثة كي تبقى
  النسخ المنشورة من التطبيق تعمل). الواجهة الأمامية (horofi-v11-9-29.html) لا
  تستطيع أبداً تفعيل الوصول بنفسها — فقط تقرأ الحالة التي يكتبها هذا الملف بعد
  تحقّق حقيقي من متجر المنصّة. قاعدة الحساب (subscribed مشتقّ من مصدرين) في entitlements.js.

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

const {
  mergeEntitlement,
  appleTransactionVerdict,
  appleNotificationPatch,
  mappedUids,
} = require("./entitlements");

/* كل كتابة تمسّ الوصول تمرّ من هنا: قراءة الحالة الحالية وكتابة subscribed المشتقّ
   في معاملة واحدة، كي لا يُفسد إشعاران متزامنان أحدهما الآخر.
   onlyExisting: الإشعارات لا تُنشئ مستنداً لحساب حذفه صاحبه. */
async function applyEntitlement(uid, patch, { onlyExisting = false } = {}) {
  const ref = db.collection("users").doc(uid);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists && onlyExisting) return null;
    const write = mergeEntitlement(snap.exists ? snap.data() : {}, patch);
    t.set(ref, write, { merge: true });
    return write;
  });
}

/* نفس التغيير لكل الحسابات المرتبطة بشراء واحد (انظر mappedUids) */
async function applyEntitlementToAll(uids, patch) {
  for (const uid of uids) {
    await applyEntitlement(uid, patch, { onlyExisting: true });
  }
}

// ── مفاتيح آبل (App Store Connect API Key، من إعداد المستخدم في Users and Access → Integrations → In-App Purchase) ──
const appleIssuerId   = defineSecret("APPLE_ISSUER_ID");
const appleKeyId      = defineSecret("APPLE_KEY_ID");
const applePrivateKey = defineSecret("APPLE_PRIVATE_KEY"); // محتوى ملف .p8 كاملاً (بما فيه أسطر BEGIN/END)
const APPLE_BUNDLE_ID = "com.horofi.app";
// معرّفات منتجات آبل الثلاثة في APPLE_PRODUCTS (entitlements.js)

/*
  ══════════════════════════════════════════════════════════════════════════
  تحقّق اشتراكات آبل (iOS) — عبر App Store Server API (مكتبة آبل الرسمية
  @apple/app-store-server-library)، ومثله تماماً verifyGoogleSubscription
  أدناه عبر Android Publisher API. نفس المبدأ: الواجهة الأمامية لا تُفعّل subscribed بنفسها أبداً،
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

    const verdict = appleTransactionVerdict(decoded, APPLE_BUNDLE_ID);
    if (!verdict.valid) {
      logger.error(`❌ معاملة لا تطابق التطبيق/المنتج (${verdict.reason}): ${JSON.stringify(decoded)}`);
      throw new HttpsError("permission-denied", "المعاملة لا تخص هذا التطبيق");
    }
    if (!verdict.entitled) {
      throw new HttpsError("failed-precondition", "الشراء غير فعّال حالياً");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const patch = verdict.kind === "lifetime"
      ? {
        lifetime: true,
        lifetimeAt: now,
        applePlatform: true,
        appleLifetimeTransactionId: decoded.originalTransactionId,
        appleEnvironment: environment,
      }
      : {
        subscriptionActive: true,
        subscriptionPlan: verdict.plan,
        subscribedAt: now,
        paymentStatus: "active",
        applePlatform: true,
        appleOriginalTransactionId: decoded.originalTransactionId,
        appleEnvironment: environment,
      };
    await applyEntitlement(uid, patch);
    // فهرس عكسي: يسمح لإشعارات آبل اللاحقة (تجديد/إلغاء/استرداد) بإيجاد كل الحسابات
    // المرتبطة عبر originalTransactionId فقط (لا تحمل الإشعارات uid الخاص بنا مطلقاً).
    await db.collection("appleTransactions").doc(decoded.originalTransactionId).set(
      { uid, uids: admin.firestore.FieldValue.arrayUnion(uid), productId: decoded.productId, kind: verdict.kind },
      { merge: true }
    );

    logger.info(`✅ آبل: تفعيل ${verdict.plan} للمستخدم ${uid} (${environment})`);
    return { subscribed: true, plan: verdict.plan };
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
    const uids = mappedUids(mapDoc.data());
    const type = notification.notificationType;
    // الأثر يُحدَّد حسب منتج المعاملة: استرداد الشراء الدائم لا يمسّ الاشتراك، وانتهاء
    // الاشتراك لا يمسّ الشراء الدائم (entitlements.js)
    const patch = appleNotificationPatch(type, notification.subtype, transaction.productId);
    if (!patch) {
      // تغييرات معلوماتية (DID_CHANGE_RENEWAL_STATUS...) أو منتج مجهول — تُسجَّل فقط
      logger.info(`ℹ️ إشعار آبل ${type}/${notification.subtype || "-"} (${transaction.productId}) للحسابات ${uids.join(",")} — بلا أثر`);
      res.status(200).send("OK (no effect)");
      return;
    }
    if (patch.paymentStatus === "failed") {
      patch.lastPaymentFailedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    if (patch.subscriptionActive === true || patch.lifetime === true) {
      patch.appleEnvironment = environment;
    }

    try {
      await applyEntitlementToAll(uids, patch);
      logger.info(`🍎 آبل ${type} (${transaction.productId}) ← ${JSON.stringify(patch)} للحسابات ${uids.join(",")}`);
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
   verifyGoogleSubscription: التطبيق يرسل purchaseToken (ومعرّف المنتج في النسخ الجديدة)؛
     الخادم يسأل Google ويقرّر عبر googlePlay.js:
       - اشتراك (شهري/سنوي): purchases.subscriptionsv2 ← googleEntitlement.
       - الشراء الدائم (productId = horofi_lifetime): purchases.products ← googleLifetimeEntitlement.
     النسخ المنشورة قبل هذا التغيير لا ترسل productId ⇒ مسار الاشتراك كما كان.
   googlePlayNotifications: إشعارات Google الفورية (RTDN) عبر Pub/Sub — تجديد،
     فترة سماح، تعليق، إلغاء، انتهاء، استرداد. في كل إشعار نسأل Google عن الحالة
     الحقيقية بدل الوثوق بنوع الإشعار (الإشعارات قد تصل متأخرة أو بغير ترتيب).
   الصلاحية: حساب خدمة الدوال مدعوّ في Play Console (Users & permissions) — لا مفاتيح سرّية.
   ══════════════════════════════════════════════════════════════════════ */
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { GoogleAuth } = require("google-auth-library");
const {
  GOOGLE_PACKAGE_NAME,
  GOOGLE_LIFETIME_PRODUCT_ID,
  isGoogleSubscriptionProduct,
  googleEntitlement,
  googleLifetimeEntitlement,
  googleStatusLabel,
  googleVoidedKind,
  googleTokenKey,
  isPlausiblePurchaseToken,
} = require("./googlePlay");

const GOOGLE_RTDN_TOPIC = "play-rtdn";
const ANDROID_PUBLISHER = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE_NAME}`;
const googleAuth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] });

async function googleRequest(pathAndQuery, method = "GET") {
  const client = await googleAuth.getClient();
  const res = await client.request({
    url: `${ANDROID_PUBLISHER}/${pathAndQuery}`,
    method,
    ...(method === "POST" ? { data: {} } : {}),
  });
  return res.data;
}
const tokenPath = (t) => encodeURIComponent(t);

function fetchGoogleSubscription(purchaseToken) {
  return googleRequest(`purchases/subscriptionsv2/tokens/${tokenPath(purchaseToken)}`);
}
function fetchGoogleProductPurchase(productId, purchaseToken) {
  return googleRequest(`purchases/products/${productId}/tokens/${tokenPath(purchaseToken)}`);
}

/* بلا تأكيد خلال 3 أيام تستردّ Google المال تلقائياً. الإضافة تؤكّد من الجهاز، وهذا احتياط
   لو أُغلق التطبيق قبل ذلك أو كان الشراء معلّقاً. نقطة التأكيد تختلف بين الاشتراك والشراء الدائم. */
function acknowledgeGoogleSubscription(productId, purchaseToken) {
  return googleRequest(`purchases/subscriptions/${productId}/tokens/${tokenPath(purchaseToken)}:acknowledge`, "POST");
}
function acknowledgeGoogleProduct(productId, purchaseToken) {
  return googleRequest(`purchases/products/${productId}/tokens/${tokenPath(purchaseToken)}:acknowledge`, "POST");
}

/* خطأ نهائي من Google (رمز غير صالح/غير موجود) — لا فائدة من إعادة المحاولة */
function isPermanentGoogleError(err) {
  const status = err && err.response && err.response.status;
  return status === 400 || status === 404 || status === 410;
}

/* فهرس عكسي كـappleTransactions: الإشعارات تحمل purchaseToken فقط، لا uid الخاص بنا.
   uids يحفظ كل حساب فُتح بهذا الشراء (الاستعادة الصامتة قد تفتحه لحساب ضيف جديد). */
function linkGooglePurchase(key, uid, purchaseToken, kind, productId) {
  return db.collection("googlePurchases").doc(key).set(
    { uid, uids: admin.firestore.FieldValue.arrayUnion(uid), purchaseToken, kind, productId },
    { merge: true }
  );
}

async function verifyGoogleLifetime(uid, purchaseToken) {
  let purchase;
  try {
    purchase = await fetchGoogleProductPurchase(GOOGLE_LIFETIME_PRODUCT_ID, purchaseToken);
  } catch (err) {
    logger.warn(`⚠️ تعذّر جلب شراء Google الدائم (${err && err.response && err.response.status}):`, err.message);
    throw new HttpsError("not-found", "تعذّر التحقق من الشراء لدى Google");
  }
  const ent = googleLifetimeEntitlement(purchase);
  if (!ent.valid) throw new HttpsError("permission-denied", "الشراء لا يخص هذا التطبيق");
  if (ent.pending) throw new HttpsError("failed-precondition", "الدفع ما زال معلّقاً لدى Google");
  if (!ent.entitled) throw new HttpsError("failed-precondition", "الشراء ملغى");

  if (ent.needsAck) {
    try {
      await acknowledgeGoogleProduct(GOOGLE_LIFETIME_PRODUCT_ID, purchaseToken);
      logger.info(`✅ Google: أُكِّد استلام الشراء الدائم من الخادم للمستخدم ${uid}`);
    } catch (err) {
      // لا نُفشل التفعيل بسببه: الإضافة تؤكّد من الجهاز أيضاً
      logger.warn("⚠️ تعذّر تأكيد استلام شراء Google الدائم:", err.message);
    }
  }

  const key = googleTokenKey(purchaseToken);
  await applyEntitlement(uid, {
    lifetime: true,
    lifetimeAt: admin.firestore.FieldValue.serverTimestamp(),
    googlePlatform: true,
    googleLifetimeKey: key,
    googleTestPurchase: ent.test,
  });
  await linkGooglePurchase(key, uid, purchaseToken, "lifetime", GOOGLE_LIFETIME_PRODUCT_ID);

  logger.info(`✅ Google: تفعيل الشراء الدائم للمستخدم ${uid}${ent.test ? " (شراء اختباري)" : ""}`);
  return { subscribed: true, plan: "lifetime" };
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
  const productId = request.data && request.data.productId;
  if (productId === GOOGLE_LIFETIME_PRODUCT_ID) {
    return verifyGoogleLifetime(uid, purchaseToken);
  }
  // غياب productId = نسخة قديمة من التطبيق (الشهري وحده) ⇒ مسار الاشتراك
  if (productId !== undefined && productId !== null && !isGoogleSubscriptionProduct(productId)) {
    throw new HttpsError("invalid-argument", "منتج غير معروف");
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
      await acknowledgeGoogleSubscription(ent.productId, purchaseToken);
      logger.info(`✅ Google: أُكِّد استلام الاشتراك من الخادم للمستخدم ${uid}`);
    } catch (err) {
      // لا نُفشل التفعيل بسببه: الإضافة تؤكّد من الجهاز أيضاً، والإشعارات اللاحقة تعيد المحاولة
      logger.warn("⚠️ تعذّر تأكيد استلام شراء Google:", err.message);
    }
  }

  const key = googleTokenKey(purchaseToken);
  await applyEntitlement(uid, {
    subscriptionActive: true,
    subscriptionPlan: ent.plan,
    subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
    googlePlatform: true,
    googlePurchaseKey: key,
    googleSubscriptionProductId: ent.productId,
    googleTestPurchase: !!sub.testPurchase,
    paymentStatus: googleStatusLabel(ent.state),
  });
  await linkGooglePurchase(key, uid, purchaseToken, "subscription", ent.productId);

  logger.info(`✅ Google: تفعيل ${ent.plan} للمستخدم ${uid}${sub.testPurchase ? " (شراء اختباري)" : ""}`);
  return { subscribed: true, plan: ent.plan };
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

    // استرداد/إبطال من Google أو البنك: يُقفل فوراً — الاشتراك أو الشراء الدائم حسب نوع المنتج،
    // ولكل الحسابات التي فُتحت بهذا الشراء
    if (msg.voidedPurchaseNotification) {
      const v = msg.voidedPurchaseNotification;
      const map = v.purchaseToken ? await db.collection("googlePurchases").doc(googleTokenKey(v.purchaseToken)).get() : null;
      if (map && map.exists) {
        const kind = googleVoidedKind(v.productType, map.data().kind);
        const patch = kind === "lifetime"
          ? { lifetime: false, paymentStatus: "refunded" }
          : { subscriptionActive: false, paymentStatus: "refunded" };
        const uids = mappedUids(map.data());
        await applyEntitlementToAll(uids, patch);
        logger.info(`↩️ Google: استرداد/إبطال (${kind}) للحسابات ${uids.join(",")}`);
      }
      return;
    }

    // الشراء الدائم يُفعَّل عبر verifyGoogleSubscription فقط (من التطبيق أو الاستعادة الصامتة)،
    // واسترداده يصل عبر voidedPurchaseNotification أعلاه — فإشعاراته الأخرى معلوماتية.
    if (msg.oneTimeProductNotification) {
      logger.info(`ℹ️ Google RTDN شراء لمرة واحدة (نوع ${msg.oneTimeProductNotification.notificationType}، ${msg.oneTimeProductNotification.sku}) — بلا أثر`);
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
        const oldUids = mappedUids(old.data());
        await db.collection("googlePurchases").doc(key).set(
          { uid: old.data().uid, uids: oldUids, purchaseToken: n.purchaseToken, kind: "subscription" },
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

    const uids = mappedUids(map.data());
    const ent = googleEntitlement(sub);
    if (!ent.valid) {
      logger.warn(`⚠️ Google RTDN لمنتج غير متوقع للحسابات ${uids.join(",")} — تجاهل`);
      return;
    }
    const patch = {
      subscriptionActive: ent.entitled,
      subscriptionPlan: ent.plan,
      paymentStatus: googleStatusLabel(ent.state),
      googlePlatform: true,
      googlePurchaseKey: key,
      googleSubscriptionProductId: ent.productId,
    };
    if (ent.state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" || ent.state === "SUBSCRIPTION_STATE_ON_HOLD") {
      patch.lastPaymentFailedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await applyEntitlementToAll(uids, patch);
    logger.info(`${ent.entitled ? "✅" : "⛔"} Google RTDN نوع ${n.notificationType} (${ent.productId}): ${uids.join(",")} ← ${patch.paymentStatus}`);
  }
);
