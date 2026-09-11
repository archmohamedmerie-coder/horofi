// @ts-check
const { defineConfig } = require('@playwright/test');

/* الاختبارات تشغّل الملف الحقيقي horofi-v11-9-29.html من خادم محلي ثابت
   (لا من file:// كي تعمل localStorage والمسارات النسبية كما في الإنتاج)،
   وتستبدل سكربتات Firebase بمحاكٍ في tests/firebase-mock.js. */
module.exports = defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    locale: 'ar',
  },
  webServer: {
    command: 'npx serve -l 4173 --no-clipboard .',
    url: 'http://localhost:4173/horofi-v11-9-29.html',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
