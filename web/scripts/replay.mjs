// 用目前的判斷程式重播試揮紀錄（引導錄製段），統計每一步觸發了幾次。
// 用法：node scripts/replay.mjs logs/<檔名>.jsonl [第幾次引導，從 0 起，預設最後一次] [門檻覆寫 JSON]
// 例：node scripts/replay.mjs logs/x.jsonl 1 '{"swordGap":0.3}'
import { readFileSync } from 'node:fs';
import { toPixels, handFeatures } from '../src/features.js';
import { MotionTracker } from '../src/motion.js';
import { GestureFSM, DEFAULTS } from '../src/fsm.js';

const [file, whichArg, override] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const [W, H] = rows.find((r) => r.type === 'meta').video;
const marks = (n) => rows.filter((r) => r.type === 'mark' && r.note === n).map((r) => r.t);
const starts = marks('guide-start'), ends = marks('guide-end');
const which = whichArg === undefined ? ends.length - 1 : +whichArg;
const t0 = starts[which], t1 = ends[which];
const cfg = { ...DEFAULTS, ...(override ? JSON.parse(override) : {}) };

// 該觸發的：slash 步驟的劍指斬、strike 步驟的推掌；其餘都算誤判
const EXPECT = { slash: 'slash', strike: 'strike' };
const fsm = new GestureFSM(cfg), mt = new MotionTracker();
const steps = [];
let prevLabel = 'none';
for (const r of rows) {
  if (r.type !== 'frame' || r.t < t0 || r.t > t1) continue;
  if (r.label !== prevLabel && r.label !== 'none') steps.push({ label: r.label, t: r.t, hit: 0, wrong: [], dirs: [] });
  prevLabel = r.label;
  const hs = r.hands.map((h) => {
    const f = handFeatures(toPixels(h.lm.map(([x, y, z]) => ({ x, y, z })), W, H), cfg);
    return { key: h.key, f, m: mt.update(h.key, r.t * 1000, f) };
  });
  mt.retain(new Set(hs.map((h) => h.key)));
  const out = fsm.update(r.t, hs);
  const step = r.label === 'none' ? null : steps.at(-1);
  for (const e of out.events) {
    if (step && EXPECT[step.label] === e.type) {
      step.hit++;
      if (e.dir) { // 畫面方向（前鏡頭鏡像：x 反過來）；* = 跟丟版直劈
        const { x, y } = e.dir;
        step.dirs.push((Math.abs(y) > Math.abs(x) ? (y > 0 ? '↓' : '↑') : (x > 0 ? '←' : '→')) + (e.chop ? '*' : ''));
      }
    }
    else (step ?? { wrong: [] }).wrong.push(`${e.type}@${(r.t - (step?.t ?? r.t)).toFixed(1)}`);
  }
}
let hit = 0, wrong = 0;
for (const [i, s] of steps.entries()) {
  console.log(`步驟${i + 1} ${s.label.padEnd(6)} 正確 ${s.hit}  誤判 ${s.wrong.length} ${s.wrong.join(' ')}${s.dirs.length ? '  方向 ' + s.dirs.join('') : ''}`);
  hit += s.hit; wrong += s.wrong.length;
}
console.log(`合計：正確 ${hit}（引導每個出招步驟要求 5 次）誤判 ${wrong}`);
