import { Assets, Container, Graphics, MeshRope, Point, Sprite, Texture } from 'pixi.js';
import { LandmarkFilter } from './oneEuro.js';

// 虛擬布袋戲偶（老闆 11/23：畫面上貼一隻偶蓋住戲偶手；要好看一點、帶一把劍、出招時偶自動做攻擊動作）。
// 頭、劍、袍子布紋用 Canvas 生的零件圖（web/public/puppet/，原創角色）；圖還沒載入時用程式畫的版本。綁在手部關鍵點上：
//   頭＝食指（P6→P8）、持劍手＝中指（P9→P12）、空手＝拇指（P2→P4）、身體＝手掌到手腕下方。
// 正面＝掌心那面（features.facing）；掌心背對鏡頭時畫後腦勺。
// 出招動畫：劍指斬＝持劍手往劃的方向揮劍；推掌＝空手往戲偶面向推出。特效起點用 swordTip()／palmTip()。

const COL = {
  robe: 0x1f3f8f, robeDark: 0x142c66, robeHem: 0x0e1f4a, trim: 0xd9b041, trimDark: 0x9c7a22, inner: 0xf4efe4,
  cape: 0x8e1d22, capeDark: 0x5e1015, skin: 0xf6dcc4, blush: 0xe8a2a0, hair: 0x101014, hairHi: 0x2a2a38,
  crown: 0xe9c24c, jewel: 0xd0222e, lip: 0xb81f2c, eye: 0x111111, brow: 0x1a1a1a, eyeShadow: 0xd9534f,
  blade: 0xdfe8f2, bladeEdge: 0xffffff, bladeShade: 0x8d9bb0, guard: 0xd9b041, hilt: 0x3a1f14, tassel: 0xd0222e,
};
// 服裝（老闆 11/23：「衣服好看一點，不要那麼復古」）：0＝原本的復古花紋，其他是乾淨的動漫仙俠配色
// robe：上→下漸層兩色；modern：開襟白內衫＋腰帶飄帶＋半透明披帛（取代厚重紅披風）＋布料肩
export const OUTFITS = [
  { name: '復古錦袍', retro: true, trim: COL.trim, trimDark: COL.trimDark, inner: COL.inner, hem: COL.robeHem, cape: COL.cape, capeA: 1, belt: COL.trim, gem: COL.jewel, jade: 0x5fbf8f, shoulder: COL.trim },
  { name: '白衣仙俠', modern: true, robe: [0xfbfdff, 0xc5d5ec], sleeve: [0xffffff, 0xd3e0f2], trim: 0x6f9bd6, trimDark: 0x4a6fa8, inner: 0xffffff, hem: 0x8fb3e3, cape: 0xbfe0ff, capeA: 0.42, belt: 0x3b5b8c, gem: 0x7fe3ff, jade: 0x9ff0ff, shoulder: 0xe6eefa },
  { name: '墨黑劍客', modern: true, robe: [0x3a3d48, 0x121318], sleeve: [0x2c2f38, 0x15161b], trim: 0xd23c46, trimDark: 0x7a1a22, inner: 0xeceef3, hem: 0x8e1d2a, cape: 0xff6b78, capeA: 0.32, belt: 0x0c0c0f, gem: 0xff4d5a, jade: 0xff8a8a, shoulder: 0x24262e },
  { name: '青衫少俠', modern: true, robe: [0x8fd6c8, 0x2f7c7d], sleeve: [0xa6e2d6, 0x3f8b89], trim: 0xf4e3a8, trimDark: 0x2a5c5c, inner: 0xfbfbf5, hem: 0x245f62, cape: 0xdcfff6, capeA: 0.4, belt: 0x234449, gem: 0xffd36b, jade: 0xffe39a, shoulder: 0x7cc7ba },
  { name: '紫金貴公子', modern: true, robe: [0x8f72d0, 0x3b2a6b], sleeve: [0xa48ae0, 0x4a3780], trim: 0xf0c96a, trimDark: 0x5a3f1a, inner: 0xfcf7ff, hem: 0x2e2156, cape: 0xf1e2ff, capeA: 0.42, belt: 0x261a45, gem: 0xffd36b, jade: 0xfff0b0, shoulder: 0x7a5fc0 },
];
const gradCache = new Map();
function gradTex([top, bot]) { // 漸層＋一條柔光（動漫上色感）
  const k = `${top}-${bot}`;
  if (gradCache.has(k)) return gradCache.get(k);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const x = c.getContext('2d'), hex = (v) => `#${v.toString(16).padStart(6, '0')}`;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, hex(top)); g.addColorStop(1, hex(bot));
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  const h = x.createLinearGradient(0, 0, 128, 0);
  h.addColorStop(0.18, 'rgba(255,255,255,0)'); h.addColorStop(0.3, 'rgba(255,255,255,0.22)'); h.addColorStop(0.42, 'rgba(255,255,255,0)');
  h.addColorStop(0.75, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,0.18)');
  x.fillStyle = h; x.fillRect(0, 0, 128, 256);
  const t = Texture.from(c);
  gradCache.set(k, t);
  return t;
}

const HEAD_COUNT = 7; // 0＝寫實木雕頭；1～6＝動漫風（web/public/puppet/heads/，老闆挑）
const HEAD_KEY = 'puppet-vfx.head';
const SILK = { n: 10, seg: 0.2, width: 0.32, gravity: 28, damp: 0.9 }; // 水袖（單位：手掌長）
// 零件圖的對位（以圖片寬高的比例表示）
const SWORD_IMG = { grip: 0.17, gripY: 0.22, guard: 0.29, tip: 0.995, bladeOverWidth: 0.69 }; // 劍平放、劍尖朝右
const HEAD_IMG = { anchorY: 0.6, heightOverR: 3.7 }; // 頭圖：冠頂到下巴約佔圖高 0.9
const SLASH_T = 0.3, STRIKE_T = 0.42; // 攻擊動畫長度（秒）

// ── 零件擺放（老闆 11/23：「你擺的位置好怪」→ 用 editor.html 自己拖）──
// 預設值＝老闆 11/23 在擺零件視窗擺好、貼回來的設定。長度單位：手掌長（頭的位移用頭半徑），角度用度。
// 存在 localStorage，主畫面開著時另一個分頁改了會即時套用。
export const LAYOUT_KEY = 'puppet-vfx.layout.v1';
export const LAYOUT_DEFAULTS = {
  bodyX: 0, bodyY: 0, // 脖子相對食指根（P5）：X 往拇指側、Y 往下
  robeTop: 0.6, robeHem: 1.269, robeLen: 1.323, // 袍子：肩寬一半、下擺寬一半、手腕到下擺的長度
  capeOn: 1, capeW: 1, pauldronOn: 1, beltOn: 1,
  outfit: 2, // 服裝（OUTFITS 的第幾套）
  armRoot: 0, // 袖子起點：0＝手指根，1＝肩膀
  sleeveW: 1.01, // 袖子粗細倍數
  swordX: -0.002, swordY: -0.008, swordRot: 75, swordScale: 0.593, // 劍：握把位移、角度（相對手臂方向）、長度倍數
  silkOn: 0, silkLen: 0.52, silkW: 1, // 水袖
  heads: { 1: { x: 0.068, y: 0.924 }, 4: { x: 0.126, y: 0.939 }, 5: { x: 0.004, y: 0.483 } }, // 每個偶頭各自的 { x, y, scale, rot }；x 往右、y 往下（頭半徑）
};
export const HEAD_DEFAULT = { x: 0, y: 0, scale: 1, rot: 0 };
export const headDefault = (i) => ({ ...HEAD_DEFAULT, ...(LAYOUT_DEFAULTS.heads[i] ?? {}) }); // 這顆頭的預設（含老闆擺好的）
export function loadLayout() {
  try { return { ...LAYOUT_DEFAULTS, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') }; } catch { return { ...LAYOUT_DEFAULTS }; }
}
const rad = (deg) => (deg * Math.PI) / 180;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
const perp = (a) => ({ x: -a.y, y: a.x });
const fromAng = (a) => ({ x: Math.cos(a), y: Math.sin(a) });
const flat = (pts) => pts.flatMap((p) => [p.x, p.y]);
const easeOut = (k) => 1 - (1 - k) ** 3;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
// 0→1→0 的出手曲線：前段快速出去、後段慢慢收回
const punch = (k, peak = 0.3) => (k < peak ? easeOut(k / peak) : 1 - easeOut((k - peak) / (1 - peak)));

export class PuppetSkin {
  constructor() {
    this.view = new Container();
    this.g = new Graphics();
    this.swordSp = new Sprite();
    this.headSp = new Sprite();
    this.swordSp.visible = this.headSp.visible = false;
    this.silk = [new Silk(), new Silk()]; // 兩條白色水袖（MeshRope＋簡單物理）
    this.view.addChild(this.g, ...this.silk.map((k) => k.rope), this.swordSp, this.headSp);
    this.lf = new LandmarkFilter({ minCutoff: 1.2, beta: 0.02 }); // One Euro 去抖（取代 EMA）
    this.headIdx = 0;
    try { this.headIdx = Math.min(HEAD_COUNT - 1, Math.max(0, +localStorage.getItem(HEAD_KEY) || 0)); } catch {}
    this.tex = null;
    const base = `${import.meta.env.BASE_URL}puppet/`;
    const headFiles = Array.from({ length: HEAD_COUNT - 1 }, (_, i) => `heads/${i + 1}.png`);
    Assets.load(['head_front.png', 'head_back.png', 'sword.png', 'robe_pattern.jpg', ...headFiles].map((f) => base + f))
      .then((t) => {
        this.tex = { headFront: t[base + 'head_front.png'], headBack: t[base + 'head_back.png'], sword: t[base + 'sword.png'], robe: t[base + 'robe_pattern.jpg'],
          heads: [t[base + 'head_front.png'], ...headFiles.map((f) => t[base + f])], views: {} };
        // 2.5D 多角度頭（老闆 11/23 選方案 A）：heads/<n>_q.png（3/4）、_side.png（側面）、_back.png（背面），圖都朝畫面左邊；有就用
        for (let i = 1; i < HEAD_COUNT; i++) {
          for (const v of ['q', 'side', 'back']) {
            Assets.load(`${base}heads/${i}_${v}.png`).then((tx) => { (this.tex.views[i] ??= {})[v] = tx; }).catch(() => {});
          }
        }
        this.swordSp.texture = this.tex.sword;
        this.swordSp.anchor.set(SWORD_IMG.grip, SWORD_IMG.gripY);
        this.headSp.anchor.set(0.5, HEAD_IMG.anchorY);
      })
      .catch((err) => console.warn('偶零件圖載入失敗，改用程式畫的', err));
    this.P = null;
    this.key = null;
    this.anim = null; // { type, t, dir }
    this.capeLag = { x: 0, y: 0 };
    this.lastNeck = null;
    this.now = 0;
    this.geo = null; // 上一幀算好的位置（給特效起點用）
    this.layout = loadLayout();
    addEventListener('storage', (e) => { if (e.key === LAYOUT_KEY) this.layout = loadLayout(); });
  }

  headLayout(i = this.headIdx) { return { ...headDefault(i), ...(this.layout.heads?.[i] ?? {}) }; }

  // 出招：type＝'slash'｜'strike'；dir＝影片座標的方向
  attack(type, dir) {
    const d = norm(dir && len(dir) > 1e-6 ? dir : { x: 1, y: 0 });
    this.anim = { type, t: this.now, dir: d };
  }

  // 換偶頭（H 鍵）；回傳目前第幾個
  nextOutfit() {
    this.layout.outfit = ((this.layout.outfit ?? 0) + 1) % OUTFITS.length;
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout)); } catch {}
    return this.layout.outfit;
  }

  nextHead() {
    this.headIdx = (this.headIdx + 1) % HEAD_COUNT;
    try { localStorage.setItem(HEAD_KEY, String(this.headIdx)); } catch {}
    return this.headIdx;
  }

  swordTip() { return this.geo?.swordTip ?? null; } // 劍指斬特效起點
  palmTip() { return this.geo?.freeHand ?? null; } // 推掌出手點

  // hand：戲偶手 { key, P, f }；沒有戲偶時傳 null；now：秒
  draw(hand, now) {
    this.now = now;
    const g = this.g;
    g.clear();
    this.swordSp.visible = this.headSp.visible = false;
    if (!hand) { this.P = null; this.geo = null; this.silk.forEach((k) => (k.rope.visible = false)); return; }
    const T = this.tex;
    const O = OUTFITS[this.layout.outfit] ?? OUTFITS[0];
    const robeFill = O.retro ? (T ? { texture: T.robe, color: 0xffffff } : { color: COL.robe }) : { texture: gradTex(O.robe), color: 0xffffff };
    const sleeveFill = O.retro ? (T ? { texture: T.robe, color: 0xb8c4e8 } : { color: COL.robeDark }) : { texture: gradTex(O.sleeve), color: 0xffffff };
    if (!this.P || this.key !== hand.key) { this.lf.reset(); this.lastNeck = null; this.silk.forEach((k) => k.reset()); }
    this.P = this.lf.filter(hand.P, now);
    this.key = hand.key;
    const P = this.P;
    const L = this.layout;
    const palm = len(sub(P[9], P[0])) || 1;
    const facing = hand.f.facing ?? { x: 0, y: 0, z: -1 };
    const back = this.back ? facing.z > 0.15 : facing.z > 0.35; // 遲滯：側面附近不來回閃
    this.back = back;
    // 轉身角度（2.5D）：yaw＝面向的左右角度；老闆平常擺的「正面」不是正對鏡頭（紀錄：左手約 -28°、右手約 +5°），
    // 所以用慢慢跟上的基準角，只有明顯轉離平常角度才換 3/4、側面圖
    const yaw = Math.atan2(facing.x, -facing.z);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // 基準角限制在紀錄看到的「平常正面」範圍（-40°～+20°），一開始就轉著也不會卡住
    const clampBase = (a) => Math.max(rad(-40), Math.min(rad(20), a));
    if (this.yawBase === undefined || this.key !== this.yawKey) { this.yawBase = clampBase(back ? 0 : yaw); this.yawKey = this.key; }
    let rel = wrap(yaw - this.yawBase);
    const dtY = Math.min(0.1, Math.max(0, now - (this.yawT ?? now)));
    this.yawT = now;
    if (!back && Math.abs(rel) < rad(70)) { // 接近時 4 秒跟上；轉開時 20 秒才慢慢跟（擺 3/4 不會很快被吃掉）
      const tau = Math.abs(rel) < rad(20) ? 4 : 20;
      this.yawBase = clampBase(wrap(this.yawBase + rel * (1 - Math.exp(-dtY / tau))));
      rel = wrap(yaw - this.yawBase);
    }
    const ar = Math.abs(rel) * 180 / Math.PI, pv = this.headView ?? 'front', hy = 6;
    const view = back ? 'back' : ar >= 65 + (pv === 'side' ? -hy : hy) ? 'side' : ar >= 30 + (pv === 'front' ? hy : -hy) ? 'q' : 'front';
    this.headView = view; // 注意：this.view 是整隻偶的 Container，不能拿來存視角
    this.rel = rel;
    const turnK = back ? 1 : 0.6 + 0.4 * Math.cos(Math.min(Math.abs(rel), Math.PI / 2)); // 側身時身體變窄

    // ── 攻擊動畫進度 ──
    const an = this.anim;
    let slashK = -1, strikeK = -1;
    if (an) {
      const k = (now - an.t) / (an.type === 'slash' ? SLASH_T : STRIKE_T);
      if (k >= 1) this.anim = null;
      else if (an.type === 'slash') slashK = clamp01(k);
      else strikeK = clamp01(k);
    }
    const lean = slashK >= 0 ? mul(an.dir, punch(slashK, 0.35) * 0.25 * palm)
      : strikeK >= 0 ? mul(an.dir, punch(strikeK, 0.3) * 0.35 * palm) : { x: 0, y: 0 };

    // ── 身體框架 ──
    const down = norm(sub(P[0], P[5]));
    let side = perp(down);
    if ((P[2].x - P[5].x) * side.x + (P[2].y - P[5].y) * side.y < 0) side = mul(side, -1); // side 指向拇指側
    const bodyOff = add(mul(side, L.bodyX * palm), mul(down, L.bodyY * palm));
    const neck = add(add(P[5], lean), bodyOff);
    const hemC = add(add(P[0], mul(down, L.robeLen * palm)), bodyOff);

    // 披風飄動：身體移動時下擺落後
    if (this.lastNeck) {
      this.capeLag = lerp(this.capeLag, mul(sub(neck, this.lastNeck), -4), 0.2);
      const cl = len(this.capeLag), mx = 0.8 * palm;
      if (cl > mx) this.capeLag = mul(this.capeLag, mx / cl);
    }
    this.lastNeck = neck;

    // 披風（最後面）
    const w1 = L.robeTop * palm * turnK, w2 = L.robeHem * palm * turnK;
    const sh = 1.25 * w1 * L.capeW;
    const capeTop = [add(neck, mul(side, sh)), add(neck, mul(side, -sh))];
    const capeBot = add(add(hemC, mul(down, 0.3 * palm)), this.capeLag);
    const capePts = [capeTop[0]];
    const cw2 = (1.3 / 1.1) * w2 * L.capeW;
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      const p = add(capeBot, mul(side, cw2 * (1 - 2 * k)));
      capePts.push(add(p, mul(down, Math.sin(k * Math.PI * 4 + now * 6) * 0.07 * palm)));
    }
    capePts.push(capeTop[1]);
    if (L.capeOn) {
      g.poly(flat(capePts)).fill({ color: O.cape, alpha: O.capeA });
      if (O.retro) g.poly(flat([capeTop[0], lerp(capeTop[0], capeBot, 0.6), lerp(capeTop[1], capeBot, 0.6), capeTop[1]])).fill({ color: COL.capeDark, alpha: 0.35 });
      else g.poly(flat(capePts)).stroke({ width: 0.03 * palm, color: 0xffffff, alpha: 0.5 }); // 披帛：半透明紗＋亮邊
    }

    // 長袍
    const tl = add(neck, mul(side, w1)), tr = add(neck, mul(side, -w1));
    const hem = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      const p = lerp(add(hemC, mul(side, w2)), add(hemC, mul(side, -w2)), k);
      hem.push(add(p, mul(down, Math.sin(k * Math.PI * 3) * 0.08 * palm)));
    }
    g.poly(flat([tl, ...hem, tr])).fill(robeFill);
    const hemIn = hem.map((p) => add(p, mul(down, -(O.modern ? 0.14 : 0.22) * palm)));
    g.poly(flat([...hemIn, ...[...hem].reverse()])).fill({ color: O.hem }); // 下擺深色邊
    g.moveTo(hemIn[0].x, hemIn[0].y);
    for (const p of hemIn.slice(1)) g.lineTo(p.x, p.y);
    g.stroke({ width: (O.modern ? 0.035 : 0.06) * palm, color: O.trim });
    g.poly(flat([tl, ...hem, tr])).stroke({ width: (O.modern ? 0.035 : 0.05) * palm, color: O.trimDark });
    if (!back && O.modern) { // 開襟：中間露出白內衫，兩側滾邊
      const shift = { x: Math.sin(rel) * 0.35 * palm, y: 0 }; // 開襟往面向那側偏
      const midTop = add(neck, shift), midBot = add(hemC, shift);
      const a0 = add(midTop, mul(side, 0.16 * palm)), a1 = add(midTop, mul(side, -0.16 * palm));
      const z0 = add(midBot, mul(side, 0.42 * palm)), z1 = add(midBot, mul(side, -0.3 * palm));
      g.poly(flat([a0, z0, z1, a1])).fill({ color: O.inner });
      g.poly(flat([lerp(a0, z0, 0.5), z0, add(z0, mul(side, -0.12 * palm))])).fill({ color: O.hem, alpha: 0.25 }); // 內衫陰影
      for (const [p, q] of [[a0, z0], [a1, z1]]) g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 0.07 * palm, color: O.trim });
      const v = add(neck, mul(down, 0.4 * palm)); // 交領小 V
      g.moveTo(a0.x, a0.y).lineTo(v.x, v.y).lineTo(a1.x, a1.y).stroke({ width: 0.05 * palm, color: O.trim });
    }
    if (!back && O.retro) { // 交領（右衽）
      const v = add(neck, add(mul(down, 0.55 * palm), mul(side, -0.12 * palm)));
      const l0 = add(neck, mul(side, 0.34 * palm));
      g.poly(flat([l0, v, add(v, mul(side, 0.18 * palm)), add(neck, mul(side, 0.12 * palm))])).fill({ color: O.inner });
      g.poly(flat([add(neck, mul(side, -0.34 * palm)), v, add(v, mul(side, -0.12 * palm))])).fill({ color: O.inner });
      g.moveTo(l0.x, l0.y).lineTo(v.x, v.y).stroke({ width: 0.05 * palm, color: O.trim });
    }
    // 腰帶＋玉珮
    const beltC = lerp(neck, hemC, 0.42), bw = w1 + (w2 - w1) * 0.42;
    const b0 = add(beltC, mul(side, bw)), b1 = add(beltC, mul(side, -bw));
    if (L.beltOn) {
      g.moveTo(b0.x, b0.y).lineTo(b1.x, b1.y).stroke({ width: (O.modern ? 0.2 : 0.18) * palm, color: O.belt });
      g.moveTo(b0.x, b0.y).lineTo(b1.x, b1.y).stroke({ width: (O.modern ? 0.03 : 0.06) * palm, color: O.modern ? O.trim : O.gem });
    }
    if (!back && L.beltOn && O.modern) { // 腰帶結＋兩條飄帶（跟著身體晃）
      const knot = add(beltC, mul(side, 0.25 * palm));
      for (const [s2, ln] of [[1, 1.0], [-1, 0.8]]) {
        const sway = add(mul(this.capeLag, 0.6), mul(side, Math.sin(now * 4 + s2) * 0.06 * palm));
        const e = add(add(knot, mul(down, ln * palm)), add(mul(side, s2 * 0.18 * palm), sway));
        const m = add(lerp(knot, e, 0.5), mul(side, s2 * 0.08 * palm));
        g.moveTo(knot.x, knot.y).quadraticCurveTo(m.x, m.y, e.x, e.y).stroke({ width: 0.09 * palm, color: O.belt, cap: 'round' });
      }
      g.circle(knot.x, knot.y, 0.1 * palm).fill({ color: O.gem }).stroke({ width: 0.025 * palm, color: O.trimDark });
    }
    if (!back && L.beltOn && O.retro) {
      const jade = add(beltC, mul(down, 0.25 * palm)), jt = add(jade, mul(down, 0.35 * palm));
      g.circle(jade.x, jade.y, 0.1 * palm).fill({ color: O.jade });
      g.moveTo(jade.x, jade.y).lineTo(jt.x, jt.y).stroke({ width: 0.04 * palm, color: O.gem });
    }
    // 肩甲
    const shoulder = (s) => add(neck, mul(side, s * (0.55 / 0.6) * w1));
    for (const s of L.pauldronOn ? [1, -1] : []) {
      const c = shoulder(s);
      if (O.modern) { // 布料披肩：圓弧，不是金屬甲
        const pts = [];
        for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push(add(c, add(mul(side, s * Math.cos(a) * 0.32 * palm), mul(down, -Math.sin(a) * 0.14 * palm + 0.12 * palm)))); }
        g.poly(flat(pts)).fill({ color: O.shoulder }).stroke({ width: 0.03 * palm, color: O.trim });
      } else {
        g.poly(flat([add(c, mul(side, s * 0.35 * palm)), add(c, mul(down, 0.3 * palm)), add(c, mul(side, -s * 0.2 * palm)), add(c, mul(down, -0.12 * palm))]))
          .fill({ color: O.shoulder }).stroke({ width: 0.03 * palm, color: O.trimDark });
      }
    }

    // ── 手臂（廣袖）──
    // 袖子起點可往肩膀挪（armRoot）
    let freeArm = [lerp(add(P[2], lean), shoulder(1), L.armRoot), add(P[3], lean), add(P[4], lean)]; // 空手＝拇指
    if (strikeK >= 0) { // 推掌：往戲偶面向推出去
      const tip = add(freeArm[2], mul(an.dir, punch(strikeK, 0.28) * 1.5 * palm));
      freeArm = [freeArm[0], lerp(freeArm[0], tip, 0.55), tip];
    }
    let swordArm = [P[9], P[10], P[11], P[12]].map((p) => add(p, lean)); // 持劍手＝中指
    swordArm[0] = lerp(swordArm[0], shoulder(-1), L.armRoot);
    if (slashK >= 0) { // 劍指斬：手往劃的方向伸
      const reach = punch(slashK, 0.35) * 0.9 * palm;
      swordArm = swordArm.map((p, i) => add(p, mul(an.dir, reach * (i / 3))));
    }
    const drawSleeve = (pts) => {
      const Ls = [], Rr = [];
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const n = perp(norm(sub(b, a)));
        const w = (0.24 + 0.2 * (i / (pts.length - 1))) * palm * L.sleeveW; // 廣袖：袖口寬
        Ls.push(add(p, mul(n, w))); Rr.push(add(p, mul(n, -w)));
      });
      g.poly(flat([...Ls, ...Rr.reverse()])).fill(sleeveFill).stroke({ width: 0.05 * palm, color: O.trim });
      if (O.modern) { // 袖口內層白紗
        const n = perp(norm(sub(pts.at(-1), pts.at(-2)))), w = 0.3 * palm * L.sleeveW, t = pts.at(-1);
        g.poly(flat([add(t, mul(n, w)), add(add(t, mul(n, w * 0.8)), mul(norm(sub(t, pts.at(-2))), 0.12 * palm)), add(add(t, mul(n, -w * 0.8)), mul(norm(sub(t, pts.at(-2))), 0.12 * palm)), add(t, mul(n, -w))])).fill({ color: O.inner, alpha: 0.9 });
      }
      const tip = pts.at(-1), dir = norm(sub(tip, pts.at(-2))), cuff = perp(dir), cw = 0.42 * palm * L.sleeveW;
      const c0 = add(tip, mul(cuff, cw)), c1 = add(tip, mul(cuff, -cw));
      g.moveTo(c0.x, c0.y).lineTo(c1.x, c1.y).stroke({ width: (O.modern ? 0.08 : 0.14) * palm, color: O.modern ? O.trim : O.inner });
      const hand = add(tip, mul(dir, 0.16 * palm));
      g.circle(hand.x, hand.y, 0.15 * palm).fill({ color: COL.skin });
      return { hand, dir };
    };
    const free = drawSleeve(freeArm);
    const sw = drawSleeve(swordArm);
    // 水袖：從兩隻袖口垂下，跟著手甩動
    const dt = Math.min(0.05, Math.max(0.001, now - (this.lastNow ?? now - 1 / 60)));
    this.lastNow = now;
    for (const [i, h] of [free.hand, sw.hand].entries()) {
      if (L.silkOn) this.silk[i].step(h, dt, palm, L.silkLen, L.silkW);
      else { this.silk[i].rope.visible = false; this.silk[i].reset(); }
    }

    // ── 劍 ──
    // 平常：沿手臂往外上方斜舉；揮劍：繞手腕從揮劍方向的後方掃到前方
    const swSign = Math.sign(side.x || 1);
    const armAng = Math.atan2(sw.dir.y, sw.dir.x);
    let bladeAng = armAng + rad(L.swordRot) * swSign;
    const grip = add(sw.hand, add(mul(side, L.swordX * palm), mul(down, L.swordY * palm)));
    if (slashK >= 0) {
      const da = Math.atan2(an.dir.y, an.dir.x);
      bladeAng = da - 1.9 + 2.6 * easeOut(clamp01(slashK / 0.45)); // 從 -109° 掃到 +40°
    }
    const bd = fromAng(bladeAng), bn = perp(bd);
    const bladeLen = 2.4 * palm * L.swordScale;
    let guardC, tipP;
    if (T) { // 劍圖：握把中心對在手上，沿 bladeAng 轉
      const W = bladeLen / SWORD_IMG.bladeOverWidth;
      const sp = this.swordSp;
      sp.visible = true;
      sp.position.set(grip.x, grip.y);
      sp.rotation = bladeAng;
      sp.scale.set(W / T.sword.width);
      guardC = add(grip, mul(bd, (SWORD_IMG.guard - SWORD_IMG.grip) * W));
      tipP = add(grip, mul(bd, (SWORD_IMG.tip - SWORD_IMG.grip) * W));
    } else {
      const bw0 = 0.09 * palm;
      guardC = add(grip, mul(bd, 0.22 * palm));
      tipP = add(guardC, mul(bd, bladeLen));
      const pommel = add(grip, mul(bd, -0.25 * palm));
      g.moveTo(pommel.x, pommel.y).lineTo(guardC.x, guardC.y).stroke({ width: 0.11 * palm, color: COL.hilt, cap: 'round' });
      const tas = add(add(pommel, mul(down, 0.45 * palm)), mul(this.capeLag, 0.3)); // 劍穗
      g.moveTo(pommel.x, pommel.y).lineTo(tas.x, tas.y).stroke({ width: 0.07 * palm, color: COL.tassel });
      const nearTip = add(guardC, mul(bd, bladeLen * 0.92));
      g.poly(flat([add(guardC, mul(bn, bw0)), add(nearTip, mul(bn, bw0 * 0.7)), tipP, add(nearTip, mul(bn, -bw0 * 0.7)), add(guardC, mul(bn, -bw0))]))
        .fill({ color: COL.blade });
      g.moveTo(guardC.x, guardC.y).lineTo(tipP.x, tipP.y).stroke({ width: 0.025 * palm, color: COL.bladeShade }); // 劍脊
      const e0 = add(guardC, mul(bn, bw0 * 0.8));
      g.moveTo(e0.x, e0.y).lineTo(tipP.x, tipP.y).stroke({ width: 0.02 * palm, color: COL.bladeEdge });
      g.poly(flat([add(guardC, mul(bn, 0.26 * palm)), add(guardC, mul(bd, 0.08 * palm)), add(guardC, mul(bn, -0.26 * palm)), add(guardC, mul(bd, -0.06 * palm))]))
        .fill({ color: COL.guard }).stroke({ width: 0.02 * palm, color: COL.trimDark });
    }
    if (slashK >= 0 && slashK < 0.5) { // 揮劍殘影
      for (let j = 1; j <= 3; j++) {
        const t2 = add(guardC, mul(fromAng(bladeAng - 0.25 * j), bladeLen));
        g.moveTo(guardC.x, guardC.y).lineTo(t2.x, t2.y).stroke({ width: 0.12 * palm, color: COL.bladeEdge, alpha: 0.25 / j });
      }
    }

    // ── 頭（食指）──
    const HL = this.headLayout();
    const up0 = norm(sub(P[8], P[6]));
    const up = { x: up0.x * Math.cos(rad(HL.rot)) - up0.y * Math.sin(rad(HL.rot)), y: up0.x * Math.sin(rad(HL.rot)) + up0.y * Math.cos(rad(HL.rot)) };
    const rt = perp(up);
    const R = 0.55 * palm * HL.scale; // 布袋戲偶頭比例大
    const R0 = 0.55 * palm;
    const H = add(add(add(lerp(P[7], P[8], 0.5), mul(up0, 0.1 * palm)), mul(lean, 1.3)), add(mul(perp(up0), HL.x * R0), mul(up0, -HL.y * R0)));
    const at = (dx, dy) => add(H, add(mul(rt, dx * R), mul(up, -dy * R))); // dx 右、dy 下（頭的本地座標）
    const oval = (cx, cy, rx, ry, color, alpha = 1) => {
      const pts = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        pts.push(at(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
      }
      g.poly(flat(pts)).fill({ color, alpha });
    };
    const fx = back ? 0 : Math.max(-0.35, Math.min(0.35, facing.x * 0.6)); // 側臉：五官往面向那側偏
    if (T) { // 偶頭圖：側身時稍微壓窄
      const hs = this.headSp;
      // 背面：寫實頭用背面圖；動漫頭沒有背面圖 → 把正面壓成深色剪影當後腦勺
      // 有多角度圖就照轉身角度換圖（圖朝左，往 +x 轉時左右翻）；沒有就用舊做法
      const V = T.views?.[this.headIdx];
      let tex = T.heads[this.headIdx], tint = 0xffffff, flip = 1, squash = 1 - 0.3 * Math.abs(fx);
      if (back) {
        if (V?.back) { tex = V.back; squash = 1; } else if (this.headIdx === 0) tex = T.headBack; else tint = 0x15151a;
      } else if (V?.[view]) { tex = V[view]; flip = rel > 0 ? -1 : 1; squash = 1; }
      else if (V) squash = 1;
      hs.texture = tex;
      hs.tint = tint;
      hs.anchor.set(0.5, HEAD_IMG.anchorY);
      hs.visible = true;
      const k = (HEAD_IMG.heightOverR * R) / hs.texture.height;
      hs.scale.set(k * squash * flip, k);
      const c = at(0, 0.1);
      hs.position.set(c.x, c.y);
      hs.rotation = Math.atan2(up.y, up.x) + Math.PI / 2;
    } else {
      const polyAt = (arr, color, alpha = 1) => g.poly(flat(arr.map(([x, y]) => at(x, y)))).fill({ color, alpha });
      for (const s of [-1, 1]) polyAt([[s * 0.7, -0.3], [s * 0.95, 0.4], [s * 0.85, 1.6], [s * 0.6, 1.7], [s * 0.6, 0.3]], COL.hair); // 兩側長髮
      polyAt([[-0.75, -0.2], [-0.7, 0.35], [-0.45, 0.85], [0, 1.08], [0.45, 0.85], [0.7, 0.35], [0.75, -0.2], [0, -0.6]], COL.skin); // 瓜子臉
      polyAt([[-0.88, 0.05], [-0.8, -0.6], [-0.35, -0.95], [0.35, -0.95], [0.8, -0.6], [0.88, 0.05], [0.55, -0.35], [fx, -0.5], [-0.55, -0.35]], COL.hair); // 髮際
      oval(-0.25, -0.75, 0.2, 0.08, COL.hairHi, 0.6); // 髮絲光澤
      oval(0, -1.15, 0.36, 0.3, COL.hair); // 髮髻
      polyAt([[-0.5, -1.0], [-0.42, -1.45], [-0.18, -1.3], [0, -1.75], [0.18, -1.3], [0.42, -1.45], [0.5, -1.0]], COL.crown); // 冠
      polyAt([[-0.5, -1.0], [0.5, -1.0], [0.46, -1.1], [-0.46, -1.1]], COL.trimDark);
      const jw = at(0, -1.22);
      g.circle(jw.x, jw.y, 0.1 * R).fill({ color: COL.jewel });
      const p0 = at(-0.9, -1.1), p1 = at(0.95, -1.25);
      g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: 0.06 * R, color: COL.crown }); // 髮簪
      if (back) {
        oval(0, 0.1, 0.86, 1.05, COL.hair); // 後腦勺
      } else { // 劍眉、鳳眼（眼影）、鼻、唇、腮紅、額間硃砂
        for (const s of [-1, 1]) {
          polyAt([[fx + s * 0.12, -0.12], [fx + s * 0.55, -0.3], [fx + s * 0.6, -0.24], [fx + s * 0.15, -0.06]], COL.brow);
          polyAt([[fx + s * 0.16, 0.08], [fx + s * 0.38, -0.02], [fx + s * 0.58, 0.02], [fx + s * 0.4, 0.12]], COL.eyeShadow, 0.55);
          polyAt([[fx + s * 0.18, 0.1], [fx + s * 0.38, 0.03], [fx + s * 0.55, 0.06], [fx + s * 0.38, 0.12]], COL.eye);
          oval(fx + s * 0.5, 0.45, 0.16, 0.08, COL.blush, 0.45);
        }
        const n0 = at(fx + 0.02, 0.2), n1 = at(fx + 0.06, 0.5);
        g.moveTo(n0.x, n0.y).lineTo(n1.x, n1.y).stroke({ width: 0.04 * R, color: 0xc89a82 });
        polyAt([[fx - 0.17, 0.7], [fx, 0.64], [fx + 0.17, 0.7], [fx, 0.78]], COL.lip);
        oval(fx, -0.32, 0.05, 0.08, COL.jewel);
      }
    }
    this.geo = { freeHand: free.hand, swordTip: tipP, guard: guardC, head: H,
      // 給擺放視窗用的座標系
      frame: { palm, side, down, up0, R0, neck, hemC, grip, swordHand: sw.hand, armAng, swSign, bladeLen0: bladeLen / L.swordScale, P0: P[0], P5: P[5] } };
  }
}

// 水袖：一串點的簡單物理（Verlet＋固定段長），用 MeshRope 貼一條白色半透明綢帶
let silkTex = null;
function silkTexture() {
  if (silkTex) return silkTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, 'rgba(210,225,255,0)');
  g.addColorStop(0.2, 'rgba(235,242,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.8, 'rgba(235,242,255,0.85)');
  g.addColorStop(1, 'rgba(210,225,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 32);
  return (silkTex = Texture.from(c));
}

class Silk {
  constructor() {
    this.pts = Array.from({ length: SILK.n }, () => new Point());
    this.rope = new MeshRope({ texture: silkTexture(), points: this.pts.map(() => new Point()) });
    this.rope.visible = false;
    this.reset();
  }

  reset() { this.cur = null; this.prev = null; }

  step(anchor, dt, palm, lenK = 1, widthK = 1) {
    const seg = SILK.seg * palm * lenK;
    if (!this.cur) {
      this.cur = this.pts.map((_, i) => ({ x: anchor.x, y: anchor.y + i * seg }));
      this.prev = this.cur.map((p) => ({ ...p }));
    }
    const g = SILK.gravity * palm * dt * dt;
    for (let i = 1; i < SILK.n; i++) { // Verlet：慣性＋重力
      const p = this.cur[i], q = this.prev[i];
      const vx = (p.x - q.x) * SILK.damp, vy = (p.y - q.y) * SILK.damp;
      q.x = p.x; q.y = p.y;
      p.x += vx; p.y += vy + g;
    }
    this.cur[0] = { x: anchor.x, y: anchor.y };
    for (let it = 0; it < 4; it++) { // 段長固定
      for (let i = 1; i < SILK.n; i++) {
        const a = this.cur[i - 1], b = this.cur[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const k = (d - seg) / d;
        if (i === 1) { b.x -= dx * k; b.y -= dy * k; } else { a.x += dx * k * 0.5; a.y += dy * k * 0.5; b.x -= dx * k * 0.5; b.y -= dy * k * 0.5; }
      }
      this.cur[0] = { x: anchor.x, y: anchor.y };
    }
    // MeshRope 的寬度＝貼圖高度：整條繩縮放到想要的寬度，點座標反過來除回去
    const s = (SILK.width * palm * widthK) / 32;
    this.rope.scale.set(s);
    this.rope.geometry.points.forEach((pt, i) => pt.set(this.cur[i].x / s, this.cur[i].y / s));
    this.rope.visible = true;
  }
}
