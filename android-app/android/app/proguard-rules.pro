# قواعد R8 لتطبيق صحّح حروفك (Capacitor + WebView)
# قواعد Capacitor نفسها تأتي من consumer-rules داخل :capacitor-android
# (تُبقي كل @CapacitorPlugin وكل ما يرث Plugin)، وقواعد Billing/Firebase من ملفات AAR الخاصة بها.

# أسماء الملفات وأرقام الأسطر لتقارير Crashlytics المقروءة
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# جسر JavaScript ↔ WebView: أي دالة موسومة @JavascriptInterface يجب أن تحتفظ باسمها
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# إضافات التطبيق الأصلية (احتياط صريح فوق قاعدة Capacitor العامة)
-keep class com.squareetlabs.capacitor.subscriptions.** { *; }
-keep class io.capawesome.capacitorjs.plugins.firebase.** { *; }
-keep class com.horofi.app.** { *; }

# Google Play Billing: الأصناف التي تُبنى عبر JSON/التأمّل
-keep class com.android.vending.billing.** { *; }
-keep class com.android.billingclient.** { *; }
