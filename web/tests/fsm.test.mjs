import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handFeatures } from '../src/features.js';
import { MotionTracker } from '../src/motion.js';
import { GestureFSM, DEFAULTS, STATE } from '../src/fsm.js';
import { synthHand } from './synth.mjs';

const cfg = { ...DEFAULTS };
const FPS = 30, DT = 1000 / FPS;

// 跑一段影格序列：frames(i) 回傳 [{key, P}]，回傳每格的 FSM 輸出
function run(nFrames, frames) {
  const fsm = new GestureFSM(cfg), mt = new MotionTracker();
  const out = [];
  for (let i = 0; i < nFrames; i++) {
    const tMs = i * DT;
    const hs = frames(i).map(({ key, P }) => {
      const f = handFeatures(P, cfg);
      return { key, f, m: mt.update(key, tMs, f) };
    });
    mt.retain(new Set(hs.map((h) => h.key)));
    out.push(fsm.update(tMs / 1000, hs));
  }
  return out;
}
const eventsOf = (out) => out.flatMap((o) => o.events);
const puppetL = () => ({ key: 'Left', P: synthHand({ x: 350, pose: 'puppet' }) });

test('特徵：張掌／劍指／握拳／戲偶手分得出來', () => {
  const F = Object.fromEntries(['open', 'sword', 'fist', 'puppet'].map((p) => [p, handFeatures(synthHand({ pose: p }), cfg)]));
  assert.deepEqual([F.open.open, F.open.sword, F.open.puppet], [true, false, false]);
  assert.deepEqual([F.sword.open, F.sword.sword, F.sword.puppet], [false, true, false]);
  assert.deepEqual([F.fist.open, F.fist.sword, F.fist.puppet], [false, false, false]);
  assert.deepEqual([F.puppet.sword, F.puppet.puppet], [false, true]);
});

test('特徵：比 YA（拇指收在中指那側）不算戲偶手', () => {
  assert.equal(handFeatures(synthHand({ pose: 'vsign' }), cfg).puppet, false);
});

test('沒有手：沒戲偶、不出事件', () => {
  const out = run(60, () => []);
  assert.ok(out.every((o) => o.state === STATE.NO_PUPPET));
  assert.equal(eventsOf(out).length, 0);
});

test('沒有戲偶手：技能手劍指快劃、張掌快推都不出招', () => {
  const slash = run(10, (i) => [{ key: 'Right', P: synthHand({ pose: 'sword', x: 200 + i * 60 }) }]);
  const push = run(30, (i) => [{ key: 'Right', P: synthHand({ size: 80 * Math.exp(3 * i * DT / 1000) }) }]);
  const twoOpen = run(30, (i) => [
    { key: 'Left', P: synthHand({ x: 350 }) },
    { key: 'Right', P: synthHand({ size: 80 * Math.exp(3 * i * DT / 1000) }) },
  ]);
  assert.equal(eventsOf(slash).length + eventsOf(push).length + eventsOf(twoOpen).length, 0);
});

test('只有戲偶手：戲偶就位、不出招', () => {
  const out = run(30, () => [puppetL()]);
  assert.equal(out.at(-1).state, STATE.READY);
  assert.equal(out.at(-1).puppetKey, 'Left');
  assert.equal(eventsOf(out).length, 0);
});

test('戲偶＋技能手靜止：不誤觸', () => {
  const out = run(60, () => [puppetL(), { key: 'Right', P: synthHand({ x: 900 }) }]);
  assert.equal(eventsOf(out).length, 0);
});

test('戲偶＋劍指快劃：出劍指斬，從戲偶手臂發出、方向跟著劃', () => {
  const out = run(10, (i) => [puppetL(), { key: 'Right', P: synthHand({ pose: 'sword', x: 700 + i * 60 }) }]);
  const ev = eventsOf(out);
  assert.deepEqual(ev.map((e) => e.type), ['slash']);
  assert.equal(ev[0].hand, 'Right');
  assert.ok(ev[0].origin.x < 500, '起點在戲偶身上（左邊）'); // 戲偶在 x≈350
  assert.ok(ev[0].dir.x > 0, '往右劃');
});

test('戲偶＋劍指慢慢移動、張掌快揮：不出劍指斬', () => {
  const slow = run(30, (i) => [puppetL(), { key: 'Right', P: synthHand({ pose: 'sword', x: 700 + i * 5 }) }]);
  const openFast = run(10, (i) => [puppetL(), { key: 'Right', P: synthHand({ pose: 'open', x: 700 + i * 60 }) }]);
  assert.equal(eventsOf(slow).length, 0);
  assert.equal(eventsOf(openFast).length, 0);
});

test('戲偶＋張掌快推：出推掌且有冷卻；慢慢靠近不出', () => {
  const fast = run(30, (i) => [puppetL(), { key: 'Right', P: synthHand({ x: 900, size: 80 * Math.exp(3 * i * DT / 1000) }) }]);
  const ev = eventsOf(fast);
  assert.ok(ev.length >= 1 && ev.length <= 2, `got ${ev.length}`); // 1 秒內冷卻 0.8 秒，最多 2 次
  assert.equal(ev[0].type, 'strike');
  assert.ok(ev[0].origin.x < 500, '起點在戲偶身上');
  const slow = run(60, (i) => [puppetL(), { key: 'Right', P: synthHand({ x: 900, size: 100 * Math.exp(0.5 * i * DT / 1000) }) }]);
  assert.equal(eventsOf(slow).length, 0);
});

test('戲偶鎖定：認到後換成別的姿勢（翻手認不出）仍是戲偶；手離開畫面超過寬限才收偶', () => {
  const leftIn = (i) => (i < 40 || i > 42) && i < 50; // 40~42 偵測閃斷；50 起離開畫面
  const out = run(60, (i) => [
    ...(leftIn(i) ? [{ key: 'Left', P: synthHand({ x: 350, pose: i < 10 ? 'puppet' : 'fist' }) }] : []),
    { key: 'Right', P: synthHand({ x: 900 }) },
  ]);
  assert.equal(out[30].state, STATE.READY); // 變握拳 20 格，仍鎖定
  assert.equal(out[30].puppetKey, 'Left');
  assert.equal(out[44].state, STATE.READY); // 閃斷 3 格（0.1 秒）< 寬限：手回來還是戲偶（雖然是握拳）
  assert.equal(out[44].puppetKey, 'Left');
  assert.equal(out[59].state, STATE.NO_PUPPET); // 離開 0.33 秒 > 寬限 0.3 秒
});

test('戲偶鎖定：翻手時左右手標籤跳掉，仍追同一隻手', () => {
  const out = run(30, (i) => [
    { key: i < 15 ? 'Left' : 'Right', P: synthHand({ x: 350, pose: i < 10 ? 'puppet' : 'fist' }) },
    ...(i < 15 ? [{ key: 'Right', P: synthHand({ x: 900 }) }] : [{ key: 'Left', P: synthHand({ x: 900 }) }]),
  ]);
  assert.equal(out[25].puppetKey, 'Right'); // 標籤換了，但還是左邊那隻
  assert.equal(out[25].skillKey, 'Left');
});

test('戲偶鎖定：戲偶手沒偵測到時，技能手經過原位也不會搶走戲偶', () => {
  const out = run(30, (i) => [
    ...(i < 15 ? [{ key: 'Left', P: synthHand({ x: 350, pose: 'puppet' }) }] : []),
    { key: 'Right', P: synthHand({ x: i < 15 ? 600 : 600 - (i - 14) * 40, pose: 'sword' }) }, // 連續往左掃過戲偶原位
  ]);
  assert.ok(out.slice(15).every((o) => o.puppetKey !== 'Right'));
});

test('推掌方向＝戲偶面向（掌心那面）投影到畫面；正對鏡頭時往遠離技能手那側', () => {
  const P = synthHand({ x: 350, pose: 'puppet' });
  const F = handFeatures(P, cfg);
  assert.ok(F.facing && Math.abs(Math.hypot(F.facing.x, F.facing.y, F.facing.z) - 1) < 1e-6);
  const out = run(30, (i) => [puppetL(), { key: 'Right', P: synthHand({ x: 900, size: i < 15 ? 100 : 100 * Math.exp((i - 15) * 0.1) }) }]);
  const ev = eventsOf(out).find((e) => e.type === 'strike');
  assert.ok(ev, '應該要出推掌');
  assert.ok(ev.dir.x < 0 && Math.abs(ev.dir.y) < 1e-6); // 合成手平放（掌心正對鏡頭）→ 往左（技能手在右）
});

test('劍指斬冷卻 0.5 秒', () => {
  const out = run(30, (i) => [puppetL(), { key: 'Right', P: synthHand({ pose: 'sword', x: 700 + (i % 10) * 60 }) }]);
  const ts = eventsOf(out).filter((e) => e.type === 'slash').map((e) => e.t);
  assert.ok(ts.length >= 2);
  for (let k = 1; k < ts.length; k++) assert.ok(ts[k] - ts[k - 1] >= cfg.slashCooldown - 1e-9);
});

test('揮手時手指一閃而過變劍指（只有 1 格）：不算劍指斬', () => {
  const out = run(20, (i) => [puppetL(), { key: 'Right', P: synthHand({ pose: i === 12 ? 'sword' : 'open', x: 700 + i * 60 }) }]);
  assert.equal(eventsOf(out).filter((e) => e.type === 'slash').length, 0);
});

test('張掌往前又同時大幅左右甩：不算推掌', () => {
  // 每秒平移 15 個手掌長（真推掌實測 ≤ 4），同時往鏡頭放大
  let x = 700;
  const out = run(30, (i) => {
    const size = 80 * Math.exp(3 * i * DT / 1000);
    x += 15 * size * DT / 1000;
    return [puppetL(), { key: 'Right', P: synthHand({ x, size }) }];
  });
  assert.equal(eventsOf(out).length, 0);
});

// 劍指正對鏡頭：食中兩指在畫面上縮成很短、深度往鏡頭（z 負）
function pointingHand(x, y = 400, s = 100) {
  const P = synthHand({ pose: 'sword', x, y, size: s });
  for (const [b, dx] of [[5, -0.02], [9, 0.02]]) {
    for (let j = 1; j <= 3; j++) P[b + j] = { x: P[b].x + dx * s, y: P[b].y - 0.03 * s * j, z: -0.3 * s * j };
  }
  return P;
}

test('直劈：先穩定比劍指，劈下去那刻手指正對鏡頭（認不出劍指）也算劍指斬', () => {
  assert.equal(handFeatures(pointingHand(700), cfg).sword, false); // 單看這幀認不出劍指
  assert.equal(handFeatures(pointingHand(700), cfg).pointing, true);
  const out = run(20, (i) => [puppetL(), { key: 'Right', P: i < 12 ? synthHand({ pose: 'sword', x: 700, y: 300 }) : pointingHand(700, 300 + (i - 11) * 60) }]);
  assert.deepEqual(eventsOf(out).map((e) => e.type), ['slash']);
});

test('劍指收手變握拳（很快）：不算劍指斬', () => {
  const out = run(20, (i) => [puppetL(), { key: 'Right', P: i < 12 ? synthHand({ pose: 'sword', x: 700, y: 300 }) : synthHand({ pose: 'fist', x: 700, y: 300 + (i - 11) * 60 }) }]);
  assert.equal(eventsOf(out).length, 0);
});

test('沒先比劍指、直接指著鏡頭快速移動：不算劍指斬', () => {
  const out = run(20, (i) => [puppetL(), { key: 'Right', P: i < 12 ? synthHand({ pose: 'fist', x: 700, y: 300 }) : pointingHand(700, 300 + (i - 11) * 60) }]);
  assert.equal(eventsOf(out).length, 0);
});

// ── 直劈跟丟版（老闆 11/23 引導錄製：往下劈太快，手部模型整個跟丟 0.1～0.3 秒）──
// 合成手掌長 100px；15px/格 × 30fps = 4.5 手掌長/秒（夠 chopSpeed 3，但不到一般劍指斬的 12）
const sword = (y) => ({ key: 'Right', P: synthHand({ pose: 'sword', x: 700, y }) });

test('直劈跟丟：穩定劍指往下動、手突然不見 → 一次往下的劍指斬', () => {
  const out = run(30, (i) => [puppetL(), ...(i < 12 ? [sword(200 + i * 15)] : [])]);
  const ev = eventsOf(out);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'slash');
  assert.equal(ev[0].chop, true);
  assert.ok(ev[0].dir.y > 0);
});

test('張掌往下放、離開畫面：不算劍指斬', () => {
  const out = run(30, (i) => [puppetL(), ...(i < 12 ? [{ key: 'Right', P: synthHand({ pose: 'open', x: 700, y: 200 + i * 15 }) }] : [])]);
  assert.equal(eventsOf(out).length, 0);
});

test('劍指停著、偵測閃斷一下：不算劍指斬', () => {
  const out = run(30, (i) => [puppetL(), ...(i < 12 || i > 14 ? [sword(300)] : [])]);
  assert.equal(eventsOf(out).length, 0);
});

test('直劈跟丟後，手在下方出現、快速舉回上面：不算第二次', () => {
  // 冷卻 0.5 秒過後（第 27 格起）才往上舉，確認擋下來的是「舉手不算」而不是冷卻
  const out = run(45, (i) => [puppetL(), ...(i < 12 ? [sword(200 + i * 15)] : i < 20 ? [] : i < 36 ? [sword(950 - (i - 20) * 50)] : [])]);
  assert.deepEqual(eventsOf(out).map((e) => e.chop ?? false), [true]);
});

test('戲偶鎖定：戲偶手離開後，遠處冒出一隻手（沒擺戲偶）不算戲偶', () => {
  const out = run(30, (i) => (i < 12 ? [puppetL()] : i < 15 ? [] : [{ key: 'Left', P: synthHand({ x: 1000, pose: 'fist' }) }]));
  assert.ok(out.slice(15).every((o) => o.state === STATE.NO_PUPPET));
});

test('蓄力：握拳定住進入蓄力，切劍指轉成劍氣環繞，揮劍指斬帶出 charged 並消耗蓄力', () => {
  const out = run(40, (i) => [
    puppetL(),
    i < 22 ? { key: 'Right', P: synthHand({ x: 800, y: 400, pose: 'fist' }) }
      : i < 28 ? { key: 'Right', P: synthHand({ x: 800, y: 400, pose: 'sword' }) }
      : { key: 'Right', P: synthHand({ x: 800 + (i - 27) * 90, y: 400, pose: 'sword' }) },
  ]);
  assert.ok(out[20].charge > 0 && out[20].chargeMode === 'fist', `握拳應蓄力中，實際 ${JSON.stringify(out[20])}`);
  assert.ok(out[25].charge > 0 && out[25].chargeMode === 'sword', `切劍指應轉為 sword 模式，實際 ${JSON.stringify(out[25])}`);
  const ev = eventsOf(out);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'slash');
  assert.ok(ev[0].charged > 0, '蓄力後出劍指斬應帶有 charged');
  assert.equal(out.at(-1).charge, 0, '出招後應消耗蓄力');
});

test('蓄力：握拳定住後開掌轉成掌氣蓄力，往前推掌帶出 charged', () => {
  const out = run(42, (i) => [
    puppetL(),
    i < 22 ? { key: 'Right', P: synthHand({ x: 800, y: 400, pose: 'fist' }) }
      : i < 31 ? { key: 'Right', P: synthHand({ x: 800, y: 400, size: 100, pose: 'open' }) }
      : { key: 'Right', P: synthHand({ x: 800, y: 400, size: 100 + (i - 30) * 14, pose: 'open' }) },
  ]);
  assert.ok(out[26].charge > 0 && out[26].chargeMode === 'palm', `開掌應轉為 palm 模式，實際 ${JSON.stringify(out[26])}`);
  const ev = eventsOf(out);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, 'strike');
  assert.ok(ev[0].charged > 0, '蓄力後推掌應帶有 charged');
});

test('特徵：斜指鏡頭或背向斜傾的劍指（2D 縮短但 3D 伸直）仍可認成劍指，握拳不會誤認', () => {
  const P = synthHand({ pose: 'sword' });
  // 模擬斜傾：食中兩指 2D 壓縮到比 PIP 短，但 Z 軸斜向伸直（towardCam < 0.6）
  P[6].y = P[5].y - 10; P[6].z = 35;
  P[8].y = P[5].y - 20; P[8].z = 85;
  P[10].y = P[9].y - 10; P[10].z = 35;
  P[12].y = P[9].y - 20; P[12].z = 85;
  assert.equal(handFeatures(P, DEFAULTS).sword, true);
  assert.equal(handFeatures(synthHand({ pose: 'fist' }), DEFAULTS).sword, false);
});
