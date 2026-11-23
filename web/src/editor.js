// 擺零件視窗（老闆 11/23：「可以做一個視窗讓我自己手動擺放零件嗎？」）
// 不開相機：用錄影紀錄裡的戲偶手姿勢（或主畫面按 F 抓的姿勢）把偶畫出來，拖黃點改位置。
// 設定存在 localStorage（LAYOUT_KEY），主畫面的 PuppetSkin 讀同一份，另一個分頁開著會即時套用。
import { Application, Container, Graphics, Text } from 'pixi.js';
import { PuppetSkin, OUTFITS, LAYOUT_KEY, LAYOUT_DEFAULTS, headDefault, loadLayout } from './puppetSkin.js';
import { handFeatures, toPixels } from './features.js';
import { DEFAULTS } from './fsm.js';
import SAMPLE_POSES from './editorPoses.json';

export const POSE_KEY = 'puppet-vfx.pose'; // 主畫面按 F 存的 { lm:[[x,y,z]…], w, h }
const HEAD_NAMES = ['寫實木雕', '動漫 1 賽璐璐', '動漫 2 Q 版', '動漫 3 水墨', '動漫 4 銀髮仙俠', '動漫 5 手遊', '動漫 6 紅髮漫畫'];

// 滑桿：[鍵, 名稱, 最小, 最大, 間距]；head.* 是目前這顆頭自己的設定
const SLIDERS = [
  ['身體', [['bodyX', '左右（往拇指）', -1.5, 1.5, 0.01], ['bodyY', '上下', -1.5, 1.5, 0.01], ['robeTop', '肩寬', 0.2, 1.5, 0.01],
    ['robeHem', '下擺寬', 0.3, 2.5, 0.01], ['robeLen', '袍長', 0.3, 3, 0.01], ['capeW', '披風寬', 0.3, 2, 0.01]]],
  ['袖子', [['armRoot', '從肩膀長出', 0, 1, 0.01], ['sleeveW', '粗細', 0.3, 2, 0.01], ['silkLen', '水袖長', 0.2, 3, 0.01], ['silkW', '水袖寬', 0.2, 3, 0.01]]],
  ['劍', [['swordX', '左右（往拇指）', -2, 2, 0.01], ['swordY', '上下', -2, 2, 0.01], ['swordRot', '角度', -180, 180, 1], ['swordScale', '長度', 0.3, 2.5, 0.01]]],
  ['偶頭（目前這顆）', [['head.x', '左右', -2, 2, 0.01], ['head.y', '上下', -2, 2, 0.01], ['head.scale', '大小', 0.3, 2.5, 0.01], ['head.rot', '傾斜', -90, 90, 1]]],
];
const TOGGLES = [['capeOn', '披風'], ['pauldronOn', '肩甲'], ['beltOn', '腰帶'], ['silkOn', '水袖']];

const $ = (id) => document.getElementById(id);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const perp = (a) => ({ x: -a.y, y: a.x });
const r = (v, k = 1000) => Math.round(v * k) / k;

const L = loadLayout();
L.heads = { ...(L.heads ?? {}) };

const app = new Application();
await app.init({ resizeTo: $('ed-stage'), background: 0x1b1d22, antialias: true });
$('ed-stage').appendChild(app.canvas);
const world = new Container(); // 跟主畫面一樣左右鏡像（自拍視角）
const handG = new Graphics();
const skin = new PuppetSkin();
skin.layout = L;
const handleG = new Graphics();
const labels = new Container();
world.addChild(handG, skin.view, handleG);
app.stage.addChild(world, labels);

// ── 姿勢 ──
function poses() {
  const list = SAMPLE_POSES.map((lm, i) => ({ name: `範例姿勢 ${i + 1}`, lm, w: 1280, h: 720 }));
  try {
    const mine = JSON.parse(localStorage.getItem(POSE_KEY) || 'null');
    if (mine?.lm?.length === 21) list.unshift({ name: '你抓的姿勢（F）', ...mine });
  } catch {}
  return list;
}
let poseList = poses(), poseIdx = 0, hand = null;
function setPose(i) {
  poseList = poses();
  poseIdx = (i + poseList.length) % poseList.length;
  const ps = poseList[poseIdx];
  const P = toPixels(ps.lm.map(([x, y, z]) => ({ x, y, z })), ps.w, ps.h);
  hand = { key: `pose${poseIdx}`, P, f: handFeatures(P, DEFAULTS) };
  $('pose-name').textContent = `${ps.name}（${poseIdx + 1}/${poseList.length}）`;
  fit();
}
// 把偶放在畫面中間：手掌長約佔畫面高的 15%
function fit() {
  if (!hand) return;
  const P = hand.P, palm = Math.hypot(P[9].x - P[0].x, P[9].y - P[0].y) || 1;
  const s = (app.screen.height * 0.15) / palm;
  const c = { x: P[9].x, y: P[9].y + palm * 0.6 };
  world.scale.set(-s, s);
  world.position.set(app.screen.width / 2 + c.x * s, app.screen.height / 2 - c.y * s);
}
app.renderer.on('resize', fit);

// ── 拖曳把手 ──
const headL = () => (L.heads[skin.headIdx] = { ...headDefault(skin.headIdx), ...(L.heads[skin.headIdx] ?? {}) });
function handles() {
  const g = skin.geo, fr = g?.frame;
  if (!fr) return [];
  return [
    { id: 'head', name: '頭', p: g.head },
    { id: 'neck', name: '身體', p: fr.neck },
    { id: 'hem', name: '下擺', p: { x: fr.hemC.x + fr.side.x * L.robeHem * fr.palm, y: fr.hemC.y + fr.side.y * L.robeHem * fr.palm } },
    { id: 'grip', name: '握把', p: fr.grip },
    { id: 'tip', name: '劍尖', p: g.swordTip },
  ];
}
let drag = null, hover = null;
const toWorld = (e) => world.toLocal({ x: e.offsetX, y: e.offsetY });
function pick(e) {
  const p = toWorld(e), rad = 16 / Math.abs(world.scale.y);
  let best = null, bd = rad;
  for (const h of handles()) {
    const d = Math.hypot(h.p.x - p.x, h.p.y - p.y);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
app.canvas.addEventListener('pointerdown', (e) => {
  const h = pick(e);
  if (!h) return;
  app.canvas.setPointerCapture(e.pointerId);
  drag = { id: h.id, p0: toWorld(e), L0: structuredClone({ ...L, head: headL() }), fr: { ...skin.geo.frame }, tip0: { ...skin.geo.swordTip } };
});
app.canvas.addEventListener('pointermove', (e) => {
  if (!drag) { hover = pick(e); app.canvas.style.cursor = hover ? 'grab' : 'default'; return; }
  const p = toWorld(e), d = sub(p, drag.p0), { fr, L0 } = drag;
  const along = (v) => dot(d, v) / fr.palm;
  if (drag.id === 'head') {
    const hl = headL();
    hl.x = r(L0.head.x + dot(d, perp(fr.up0)) / fr.R0);
    hl.y = r(L0.head.y - dot(d, fr.up0) / fr.R0);
  } else if (drag.id === 'neck') {
    L.bodyX = r(L0.bodyX + along(fr.side)); L.bodyY = r(L0.bodyY + along(fr.down));
  } else if (drag.id === 'hem') {
    L.robeLen = r(Math.max(0.3, L0.robeLen + along(fr.down))); L.robeHem = r(Math.max(0.3, L0.robeHem + along(fr.side)));
  } else if (drag.id === 'grip') {
    L.swordX = r(L0.swordX + along(fr.side)); L.swordY = r(L0.swordY + along(fr.down));
  } else if (drag.id === 'tip') {
    const v = sub(p, fr.grip), v0 = sub(drag.tip0, fr.grip);
    let deg = ((Math.atan2(v.y, v.x) - fr.armAng) * 180) / Math.PI * fr.swSign;
    deg = ((deg + 540) % 360) - 180;
    L.swordRot = Math.round(deg);
    L.swordScale = r(Math.max(0.3, L0.swordScale * Math.hypot(v.x, v.y) / (Math.hypot(v0.x, v0.y) || 1)));
  }
  changed();
});
const endDrag = () => { drag = null; };
app.canvas.addEventListener('pointerup', endDrag);
app.canvas.addEventListener('pointercancel', endDrag);
app.canvas.addEventListener('wheel', (e) => {
  const h = pick(e);
  if (!h) return;
  e.preventDefault();
  const k = Math.exp(-e.deltaY * 0.002);
  if (h.id === 'head') {
    const hl = headL();
    if (e.shiftKey) hl.rot = Math.max(-90, Math.min(90, Math.round(hl.rot + Math.sign(e.deltaY || e.deltaX) * 2)));
    else hl.scale = r(Math.max(0.3, Math.min(2.5, hl.scale * k)));
  } else if (h.id === 'grip' || h.id === 'tip') {
    if (e.shiftKey) L.swordRot = Math.round(((L.swordRot + Math.sign(e.deltaY || e.deltaX) * 2 + 540) % 360) - 180);
    else L.swordScale = r(Math.max(0.3, Math.min(2.5, L.swordScale * k)));
  } else return;
  changed();
}, { passive: false });

// ── 面板 ──
const inputs = new Map();
function getV(key) { return key.startsWith('head.') ? headL()[key.slice(5)] : L[key]; }
function defV(key) { return key.startsWith('head.') ? headDefault(skin.headIdx)[key.slice(5)] : LAYOUT_DEFAULTS[key]; }
function setV(key, v) { if (key.startsWith('head.')) headL()[key.slice(5)] = v; else L[key] = v; }
function buildPanel() {
  const box = $('ed-sliders');
  const tg = document.createElement('div');
  tg.className = 'row';
  for (const [key, name] of TOGGLES) {
    const lab = document.createElement('label');
    lab.className = 'ck';
    lab.innerHTML = `<input type="checkbox"> ${name}`;
    const inp = lab.querySelector('input');
    inp.addEventListener('change', () => { L[key] = inp.checked ? 1 : 0; changed(); });
    inputs.set(key, { inp, toggle: true });
    tg.appendChild(lab);
  }
  box.appendChild(tg);
  for (const [title, rows] of SLIDERS) {
    const h = document.createElement('h3');
    h.textContent = title;
    box.appendChild(h);
    for (const [key, name, min, max, step] of rows) {
      const row = document.createElement('div');
      row.className = 'sl';
      row.innerHTML = `<span>${name}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
      const inp = row.querySelector('input'), out = row.querySelector('output');
      inp.addEventListener('input', () => { setV(key, +inp.value); changed(); });
      row.addEventListener('dblclick', () => { setV(key, defV(key)); changed(); }); // 雙擊回預設
      inputs.set(key, { inp, out });
      box.appendChild(row);
    }
  }
}
function refresh() {
  for (const [key, { inp, out, toggle }] of inputs) {
    const v = getV(key);
    if (toggle) { inp.checked = !!v; continue; }
    if (document.activeElement !== inp) inp.value = v;
    out.textContent = Math.abs(v) >= 10 ? Math.round(v) : (+v).toFixed(2);
    out.classList.toggle('changed', Math.abs(v - defV(key)) > 1e-9);
  }
  $('head-name').textContent = `${skin.headIdx + 1}/7 ${HEAD_NAMES[skin.headIdx]}`;
  $('outfit-name').textContent = `${L.outfit + 1}/${OUTFITS.length} ${OUTFITS[L.outfit]?.name ?? ''}`;
  $('dump').value = JSON.stringify(diff());
}
// 只輸出跟預設不同的值（給 Claude 寫回程式預設）
function diff() {
  const o = {};
  for (const k of Object.keys(LAYOUT_DEFAULTS)) if (k !== 'heads' && L[k] !== LAYOUT_DEFAULTS[k]) o[k] = L[k];
  const heads = {};
  for (const [i, hl] of Object.entries(L.heads)) {
    const d = Object.fromEntries(Object.entries(hl).filter(([k, v]) => v !== headDefault(i)[k]));
    if (Object.keys(d).length) heads[i] = d;
  }
  if (Object.keys(heads).length) o.heads = heads;
  return o;
}
let saveTimer = 0;
function changed() {
  refresh();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(L)); $('saved').textContent = '✓ 已存'; } catch { $('saved').textContent = '存檔失敗'; }
    setTimeout(() => ($('saved').textContent = ''), 1200);
  }, 200);
}

buildPanel();
$('pose-prev').onclick = () => setPose(poseIdx - 1);
$('pose-next').onclick = () => setPose(poseIdx + 1);
$('head-next').onclick = () => { skin.nextHead(); refresh(); };
$('outfit-next').onclick = () => { L.outfit = (L.outfit + 1) % OUTFITS.length; changed(); };
const tryAtk = (type) => {
  const f = hand?.f.facing ?? { x: 1, y: 0 };
  const l = Math.hypot(f.x, f.y);
  skin.attack(type, l > 0.15 ? { x: f.x / l, y: f.y / l } : { x: skin.geo?.frame.side.x ?? 1, y: 0 });
};
$('try-slash').onclick = () => tryAtk('slash');
$('try-strike').onclick = () => tryAtk('strike');
$('reset-head').onclick = () => { delete L.heads[skin.headIdx]; changed(); };
$('reset-all').onclick = () => { Object.assign(L, structuredClone(LAYOUT_DEFAULTS)); L.heads = {}; changed(); };
$('copy').onclick = async () => {
  const txt = JSON.stringify(diff());
  try { await navigator.clipboard.writeText(txt); $('saved').textContent = '✓ 已複製，貼給 Claude'; }
  catch { $('dump').select(); $('saved').textContent = '請手動複製下面的字'; }
};
addEventListener('storage', (e) => { if (e.key === POSE_KEY) setPose(0); }); // 主畫面抓了新姿勢
setPose(0);
refresh();
window.__ed = { L, skin, handles: () => handles().map((h) => ({ id: h.id, ...world.toGlobal(h.p) })) }; // 自動測試用


// ── 每幀 ──
const labelOf = new Map();
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
app.ticker.add(() => {
  skin.draw(hand, performance.now() / 1000);
  const px = 1 / Math.abs(world.scale.y);
  handG.clear();
  if ($('show-hand').checked && hand) {
    for (const [a, b] of BONES) handG.moveTo(hand.P[a].x, hand.P[a].y).lineTo(hand.P[b].x, hand.P[b].y);
    handG.stroke({ width: 2 * px, color: 0x66ccff, alpha: 0.5 });
  }
  handleG.clear();
  labels.children.forEach((t) => (t.visible = false));
  for (const h of handles()) {
    const on = drag?.id === h.id || hover?.id === h.id;
    handleG.circle(h.p.x, h.p.y, (on ? 10 : 7) * px).fill({ color: on ? 0xffffff : 0xffd54a }).stroke({ width: 2 * px, color: 0x000000 });
    const gp = world.toGlobal(h.p);
    let t = labelOf.get(h.id);
    if (!t) labelOf.set(h.id, (t = labels.addChild(new Text({ text: h.name, style: { fontSize: 12, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } }))));
    t.visible = true;
    t.position.set(gp.x + 10, gp.y - 8);
  }
});
