/*
  Google Play Billing — منطق نقيّ بلا أي اتصال (يُختبَر مباشرة بلا نشر ولا شبكة)
  ────────────────────────────────────────────────────────
  الخادم لا يثق أبداً بما يقوله التطبيق: يسأل Google عن حالة الشراء عبر
  purchases.subscriptionsv2 ثم يقرّر هنا وحده هل يُفتح الوصول.
  مرجع الحالات: https://developer.android.com/google/play/billing/lifecycle/subscriptions
*/
const crypto = require("crypto");

const GOOGLE_PACKAGE_NAME = "com.horofi.app";
// Google لا يقبل الأحرف الكبيرة في معرّف المنتج، فهو مختلف عمداً عن معرّف آبل com.Horofi.monthly2eur
const GOOGLE_SUBSCRIPTION_PRODUCT_ID = "horofi_monthly";

/* الحالات التي تمنح الوصول:
   - ACTIVE: مدفوع وساري.
   - IN_GRACE_PERIOD: فشل التجديد وGoogle يعيد المحاولة — الوصول يبقى (هذا جوهر ميزة فترة السماح).
   - CANCELED مع expiryTime في المستقبل: المستخدم أوقف التجديد لكن الشهر المدفوع لم ينتهِ.
   كل ما عداها لا يمنح الوصول: ON_HOLD (انتهت فترة السماح بلا دفع)، EXPIRED، PAUSED،
   PENDING (دفع معلّق لم يكتمل)، PENDING_PURCHASE_CANCELED، UNSPECIFIED. */
function googleEntitlement(sub, now = Date.now()) {
  if (!sub || typeof sub !== "object") return { valid: false, reason: "empty" };
  const item = (sub.lineItems || []).find((li) => li && li.productId === GOOGLE_SUBSCRIPTION_PRODUCT_ID);
  if (!item) return { valid: false, reason: "wrong-product" };
  const state = sub.subscriptionState || "SUBSCRIPTION_STATE_UNSPECIFIED";
  const expiry = item.expiryTime ? Date.parse(item.expiryTime) : 0;
  const entitled =
    state === "SUBSCRIPTION_STATE_ACTIVE" ||
    state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" ||
    (state === "SUBSCRIPTION_STATE_CANCELED" && expiry > now);
  return { valid: true, entitled, state, expiry };
}

/* SUBSCRIPTION_STATE_IN_GRACE_PERIOD ← "in_grace_period" — نفس أسلوب paymentStatus لآبل وStripe */
function googleStatusLabel(state) {
  return String(state || "").replace(/^SUBSCRIPTION_STATE_/, "").toLowerCase() || "unspecified";
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
  GOOGLE_SUBSCRIPTION_PRODUCT_ID,
  googleEntitlement,
  googleStatusLabel,
  googleTokenKey,
  isPlausiblePurchaseToken,
};
