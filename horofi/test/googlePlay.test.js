/* اختبارات منطق Google Play النقيّ — node --test */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isGoogleSubscriptionProduct,
  googleEntitlement,
  googleLifetimeEntitlement,
  googleStatusLabel,
  googleVoidedKind,
  googleTokenKey,
  isPlausiblePurchaseToken,
} = require("../googlePlay");

const NOW = Date.parse("2026-10-17T12:00:00Z");
const future = new Date(NOW + 86400000).toISOString();
const past = new Date(NOW - 86400000).toISOString();
const sub = (productId, state, expiryTime = future) => ({
  subscriptionState: state,
  lineItems: [{ productId, expiryTime }],
});

test("منتجا الاشتراك معروفان، والدائم ليس اشتراكاً", () => {
  assert.equal(isGoogleSubscriptionProduct("horofi_monthly"), true);
  assert.equal(isGoogleSubscriptionProduct("horofi_yearly"), true);
  assert.equal(isGoogleSubscriptionProduct("horofi_lifetime"), false);
  assert.equal(isGoogleSubscriptionProduct("constructor"), false);
});

test("googleEntitlement: يعيد المنتج والخطة للشهري والسنوي", () => {
  const m = googleEntitlement(sub("horofi_monthly", "SUBSCRIPTION_STATE_ACTIVE"), NOW);
  assert.equal(m.entitled, true);
  assert.equal(m.productId, "horofi_monthly");
  assert.equal(m.plan, "monthly");
  const y = googleEntitlement(sub("horofi_yearly", "SUBSCRIPTION_STATE_ACTIVE"), NOW);
  assert.equal(y.plan, "yearly");
  assert.equal(y.productId, "horofi_yearly");
});

test("googleEntitlement: الحالات التي تمنح الوصول وغيرها", () => {
  const e = (state, exp) => googleEntitlement(sub("horofi_yearly", state, exp), NOW).entitled;
  assert.equal(e("SUBSCRIPTION_STATE_IN_GRACE_PERIOD"), true);
  assert.equal(e("SUBSCRIPTION_STATE_CANCELED", future), true);
  assert.equal(e("SUBSCRIPTION_STATE_CANCELED", past), false);
  for (const s of ["SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_EXPIRED", "SUBSCRIPTION_STATE_PAUSED",
    "SUBSCRIPTION_STATE_PENDING", "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"]) {
    assert.equal(e(s), false, s);
  }
  assert.equal(googleEntitlement({ lineItems: [{ productId: "horofi_monthly" }] }, NOW).state, "SUBSCRIPTION_STATE_UNSPECIFIED");
});

test("googleEntitlement: منتج غريب أو فارغ مرفوض", () => {
  assert.equal(googleEntitlement(sub("horofi_lifetime", "SUBSCRIPTION_STATE_ACTIVE"), NOW).valid, false);
  assert.equal(googleEntitlement(sub("other", "SUBSCRIPTION_STATE_ACTIVE"), NOW).reason, "wrong-product");
  assert.equal(googleEntitlement(null).valid, false);
});

test("googleLifetimeEntitlement: مدفوع / ملغى / معلّق / اختباري / بحاجة لتأكيد", () => {
  assert.deepEqual(googleLifetimeEntitlement({ purchaseState: 0, acknowledgementState: 0 }), {
    valid: true, entitled: true, pending: false, needsAck: true, test: false,
  });
  assert.equal(googleLifetimeEntitlement({ purchaseState: 0, acknowledgementState: 1 }).needsAck, false);
  assert.equal(googleLifetimeEntitlement({ purchaseState: 1 }).entitled, false);
  const pending = googleLifetimeEntitlement({ purchaseState: 2 });
  assert.equal(pending.entitled, false);
  assert.equal(pending.pending, true);
  assert.equal(googleLifetimeEntitlement({ purchaseState: 0, purchaseType: 0 }).test, true);
  assert.equal(googleLifetimeEntitlement({}).entitled, false); // غياب الحالة ≠ مدفوع
  assert.equal(googleLifetimeEntitlement(null).valid, false);
});

test("googleVoidedKind: من productType أو من الربط المحفوظ", () => {
  assert.equal(googleVoidedKind(2, "subscription"), "lifetime");
  assert.equal(googleVoidedKind(1, "lifetime"), "subscription");
  assert.equal(googleVoidedKind(undefined, "lifetime"), "lifetime");
  assert.equal(googleVoidedKind(undefined, undefined), "subscription"); // ربط قديم = اشتراك
});

test("أدوات مساعدة كما كانت", () => {
  assert.equal(googleStatusLabel("SUBSCRIPTION_STATE_IN_GRACE_PERIOD"), "in_grace_period");
  assert.equal(googleStatusLabel(undefined), "unspecified");
  assert.equal(googleTokenKey("abc"), googleTokenKey("abc"));
  assert.notEqual(googleTokenKey("abc"), googleTokenKey("abd"));
  assert.equal(isPlausiblePurchaseToken("a".repeat(20)), true);
  assert.equal(isPlausiblePurchaseToken("short"), false);
  assert.equal(isPlausiblePurchaseToken("a".repeat(19) + "/"), false);
});
