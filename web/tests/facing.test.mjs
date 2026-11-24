import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FacingTracker } from '../src/facing.js';
import { handFeatures } from '../src/features.js';
import { DEFAULTS } from '../src/fsm.js';
import { synthHand } from './synth.mjs';

const F = (z) => { const x = Math.sqrt(Math.max(0, 1 - z * z)); return { x, y: 0, z }; };

test('面向單幀反過來（模型認反）不算翻面', () => {
  const tr = new FacingTracker({ hold: 0.25 });
  for (let i = 0; i < 10; i++) tr.update(i / 30, F(-0.9));
  const v = tr.update(10 / 30, { x: -F(-0.9).x, y: 0, z: 0.9 }); // 整個反向的一幀
  assert.ok(v.z < 0, `仍應是正面，z=${v.z}`);
  assert.ok(tr.update(11 / 30, F(-0.9)).z < 0);
});

test('一直反向超過 hold 秒才接受', () => {
  const tr = new FacingTracker({ hold: 0.25 });
  for (let i = 0; i < 10; i++) tr.update(i / 30, F(-0.9));
  const flipped = { x: -F(-0.9).x, y: 0, z: 0.9 };
  let t = 10 / 30, v;
  for (let i = 0; i < 6; i++, t += 1 / 30) v = tr.update(t, flipped);
  assert.ok(v.z < 0, '0.17 秒還不算');
  for (let i = 0; i < 4; i++, t += 1 / 30) v = tr.update(t, flipped);
  assert.ok(v.z > 0, '超過 0.25 秒算翻面');
});

test('慢慢轉過側面的真翻手馬上跟上', () => {
  const tr = new FacingTracker({ hold: 0.25 });
  let v;
  for (let i = 0; i <= 20; i++) { const a = Math.PI * (i / 20); v = tr.update(i / 30, { x: Math.sin(a), y: 0, z: -Math.cos(a) }); }
  assert.ok(v.z > 0.99, `轉完應是背面，z=${v.z}`);
});

test('掌心正對鏡頭、無名小指往鏡頭側彎曲時，輕微傾斜不會翻成背面', () => {
  const P = synthHand({ pose: 'puppet' });
  P[5].z = 5;   // 輕微往鏡頭後方傾斜，使法向量帶有一點 x/y 分量
  P[17].z = -5;
  P[16].z = -25; // 無名指與小指往掌心（鏡頭側 z < 0）彎曲
  P[20].z = -25;
  const f = handFeatures(P, DEFAULTS);
  assert.ok(f.facing.z < -0.8, `應判為正面（z < -0.8），實際 z=${f.facing.z}`);
});
