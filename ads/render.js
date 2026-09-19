// يُصدّر لوحة الإعلان إلى PNG بدقّة مضاعفة (2160×2700) — الاستخدام: node ads/render.js poster-4x5
const { chromium } = require('@playwright/test');
const path = require('path');
(async () => {
  const name = process.argv[2] || 'poster-4x5';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  await page.goto('file://' + path.resolve(__dirname, name + '.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve(__dirname, name + '.png') });
  await browser.close();
  console.log('written', name + '.png');
})();
