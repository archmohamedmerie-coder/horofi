// يُصدّر لوحة إعلان إلى PNG — الاستخدام: node ads/render.js poster-4x5
// 4:5 بدقّة مضاعفة (2160×2700)؛ 1:1 و1.91:1 بمقاس Google Ads الأصلي (1200×1200، 1200×628)
const { chromium } = require('@playwright/test');
const path = require('path');
const SIZES = {
  'poster-4x5':   { width: 1080, height: 1350, scale: 2 },
  'poster-1x1':   { width: 1200, height: 1200, scale: 1 },
  'poster-191x1': { width: 1200, height: 628,  scale: 1 },
};
(async () => {
  const name = process.argv[2] || 'poster-4x5';
  const { width, height, scale } = SIZES[name] || SIZES['poster-4x5'];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto('file://' + path.resolve(__dirname, name + '.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.resolve(__dirname, name + '.png') });
  await browser.close();
  console.log('written', name + '.png');
})();
