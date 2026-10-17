/* اختبارات المنطق النقيّ للوصول المدفوع — node --test (بلا أي حزمة إضافية) */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  appleProduct,
  mergeEntitlement,
  appleTransactionVerdict,
  appleNotificationPatch,
  mappedUids,
} = require("../entitlements");

const BUNDLE = "com.horofi.app";
const NOW = Date.parse("2026-10-17T12:00:00Z");

test("منتجات آبل الثلاثة معروفة، وغيرها مرفوض", () => {
  assert.deepEqual(appleProduct("com.Horofi.monthly2eur"), { kind: "subscription", plan: "monthly" });
  assert.deepEqual(appleProduct("com.horofi.yearly"), { kind: "subscription", plan: "yearly" });
  assert.deepEqual(appleProduct("com.horofi.lifetime"), { kind: "lifetime", plan: "lifetime" });
  assert.equal(appleProduct("com.horofi.monthly2eur"), null); // المعرّف حسّاس لحالة الأحرف
  assert.equal(appleProduct("toString"), null); // لا خصائص موروثة من Object
  assert.equal(appleProduct(undefined), null);
});

test("mergeEntitlement: الشراء الدائم يفتح الوصول بلا اشتراك", () => {
  assert.deepEqual(mergeEntitlement({}, { lifetime: true }), {
    lifetime: true,
    subscriptionActive: false,
    subscribed: true,
  });
});

test("mergeEntitlement: انتهاء اشتراك قديم لا يُقفل صاحب الشراء الدائم", () => {
  const doc = { lifetime: true, subscriptionActive: true, subscribed: true };
  const out = mergeEntitlement(doc, { subscriptionActive: false, paymentStatus: "expired" });
  assert.equal(out.subscribed, true);
  assert.equal(out.subscriptionActive, false);
});

test("mergeEntitlement: استرداد الشراء الدائم لا يُقفل اشتراكاً سارياً", () => {
  const doc = { lifetime: true, subscriptionActive: true, subscribed: true };
  assert.equal(mergeEntitlement(doc, { lifetime: false }).subscribed, true);
});

test("mergeEntitlement: استرداد الشراء الدائم بلا اشتراك يُقفل", () => {
  const doc = { lifetime: true, subscriptionActive: false, subscribed: true };
  assert.equal(mergeEntitlement(doc, { lifetime: false }).subscribed, false);
});

test("mergeEntitlement: مستند قديم (subscribed فقط) يُحوَّل ولا يضيع اشتراكه", () => {
  const legacy = { subscribed: true, paymentStatus: "active" };
  const out = mergeEntitlement(legacy, { lifetime: true });
  assert.equal(out.subscriptionActive, true);
  assert.equal(out.subscribed, true);
  // ثم استرداد الدائم: الاشتراك القديم ما زال يفتح الوصول
  assert.equal(mergeEntitlement({ ...legacy, ...out }, { lifetime: false }).subscribed, true);
});

test("mergeEntitlement: تغيير لا يمسّ الوصول (فشل دفع) يبقي الحالة كما هي", () => {
  const doc = { subscriptionActive: true, subscribed: true };
  assert.deepEqual(mergeEntitlement(doc, { paymentStatus: "failed" }), {
    paymentStatus: "failed",
    subscriptionActive: true,
    subscribed: true,
  });
  assert.equal(mergeEntitlement({}, { paymentStatus: "failed" }).subscribed, false);
});

test("mergeEntitlement: lifetime غير منطقي (نص) لا يُعدّ صحيحاً", () => {
  assert.equal(mergeEntitlement({ lifetime: "yes" }, {}).subscribed, false);
});

test("appleTransactionVerdict: اشتراك ساري / منتهٍ / مُبطَل", () => {
  const base = { bundleId: BUNDLE, productId: "com.horofi.yearly", type: "Auto-Renewable Subscription" };
  assert.deepEqual(appleTransactionVerdict({ ...base, expiresDate: NOW + 1000 }, BUNDLE, NOW), {
    valid: true, entitled: true, kind: "subscription", plan: "yearly",
  });
  assert.equal(appleTransactionVerdict({ ...base, expiresDate: NOW - 1000 }, BUNDLE, NOW).entitled, false);
  assert.equal(appleTransactionVerdict({ ...base, expiresDate: NOW + 1000, revocationReason: 0 }, BUNDLE, NOW).entitled, false);
  assert.equal(appleTransactionVerdict({ ...base, expiresDate: NOW + 1000, revocationDate: NOW }, BUNDLE, NOW).entitled, false);
});

test("appleTransactionVerdict: الشراء الدائم بلا تاريخ انتهاء يُقبل", () => {
  const d = { bundleId: BUNDLE, productId: "com.horofi.lifetime", type: "Non-Consumable" };
  assert.deepEqual(appleTransactionVerdict(d, BUNDLE, NOW), {
    valid: true, entitled: true, kind: "lifetime", plan: "lifetime",
  });
  assert.equal(appleTransactionVerdict({ ...d, revocationReason: 1 }, BUNDLE, NOW).entitled, false);
});

test("appleTransactionVerdict: رفض حزمة/منتج/نوع خاطئ", () => {
  assert.equal(appleTransactionVerdict({ bundleId: "x", productId: "com.horofi.yearly" }, BUNDLE, NOW).valid, false);
  assert.equal(appleTransactionVerdict({ bundleId: BUNDLE, productId: "other" }, BUNDLE, NOW).valid, false);
  assert.equal(
    appleTransactionVerdict({ bundleId: BUNDLE, productId: "com.horofi.lifetime", type: "Consumable" }, BUNDLE, NOW).reason,
    "wrong-type"
  );
  assert.equal(appleTransactionVerdict(null, BUNDLE, NOW).valid, false);
});

test("appleNotificationPatch: إشعارات الاشتراك", () => {
  assert.deepEqual(appleNotificationPatch("DID_RENEW", undefined, "com.horofi.yearly"), {
    subscriptionActive: true, subscriptionPlan: "yearly", paymentStatus: "active",
  });
  assert.deepEqual(appleNotificationPatch("EXPIRED", "VOLUNTARY", "com.Horofi.monthly2eur"), {
    subscriptionActive: false, paymentStatus: "expired",
  });
  assert.deepEqual(appleNotificationPatch("REFUND", undefined, "com.horofi.yearly"), {
    subscriptionActive: false, paymentStatus: "refunded",
  });
  assert.deepEqual(appleNotificationPatch("DID_FAIL_TO_RENEW", undefined, "com.horofi.yearly"), { paymentStatus: "failed" });
  assert.deepEqual(appleNotificationPatch("DID_CHANGE_RENEWAL_PREF", "UPGRADE", "com.horofi.yearly"), { subscriptionPlan: "yearly" });
  assert.equal(appleNotificationPatch("DID_CHANGE_RENEWAL_PREF", "DOWNGRADE", "com.Horofi.monthly2eur"), null);
  assert.equal(appleNotificationPatch("DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED", "com.horofi.yearly"), null);
});

test("appleNotificationPatch: إشعارات الشراء الدائم تمسّ lifetime وحده", () => {
  assert.deepEqual(appleNotificationPatch("REFUND", undefined, "com.horofi.lifetime"), { lifetime: false, paymentStatus: "refunded" });
  assert.deepEqual(appleNotificationPatch("REVOKE", undefined, "com.horofi.lifetime"), { lifetime: false, paymentStatus: "refunded" });
  assert.deepEqual(appleNotificationPatch("REFUND_REVERSED", undefined, "com.horofi.lifetime"), { lifetime: true });
  // إشعار من نوع الاشتراكات لا يجوز أن يمسّ الشراء الدائم
  assert.equal(appleNotificationPatch("EXPIRED", undefined, "com.horofi.lifetime"), null);
});

test("appleNotificationPatch: منتج مجهول ← لا أثر", () => {
  assert.equal(appleNotificationPatch("REFUND", undefined, "com.other.app"), null);
});

test("mappedUids: يجمع الحسابات بلا تكرار ويتجاهل القيم الفاسدة", () => {
  assert.deepEqual(mappedUids({ uid: "b", uids: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(mappedUids({ uid: "a" }), ["a"]); // ربط قديم قبل حقل uids
  assert.deepEqual(mappedUids({ uids: ["a", "", null, 5] }), ["a"]);
  assert.deepEqual(mappedUids(undefined), []);
});
