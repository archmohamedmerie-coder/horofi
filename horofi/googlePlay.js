/*
  Google Play Billing — منطق نقيّ بلا أي اتصال (يُختبَر مباشرة بلا نشر ولا شبكة)
  ────────────────────────────────────────────────────────
  الخادم لا يثق أبداً بما يقوله التطبيق: يسأل Google عن حالة الشراء عبر
  purchases.subscriptionsv2 (الاشتراكات) أو purchases.products (الشراء الدائم)
  ثم يقرّر هنا وحده هل يُفتح الوصول.
  مرجع الحالات: https://developer.android.com/google/play/billing/lifecycle/subscriptions
*/
const crypto = require("crypto");

const GOOGLE_PACKAGE_NAME = "com.horofi.app";
/* Google لا يقبل الأحرف الكبيرة في معرّف المنتج، فهي مختلفة عمداً عن معرّفات آبل.
   السنوي منتج اشتراك مستقل لا خطة ثانية داخل horofi_monthly: الإضافة في أندرويد
   تشتري دائماً أول عرض في المنتج (getSubscriptionOfferDetails().get(0)). */
const GOOGLE_SUBSCRIPTION_PRODUCTS = {
  horofi_monthly: "monthly",
  horofi_yearly: "yearly",
};
const GOOGLE_LIFETIME_PRODUCT_ID = "horofi_lifetime"; // منتج لمرة واحدة (INAPP، غير مستهلَك)

function isGoogleSubscriptionProduct(productId) {
  return Object.prototype.hasOwnProperty.call(GOOGLE_SUBSCRIPTION_PRODUCTS, productId);
}

/* الحالات التي تمنح الوصول:
   - ACTIVE: مدفوع وساري.
   - IN_GRACE_PERIOD: فشل التجديد وGoogle يعيد المحاولة — الوصول يبقى (هذا جوهر ميزة فترة السماح).
   - CANCELED مع expiryTime في المستقبل: المستخدم أوقف التجديد لكن المدة المدفوعة لم تنتهِ.
   كل ما عداها لا يمنح الوصول: ON_HOLD (انتهت فترة السماح بلا دفع)، EXPIRED، PAUSED،
   PENDING (دفع معلّق لم يكتمل)، PENDING_PURCHASE_CANCELED، UNSPECIFIED. */
function googleEntitlement(sub, now = Date.now()) {
  if (!sub || typeof sub !== "object") return { valid: false, reason: "empty" };
  const item = (sub.lineItems || []).find((li) => li && isGoogleSubscriptionProduct(li.productId));
  if (!item) return { valid: false, reason: "wrong-product" };
  const state = sub.subscriptionState || "SUBSCRIPTION_STATE_UNSPECIFIED";
  const expiry = item.expiryTime ? Date.parse(item.expiryTime) : 0;
  const entitled =
    state === "SUBSCRIPTION_STATE_ACTIVE" ||
    state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ||
    (state === "SUBSCRIPTION_STATE_CANCELED" && expiry > now);
  return {
    valid: true,
    entitled,
    state,
    expiry,
    productId: item.productId,
    plan: GOOGLE_SUBSCRIPTION_PRODUCTS[item.productId],
  };
}

/* الشراء الدائم (purchases.products.get، كائن ProductPurchase):
   purchaseState: 0 مدفوع، 1 أُلغي، 2 معلّق (دفع نقدي/بنكي لم يكتمل).
   acknowledgementState: 0 لم يُؤكَّد بعد ← بلا تأكيد خلال 3 أيام تستردّ Google المال.
   purchaseType: 0 شراء اختباري (License testing)؛ غيابه = شراء حقيقي.
   لا نعتمد على حقل productId في الاستجابة: المنتج محدَّد في عنوان الطلب نفسه،
   ورمز يخصّ منتجاً آخر تردّه Google بخطأ. */
function googleLifetimeEntitlement(purchase) {
  if (!purchase || typeof purchase !== "object") return { valid: false, reason: "empty" };
  const state = Number(purchase.purchaseState);
  return {
    valid: true,
    entitled: state === 0,
    pending: state === 2,
    needsAck: Number(purchase.acknowledgementState) === 0,
    test: purchase.purchaseType === 0,
  };
}

/* SUBSCRIPTION_STATE_IN_GRACE_PERIOD ← "in_grace_period" — نفس أسلوب paymentStatus لآبل */
function googleStatusLabel(state) {
  return String(state || "").replace(/^SUBSCRIPTION_STATE_/, "").toLowerCase() || "unspecified";
}

/* إبطال/استرداد (voidedPurchaseNotification): productType 1 اشتراك، 2 شراء لمرة واحدة.
   إن غاب الحقل نعتمد على نوع الشراء المحفوظ في googlePurchases عند التحقق. */
function googleVoidedKind(productType, mappedKind) {
  if (Number(productType) === 2) return "lifetime";
  if (Number(productType) === 1) return "subscription";
  return mappedKind === "lifetime" ? "lifetime" : "subscription";
}

/* معرّف مستند Firestore من رمز الشراء: الرمز طويل وقد يحوي محارف غير مناسبة لمعرّف
   مستند، فنستعمل بصمته. الرمز الأصلي يُحفَظ داخل المستند (مجموعة خادمية فقط). */
function googleTokenKey(purchaseToken) {
  return crypto.createHash("sha256").update(String(purchaseToken)).digest("hex");
}

/* تحقّق شكلي من رمز الشراء قبل إرساله لـGoogle */
function isPlausiblePurchaseToken(token) {
  return typeof token === "string" && token.length >= 20 && token.length <= 4096 && /^[A-Za-z0-9._\-]+$/.test(token);
}

module.exports = {
  GOOGLE_PACKAGE_NAME,
  GOOGLE_SUBSCRIPTION_PRODUCTS,
  GOOGLE_LIFETIME_PRODUCT_ID,
  isGoogleSubscriptionProduct,
  googleEntitlement,
  googleLifetimeEntitlement,
  googleStatusLabel,
  googleVoidedKind,
  googleTokenKey,
  isPlausiblePurchaseToken,
};
