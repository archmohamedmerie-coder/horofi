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

admin.initializeApp();
const db = admin.firestore();

// ── الأسرار: تُقرأ فقط وقت التشغيل من Secret Manager، لا تُخزَّن في الكود أبداً ──
const stripeSecretKey    = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

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
          await snap.docs[0].ref.set({ subscribed: false }, { merge: true });
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
