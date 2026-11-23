// 主畫面迴圈回歸測試（2026-11-23：this.view 被蓋掉、偶卡住的 bug）。要先 npm run dev，並在有 puppeteer-core 的地方跑。

import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('puppet-vfx.head', '1'); });
await page.reload();
await page.click('#start-btn');
await page.waitForFunction(() => !document.getElementById('hud').hidden, { timeout: 30000 });
// 主畫面每幀呼叫 skin.draw(戲偶手或 null)；包一層：null 時換成會左右移動、慢慢轉身的合成手，並計數
await page.evaluate(async () => {
  const { synthHand } = await import('/tests/synth.mjs');
  const { handFeatures } = await import('/src/features.js');
  const { DEFAULTS } = await import('/src/fsm.js');
  const sk = window.__fx.skin; const orig = sk.draw.bind(sk);
  window.__calls = 0; window.__pos = [];
  sk.draw = (h, now) => {
    window.__calls++;
    const P = synthHand({ pose: 'puppet', x: 640 + Math.sin(now * 3) * 80, y: 300, size: 120 });
    const a = Math.sin(now * 1.5) * 2; // 轉身 ±115°
    orig({ key: 'Left', P, f: { ...handFeatures(P, DEFAULTS), facing: { x: Math.sin(a), y: 0, z: -Math.cos(a) } } }, now);
    window.__pos.push(Math.round(sk.headSp.position.x));
  };
});
await wait(2500);
const r = await page.evaluate(() => ({ calls: window.__calls, viewIsContainer: typeof window.__fx.skin.view === 'object', visible: window.__fx.skin.view.visible,
  headView: window.__fx.skin.headView, distinctX: new Set(window.__pos).size, views: null }));
console.log(JSON.stringify(r));
// 1 秒內看到哪些視角
const seen = await page.evaluate(async () => { const s = new Set(); for (let i = 0; i < 60; i++) { s.add(window.__fx.skin.headView); await new Promise((r) => setTimeout(r, 50)); } return [...s]; });
console.log('看到的視角', seen.join(','));
await page.keyboard.press('p'); await wait(200); const c1 = await page.evaluate(() => window.__calls); await wait(500); const c2 = await page.evaluate(() => window.__calls);
await page.keyboard.press('p'); await wait(500); const c3 = await page.evaluate(() => window.__calls);
console.log('P 關掉時 0.5 秒內呼叫', c2 - c1, '再打開後 0.5 秒', c3 - c2);
await page.screenshot({ path: 'mainloop.png' });
console.log('errors', errs.length, errs.slice(0, 3));
await browser.close();
