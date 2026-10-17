/*
  اختبارات تكامل لدوال index.js الحقيقية — بلا شبكة ولا نشر.
  تُستبدل الحزم الخارجية (firebase-admin، firebase-functions، google-auth-library،
  @apple/app-store-server-library) ببدائل في الذاكرة عبر اعتراض require، فيُختبر
  كود الدوال نفسه كما سيُنشر: التحقق، الإشعارات، والحساب المشتقّ لـsubscribed.
*/
const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("module");
const path = require("path");

/* ── Firestore في الذاكرة (ما يستعمله index.js فقط) ── */
const ARRAY_UNION = Symbol("arrayUnion");
const SERVER_TS = { __serverTimestamp: true };
const store = new Map(); // "users/uid" ← كائن
function applyMerge(prev, data) {
  const out = { ...(prev || {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v && v[ARRAY_UNION]) {
      const cur = Array.isArray(out[k]) ? out[k] : [];
      out[k] = [...cur, ...v[ARRAY_UNION].filter((x) => !cur.includes(x))];
    } else {
      out[k] = v;
    }
  }
  return out;
}
function docRef(p) {
  return {
    async get() {
      const d = store.get(p);
      return { exists: d !== undefined, data: () => (d === undefined ? undefined : { ...d }) };
    },
    async set(data, opts) {
      store.set(p, opts && opts.merge ? applyMerge(store.get(p), data) : applyMerge({}, data));
    },
  };
}
const fakeDb = {
  collection: (c) => ({ doc: (id) => ({ ...docRef(`${c}/${id}`), _path: `${c}/${id}` }) }),
  async runTransaction(fn) {
    return fn({ get: (ref) => ref.get(), set: (ref, data, opts) => ref.set(data, opts) });
  },
};
const fakeAdmin = {
  initializeApp() {},
  firestore: Object.assign(() => fakeDb, {
    FieldValue: { serverTimestamp: () => SERVER_TS, arrayUnion: (...xs) => ({ [ARRAY_UNION]: xs }) },
  }),
};

/* ── firebase-functions: كل مُغلِّف يعيد الدالة نفسها ── */
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const silent = { info() {}, warn() {}, error() {} };
const fakeFunctions = {
  "firebase-functions/v2/https": {
    HttpsError,
    onCall: (a, b) => (typeof a === "function" ? a : b),
    onRequest: (a, b) => (typeof a === "function" ? a : b),
  },
  "firebase-functions/v2/pubsub": { onMessagePublished: (opts, fn) => fn },
  "firebase-functions/params": { defineSecret: () => ({ value: () => "secret" }) },
  "firebase-functions/logger": silent,
};

/* ── Google Android Publisher: ردود يحدّدها كل اختبار حسب المسار ── */
let googleRoutes = {}; // "GET purchases/..." ← دالة/قيمة
const googleCalls = [];
const fakeGoogleAuth = {
  GoogleAuth: class {
    async getClient() {
      return {
        async request({ url, method = "GET" }) {
          const rel = url.replace(/^.*\/applications\/com\.horofi\.app\//, "");
          googleCalls.push(`${method} ${rel}`);
          const h = googleRoutes[`${method} ${rel}`];
          if (h === undefined) { const e = new Error("404"); e.response = { status: 404 }; throw e; }
          return { data: typeof h === "function" ? h() : h };
        },
      };
    }
  },
};

/* ── آبل: «التوقيع» هنا JSON صريح؛ المكتبة الحقيقية تتحقّق منه بالشهادة ── */
let appleTransactions = {}; // transactionId ← payload
const fakeApple = {
  Environment: { PRODUCTION: "Production", SANDBOX: "Sandbox" },
  AppStoreServerAPIClient: class {
    constructor(...a) { this.env = a[4]; }
    async getTransactionInfo(id) {
      if (this.env !== "Production" || !appleTransactions[id]) throw new Error("not found");
      return { signedTransactionInfo: JSON.stringify(appleTransactions[id]) };
    }
  },
  SignedDataVerifier: class {
    constructor(...a) { this.env = a[2]; }
    async verifyAndDecodeTransaction(s) { return JSON.parse(s); }
    async verifyAndDecodeNotification(s) {
      if (this.env !== "Production") throw new Error("env");
      return JSON.parse(s);
    }
  },
};

const mocks = {
  "firebase-admin": fakeAdmin,
  "google-auth-library": fakeGoogleAuth,
  "@apple/app-store-server-library": fakeApple,
  ...fakeFunctions,
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return origLoad.call(this, request, ...rest);
};
const fns = require(path.join(__dirname, "..", "index.js"));
Module._load = origLoad;

/* ── أدوات ── */
const TOKEN_M = "tok_monthly_1234567890";
const TOKEN_Y = "tok_yearly_12345678901";
const TOKEN_L = "tok_lifetime_123456789";
const future = () => new Date(Date.now() + 864e5).toISOString();
const past = () => new Date(Date.now() - 864e5).toISOString();
const subResp = (productId, state, expiryTime = future(), extra = {}) => ({
  subscriptionState: state, lineItems: [{ productId, expiryTime }], ...extra,
});
const user = (uid) => store.get(`users/${uid}`) || {};
const call = (fn, uid, data) => fn({ auth: uid ? { uid } : null, data });
const rtdn = (msg) => fns.googlePlayNotifications({ data: { message: { json: { packageName: "com.horofi.app", ...msg } } } });
function appleNotify(type, productId, originalTransactionId, subtype) {
  const res = { code: 0, body: "", status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; } };
  const signedPayload = JSON.stringify({
    notificationType: type, subtype,
    data: { signedTransactionInfo: JSON.stringify({ productId, originalTransactionId }) },
  });
  return fns.appleServerNotifications({ body: { signedPayload } }, res).then(() => res);
}
async function rejects(promise, code) {
  await assert.rejects(promise, (e) => e instanceof HttpsError && e.code === code);
}
test.beforeEach(() => { store.clear(); googleRoutes = {}; googleCalls.length = 0; appleTransactions = {}; });

/* ═════════════ Google ═════════════ */

test("Google: نسخة قديمة بلا productId — الشهري يعمل كما كان", async () => {
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_ACTIVE");
  const r = await call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_M });
  assert.deepEqual(r, { subscribed: true, plan: "monthly" });
  const u = user("u1");
  assert.equal(u.subscribed, true);
  assert.equal(u.subscriptionActive, true);
  assert.equal(u.subscriptionPlan, "monthly");
  assert.equal(u.googleSubscriptionProductId, "horofi_monthly");
});

test("Google: السنوي يُتحقَّق ويُؤكَّد استلامه على نقطة منتجه هو", async () => {
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_Y}`] =
    subResp("horofi_yearly", "SUBSCRIPTION_STATE_ACTIVE", future(), { acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING" });
  googleRoutes[`POST purchases/subscriptions/horofi_yearly/tokens/${TOKEN_Y}:acknowledge`] = {};
  const r = await call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_Y, productId: "horofi_yearly" });
  assert.equal(r.plan, "yearly");
  assert.ok(googleCalls.includes(`POST purchases/subscriptions/horofi_yearly/tokens/${TOKEN_Y}:acknowledge`));
  assert.equal(user("u1").subscriptionPlan, "yearly");
});

test("Google: الشراء الدائم — تحقّق وتأكيد استلام وفتح", async () => {
  googleRoutes[`GET purchases/products/horofi_lifetime/tokens/${TOKEN_L}`] = { purchaseState: 0, acknowledgementState: 0 };
  googleRoutes[`POST purchases/products/horofi_lifetime/tokens/${TOKEN_L}:acknowledge`] = {};
  const r = await call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" });
  assert.deepEqual(r, { subscribed: true, plan: "lifetime" });
  assert.ok(googleCalls.includes(`POST purchases/products/horofi_lifetime/tokens/${TOKEN_L}:acknowledge`));
  const u = user("u1");
  assert.equal(u.lifetime, true);
  assert.equal(u.subscriptionActive, false);
  assert.equal(u.subscribed, true);
  assert.equal(u.googleTestPurchase, false);
});

test("Google: الشراء الدائم المعلّق أو الملغى مرفوض ولا يكتب شيئاً", async () => {
  googleRoutes[`GET purchases/products/horofi_lifetime/tokens/${TOKEN_L}`] = { purchaseState: 2 };
  await rejects(call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" }), "failed-precondition");
  googleRoutes[`GET purchases/products/horofi_lifetime/tokens/${TOKEN_L}`] = { purchaseState: 1 };
  await rejects(call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" }), "failed-precondition");
  assert.equal(store.size, 0);
});

test("Google: رمز اشتراك مُرسَل على أنه دائم ⇒ Google لا يجده ⇒ مرفوض", async () => {
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_ACTIVE");
  await rejects(call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_M, productId: "horofi_lifetime" }), "not-found");
});

test("Google: منتج مجهول، أو بلا تسجيل دخول، أو رمز فاسد ⇒ مرفوض", async () => {
  await rejects(call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_M, productId: "hack" }), "invalid-argument");
  await rejects(call(fns.verifyGoogleSubscription, null, { purchaseToken: TOKEN_M }), "unauthenticated");
  await rejects(call(fns.verifyGoogleSubscription, "u1", { purchaseToken: "x/y" }), "invalid-argument");
});

test("Google: اشتراك منتهٍ مرفوض", async () => {
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_EXPIRED", past());
  await rejects(call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_M }), "failed-precondition");
});

test("Google RTDN: انتهاء الاشتراك لا يُقفل صاحب الشراء الدائم", async () => {
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_ACTIVE");
  await call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_M });
  googleRoutes[`GET purchases/products/horofi_lifetime/tokens/${TOKEN_L}`] = { purchaseState: 0, acknowledgementState: 1 };
  await call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" });

  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_EXPIRED", past());
  await rtdn({ subscriptionNotification: { notificationType: 13, purchaseToken: TOKEN_M } });
  const u = user("u1");
  assert.equal(u.subscriptionActive, false);
  assert.equal(u.paymentStatus, "expired");
  assert.equal(u.subscribed, true);
});

test("Google RTDN: استرداد الشراء الدائم يُقفل كل الحسابات المرتبطة ولا يمسّ اشتراكاً سارياً", async () => {
  googleRoutes[`GET purchases/products/horofi_lifetime/tokens/${TOKEN_L}`] = { purchaseState: 0, acknowledgementState: 1 };
  await call(fns.verifyGoogleSubscription, "guestOld", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" });
  await call(fns.verifyGoogleSubscription, "guestNew", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" });
  // guestNew عنده أيضاً اشتراك شهري ساري
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_ACTIVE");
  await call(fns.verifyGoogleSubscription, "guestNew", { purchaseToken: TOKEN_M });

  await rtdn({ voidedPurchaseNotification: { purchaseToken: TOKEN_L, productType: 2 } });
  assert.equal(user("guestOld").subscribed, false);
  assert.equal(user("guestOld").lifetime, false);
  assert.equal(user("guestNew").lifetime, false);
  assert.equal(user("guestNew").subscribed, true); // الشهري ما زال يفتح
});

test("Google RTDN: استرداد بلا productType يعتمد نوع الربط المحفوظ", async () => {
  googleRoutes[`GET purchases/products/horofi_lifetime/tokens/${TOKEN_L}`] = { purchaseState: 0, acknowledgementState: 1 };
  await call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" });
  await rtdn({ voidedPurchaseNotification: { purchaseToken: TOKEN_L } });
  assert.equal(user("u1").subscribed, false);
});

test("Google RTDN: حساب محذوف لا يُعاد إنشاؤه", async () => {
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_ACTIVE");
  await call(fns.verifyGoogleSubscription, "u1", { purchaseToken: TOKEN_M });
  store.delete("users/u1"); // «حذف الحساب نهائياً»
  await rtdn({ subscriptionNotification: { notificationType: 2, purchaseToken: TOKEN_M } });
  assert.equal(store.has("users/u1"), false);
});

test("Google RTDN: رمز جديد بعد إعادة اشتراك يرث كل الحسابات عبر linkedPurchaseToken", async () => {
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_M}`] = subResp("horofi_monthly", "SUBSCRIPTION_STATE_ACTIVE");
  await call(fns.verifyGoogleSubscription, "a", { purchaseToken: TOKEN_M });
  await call(fns.verifyGoogleSubscription, "b", { purchaseToken: TOKEN_M });
  googleRoutes[`GET purchases/subscriptionsv2/tokens/${TOKEN_Y}`] =
    subResp("horofi_yearly", "SUBSCRIPTION_STATE_ACTIVE", future(), { linkedPurchaseToken: TOKEN_M });
  await rtdn({ subscriptionNotification: { notificationType: 4, purchaseToken: TOKEN_Y } });
  assert.equal(user("a").subscriptionPlan, "yearly");
  assert.equal(user("b").subscriptionPlan, "yearly");
});

test("Google RTDN: إشعار شراء لمرة واحدة بلا أثر", async () => {
  await rtdn({ oneTimeProductNotification: { notificationType: 1, purchaseToken: TOKEN_L, sku: "horofi_lifetime" } });
  assert.equal(store.size, 0);
});

test("مستند قديم (subscribed:true بلا مصدر، كحساب المالك) يبقى مفتوحاً بعد شراء دائم ثم استرداده", async () => {
  store.set("users/owner", { subscribed: true });
  googleRoutes[`GET purchases/products/horofi_lifetime/tokens/${TOKEN_L}`] = { purchaseState: 0, acknowledgementState: 1 };
  await call(fns.verifyGoogleSubscription, "owner", { purchaseToken: TOKEN_L, productId: "horofi_lifetime" });
  await rtdn({ voidedPurchaseNotification: { purchaseToken: TOKEN_L, productType: 2 } });
  assert.equal(user("owner").subscribed, true);
});

/* ═════════════ Apple ═════════════ */

const appleTx = (productId, extra = {}) => ({
  bundleId: "com.horofi.app", productId, originalTransactionId: `orig_${productId}`, ...extra,
});

test("Apple: الشهري (نسخة قديمة) والسنوي والدائم كلها تُقبل", async () => {
  appleTransactions.m = appleTx("com.Horofi.monthly2eur", { expiresDate: Date.now() + 864e5 });
  appleTransactions.y = appleTx("com.horofi.yearly", { expiresDate: Date.now() + 864e5 });
  appleTransactions.l = appleTx("com.horofi.lifetime", { type: "Non-Consumable" });
  assert.equal((await call(fns.verifyAppleSubscription, "u1", { transactionId: "m" })).plan, "monthly");
  assert.equal((await call(fns.verifyAppleSubscription, "u2", { transactionId: "y" })).plan, "yearly");
  assert.equal((await call(fns.verifyAppleSubscription, "u3", { transactionId: "l" })).plan, "lifetime");
  assert.equal(user("u3").lifetime, true);
  assert.equal(user("u3").subscribed, true);
  assert.equal(user("u3").appleLifetimeTransactionId, "orig_com.horofi.lifetime");
  assert.deepEqual(store.get("appleTransactions/orig_com.horofi.lifetime").uids, ["u3"]);
});

test("Apple: منتج غريب / منتهٍ / مُسترَدّ مرفوض", async () => {
  appleTransactions.x = appleTx("com.other");
  appleTransactions.e = appleTx("com.horofi.yearly", { expiresDate: Date.now() - 1000 });
  appleTransactions.r = appleTx("com.horofi.lifetime", { type: "Non-Consumable", revocationReason: 0 });
  await rejects(call(fns.verifyAppleSubscription, "u1", { transactionId: "x" }), "permission-denied");
  await rejects(call(fns.verifyAppleSubscription, "u1", { transactionId: "e" }), "failed-precondition");
  await rejects(call(fns.verifyAppleSubscription, "u1", { transactionId: "r" }), "failed-precondition");
  await rejects(call(fns.verifyAppleSubscription, "u1", { transactionId: "none" }), "not-found");
  assert.equal(store.has("users/u1"), false);
});

test("Apple إشعارات: انتهاء الشهري لا يُقفل الدائم، واسترداد الدائم يُقفل", async () => {
  appleTransactions.m = appleTx("com.Horofi.monthly2eur", { expiresDate: Date.now() + 864e5 });
  appleTransactions.l = appleTx("com.horofi.lifetime", { type: "Non-Consumable" });
  await call(fns.verifyAppleSubscription, "u1", { transactionId: "m" });
  await call(fns.verifyAppleSubscription, "u1", { transactionId: "l" });

  let res = await appleNotify("EXPIRED", "com.Horofi.monthly2eur", "orig_com.Horofi.monthly2eur", "VOLUNTARY");
  assert.equal(res.code, 200);
  assert.equal(user("u1").subscribed, true);
  assert.equal(user("u1").subscriptionActive, false);

  res = await appleNotify("REFUND", "com.horofi.lifetime", "orig_com.horofi.lifetime");
  assert.equal(res.code, 200);
  assert.equal(user("u1").subscribed, false);
});

test("Apple إشعارات: ترقية شهري ← سنوي تحدّث الخطة، وتغيير معلوماتي بلا أثر", async () => {
  appleTransactions.m = appleTx("com.Horofi.monthly2eur", { expiresDate: Date.now() + 864e5 });
  await call(fns.verifyAppleSubscription, "u1", { transactionId: "m" });
  // الترقية تبقي نفس originalTransactionId والمعاملة الجديدة للسنوي
  await appleNotify("DID_CHANGE_RENEWAL_PREF", "com.horofi.yearly", "orig_com.Horofi.monthly2eur", "UPGRADE");
  assert.equal(user("u1").subscriptionPlan, "yearly");
  const res = await appleNotify("DID_CHANGE_RENEWAL_STATUS", "com.horofi.yearly", "orig_com.Horofi.monthly2eur", "AUTO_RENEW_DISABLED");
  assert.equal(res.body, "OK (no effect)");
  assert.equal(user("u1").subscribed, true);
});

test("Apple إشعارات: فشل التجديد يسجّل التاريخ ولا يُقفل", async () => {
  appleTransactions.y = appleTx("com.horofi.yearly", { expiresDate: Date.now() + 864e5 });
  await call(fns.verifyAppleSubscription, "u1", { transactionId: "y" });
  await appleNotify("DID_FAIL_TO_RENEW", "com.horofi.yearly", "orig_com.horofi.yearly");
  assert.equal(user("u1").paymentStatus, "failed");
  assert.equal(user("u1").lastPaymentFailedAt, SERVER_TS);
  assert.equal(user("u1").subscribed, true);
});

test("Apple إشعارات: ربط قديم (uid فقط، قبل هذا التغيير) ما زال يعمل", async () => {
  store.set("users/old", { subscribed: true, applePlatform: true });
  store.set("appleTransactions/orig_old", { uid: "old" });
  await appleNotify("EXPIRED", "com.Horofi.monthly2eur", "orig_old");
  assert.equal(user("old").subscribed, false);
});
