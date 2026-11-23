import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuro } from '../src/oneEuro.js';

// 固定亂數，結果可重現
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const sd = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

test('One Euro：手靜止時抖動（±3px）明顯變小，比原本 EMA 0.5 更穩', () => {
  const f = new OneEuro();
  let ema = null;
  const raw = [], out = [], emaOut = [];
  for (let i = 0; i < 300; i++) {
    const x = 500 + rnd() * 3;
    raw.push(x); out.push(f.filter(x, i / 30));
    ema = ema === null ? x : ema + 0.5 * (x - ema); emaOut.push(ema);
  }
  assert.ok(sd(out.slice(30)) < sd(raw.slice(30)) * 0.4, `抖動 ${sd(out.slice(30)).toFixed(2)} vs 原始 ${sd(raw.slice(30)).toFixed(2)}`);
  assert.ok(sd(out.slice(30)) < sd(emaOut.slice(30)), '應該比 EMA 0.5 更穩');
});

test('One Euro：快速移動（1500px/s）時落後比 EMA 0.5 少', () => {
  const f = new OneEuro();
  let ema = null, lagF = 0, lagE = 0;
  for (let i = 0; i < 30; i++) {
    const x = i * 50; // 每格 50px＝1500px/s
    const y = f.filter(x, i / 30);
    ema = ema === null ? x : ema + 0.5 * (x - ema);
    if (i === 29) { lagF = x - y; lagE = x - ema; }
  }
  assert.ok(lagF < lagE, `One Euro 落後 ${lagF.toFixed(1)}px、EMA 落後 ${lagE.toFixed(1)}px`);
});
