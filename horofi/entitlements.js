/*
  الوصول المدفوع — منطق نقيّ مشترك بين آبل وGoogle (يُختبَر بلا نشر ولا شبكة)
  ────────────────────────────────────────────────────────
  ثلاثة خيارات: شهري، سنوي (اشتراكان متجدّدان)، وشراء دائم لمرة واحدة.
  مستند users/{uid} يحمل مصدرَي وصول مستقلَّين:
    - subscriptionActive: اشتراك (شهري/سنوي) ساري من أي متجر.
    - lifetime: شراء دائم لم يُسترَدّ.
  والحقل الذي يقرؤه التطبيق (subscribed) **مشتقّ دائماً** منهما ولا يُكتب يدوياً:
    subscribed = lifetime || subscriptionActive
  هكذا لا يُقفل انتهاءُ اشتراك قديم حسابَ من اشترى الشراء الدائم، ولا يُقفل
  استردادُ الشراء الدائم اشتراكاً ما زال سارياً.
*/

const PLAN_MONTHLY = "monthly";
const PLAN_YEARLY = "yearly";
const PLAN_LIFETIME = "lifetime";

/* معرّفات آبل. الشهري اسمه قديم (السعر الفعلي 2.99 €). الشهري والسنوي في **نفس
   مجموعة الاشتراك** في App Store Connect كي تتولّى آبل الانتقال بينهما.
   الدائم من نوع Non-Consumable. */
const APPLE_PRODUCTS = {
  "com.Horofi.monthly2eur": { kind: "subscription", plan: PLAN_MONTHLY },
  "com.horofi.yearly": { kind: "subscription", plan: PLAN_YEARLY },
  "com.horofi.lifetime": { kind: "lifetime", plan: PLAN_LIFETIME },
};

function appleProduct(productId) {
  return Object.prototype.hasOwnProperty.call(APPLE_PRODUCTS, productId) ? APPLE_PRODUCTS[productId] : null;
}

/* مستند قديم (قبل هذا التغيير) لا يحمل subscriptionActive: كان subscribed يعني
   الاشتراك وحده، فنحوّله إلى الحقل الجديد قبل أي دمج كي لا يضيع. */
function subscriptionActiveOf(doc) {
  if (doc && typeof doc.subscriptionActive === "boolean") return doc.subscriptionActive;
  return !!(doc && doc.subscribed === true);
}

/* ما يُكتب في المستند بعد تطبيق تغيير (patch) على حالته الحالية (doc).
   يعيد التغيير نفسه + subscriptionActive المحسوم + subscribed المشتقّ. */
function mergeEntitlement(doc, patch) {
  const current = doc || {};
  const subscriptionActive =
    patch && typeof patch.subscriptionActive === "boolean" ? patch.subscriptionActive : subscriptionActiveOf(current);
  const lifetime = patch && typeof patch.lifetime === "boolean" ? patch.lifetime : current.lifetime === true;
  return { ...patch, subscriptionActive, subscribed: lifetime || subscriptionActive };
}

/* حكم على معاملة آبل مفكوكة وموثَّقة التوقيع (JWSTransactionDecodedPayload) */
function appleTransactionVerdict(decoded, bundleId, now = Date.now()) {
  if (!decoded || decoded.bundleId !== bundleId) return { valid: false, reason: "wrong-bundle" };
  const product = appleProduct(decoded.productId);
  if (!product) return { valid: false, reason: "wrong-product" };
  if (product.kind === "lifetime" && decoded.type && decoded.type !== "Non-Consumable") {
    return { valid: false, reason: "wrong-type" };
  }
  const revoked = decoded.revocationReason !== undefined || decoded.revocationDate !== undefined;
  const expired = product.kind === "subscription" && !!decoded.expiresDate && decoded.expiresDate < now;
  return { valid: true, entitled: !revoked && !expired, kind: product.kind, plan: product.plan };
}

/* تغيير المستند المطلوب لإشعار App Store Server Notifications V2؛ null = لا أثر على الوصول.
   اختيار الأثر حسب **منتج المعاملة** لا حسب نوع الإشعار وحده. */
function appleNotificationPatch(type, subtype, productId) {
  const product = appleProduct(productId);
  if (!product) return null;

  if (product.kind === "lifetime") {
    if (type === "REFUND" || type === "REVOKE") return { lifetime: false, paymentStatus: "refunded" };
    if (type === "REFUND_REVERSED" || type === "ONE_TIME_CHARGE") return { lifetime: true };
    return null;
  }

  if (type === "SUBSCRIBED" || type === "DID_RENEW") {
    return { subscriptionActive: true, subscriptionPlan: product.plan, paymentStatus: "active" };
  }
  if (type === "DID_CHANGE_RENEWAL_PREF" && subtype === "UPGRADE") {
    // الترقية (شهري ← سنوي) فورية عند آبل: المعاملة الجديدة للسنوي
    return { subscriptionPlan: product.plan };
  }
  if (type === "EXPIRED" || type === "GRACE_PERIOD_EXPIRED" || type === "REVOKE") {
    return { subscriptionActive: false, paymentStatus: type.toLowerCase() };
  }
  if (type === "REFUND") return { subscriptionActive: false, paymentStatus: "refunded" };
  // لا نُلغي فوراً: آبل تعيد المحاولة تلقائياً
  if (type === "DID_FAIL_TO_RENEW") return { paymentStatus: "failed" };
  return null;
}

/* كل الحسابات المرتبطة بشراء واحد: الاستعادة الصامتة قد تفتح الشراء نفسه لحساب ضيف
   جديد على نفس الجهاز، فالاسترداد/الانتهاء يجب أن يصل إليها جميعاً لا إلى آخرها فقط. */
function mappedUids(data) {
  if (!data) return [];
  const all = [...(Array.isArray(data.uids) ? data.uids : []), data.uid];
  return [...new Set(all.filter((u) => typeof u === "string" && u.length > 0))];
}

module.exports = {
  PLAN_MONTHLY,
  PLAN_YEARLY,
  PLAN_LIFETIME,
  APPLE_PRODUCTS,
  appleProduct,
  subscriptionActiveOf,
  mergeEntitlement,
  appleTransactionVerdict,
  appleNotificationPatch,
  mappedUids,
};
