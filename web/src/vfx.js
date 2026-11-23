import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';

// M1.3 特效第二版（2026-11-23 老闆：第一版「線條＋圓圈」和想像差很多）。
// 參考網頁版 Neon 對布袋戲特效的拆解，先做不用素材的兩件事：
//   ② 光：中心死白、外圍高飽和色光，整層加泛光（Bloom）
//   ③ 節奏：定格 → 閃白＋色差＋相機畫面被衝擊波扭曲 → 煙塵與火星餘韻
// 煙火、水墨的「實拍質感」之後用免費序列幀素材補（老闆選先找免費素材）。
// 座標：world 裡＝影片像素（鏡像由外層處理）；招式名與閃白在舞台層＝螢幕像素。

const PAL = {
  slash: { core: 0xffffff, glow: 0x2ad4ff, accent: 0x9a5cff, spark: 0xbff4ff },
  strike: { core: 0xfffbe8, glow: 0xffb020, accent: 0xff4a1a, spark: [0xffd060, 0xff8a2a, 0xfff2c0] },
};
const SLASH = { life: 0.45, reveal: 0.06, len: 6.5, stop: 0.06 };
const STRIKE = { life: 0.7, stop: 0.12, palmLife: 0.42, travel: 0.3, dist: 10 }; // 掌印 0.3 秒往側邊平飛 10 個手掌長

const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (k) => 1 - (1 - k) ** 3;
const clamp01 = (k) => Math.max(0, Math.min(1, k));

// 柔邊圓點貼圖（火星、煙用），只做一次
let softTex = null;
function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return (softTex = Texture.from(c));
}

export class VfxDirector {
  // world：影片座標容器；videoSource：相機貼圖來源（定格用）
  constructor({ app, world, videoSource, vw, vh }) {
    this.world = world;
    this.vw = vw; this.vh = vh;
    // 濾鏡範圍＝整張相機畫面。Pixi 8 的 filterArea 是本地座標，會套上容器自己的變換（FilterSystem._calculateFilterArea）
    world.filterArea = new Rectangle(0, 0, vw, vh);
    this.videoSource = videoSource;

    this.smoke = new Container(); // 煙：一般混合、不加泛光
    this.glow = new Container(); // 光：疊加混合＋泛光
    this.g = new Graphics();
    this.g.blendMode = 'add';
    this.sparks = new Container();
    this.glow.addChild(this.g, this.sparks);
    world.addChild(this.smoke, this.glow);
    this.glow.filterArea = new Rectangle(0, 0, vw, vh); // 火星飛出畫面外不用算泛光
    this.bloom = new AdvancedBloomFilter({ threshold: 0.12, bloomScale: 1.8, brightness: 1.1, blur: 10, quality: 6 });

    this.flashG = new Graphics(); // 全畫面閃白（舞台最上層）
    this.flashG.blendMode = 'add';
    this.title = new MoveTitle();
    app.stage.addChild(this.title.view, this.flashG);

    this.shockwave = new ShockwaveFilter({ amplitude: 40, wavelength: 220, speed: 1400, brightness: 1.15, radius: -1 });
    this.rgb = new RGBSplitFilter({ red: { x: 0, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 0, y: 0 } });

    this.clock = 0; // 特效時鐘：定格時停住
    this.real = 0; // 真實時間：閃白、震動、衝擊波用，不受定格影響
    this.freezeLeft = 0;
    this.camFreezeLeft = 0;
    this.effects = [];
    this.parts = [];
    this.flash = { t: -1, dur: 0.12, peak: 0 };
    this.split = { t: -1, dur: 0.2, amp: 0 };
    this.wave = { t: -1, dur: 0.7, o: null };
    this.shake = { amp: 0, dur: 1, t: -1 };
  }

  // ev：FSM 事件；skillP：技能手 21 點（影片像素，推掌掌印用，可省略）
  trigger(ev, skillP) {
    if (!ev?.origin) return;
    const palm = Math.max(20, ev.palm || 80);
    const o = { ...ev.origin };
    if (ev.type === 'slash') {
      let dx = ev.dir?.x ?? 0, dy = ev.dir?.y ?? 1;
      const n = Math.hypot(dx, dy);
      if (n < 1e-6) { dx = 0; dy = 1; } else { dx /= n; dy /= n; }
      this.hitStop(SLASH.stop, false); // 劍指斬：只停相機畫面，刀光照常長出來（不延遲）
      this.effects.push({ type: 'slash', t0: this.clock, o, d: { x: dx, y: dy }, palm, side: Math.random() < 0.5 ? 1 : -1 });
      // 沿刀光噴出的火星
      for (let i = 0; i < 34; i++) {
        const a = Math.atan2(dy, dx) + rand(-0.5, 0.5);
        const along = rand(0.1, 1) * SLASH.len * palm;
        this.spark(o.x + dx * along, o.y + dy * along, a, rand(6, 20) * palm, rand(0.25, 0.6), PAL.slash.spark, rand(0.08, 0.16) * palm, 0.2 * palm);
      }
      // 刀光尾端飄一點冷色煙
      for (let i = 0; i < 6; i++) {
        const along = rand(0.3, 1) * SLASH.len * palm;
        this.puff(o.x + dx * along, o.y + dy * along, palm, 0x9ab8d0, 0.16, rand(0.8, 1.3));
      }
      this.kick(7, 0.18);
      this.doFlash(0.25, 0.08);
      this.doSplit(4, 0.12);
      this.title.show('劍指斬', PAL.slash);
    } else {
      this.hitStop(STRIKE.stop);
      const shape = skillP ? palmShape(skillP) : null;
      // 方向＝戲偶面向（老闆 11/23：掌氣往偶面向處打，不是往螢幕）
      let dx = ev.dir?.x ?? 1, dy = ev.dir?.y ?? 0;
      const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
      const d = { x: dx, y: dy };
      o.x += dx * 0.7 * palm; o.y += dy * 0.7 * palm; // 出手點往前一點，爆光才不會蓋住偶臉
      this.effects.push({ type: 'strike', t0: this.clock, o, palm, shape, d });
      this.effects.push({ type: 'impact', t0: this.clock + STRIKE.travel, o: { x: o.x + dx * STRIKE.dist * palm, y: o.y + dy * STRIKE.dist * palm }, palm, d });
      // 定格期間：光點往戲偶身上吸（聚氣），定格結束後爆開
      for (let i = 0; i < 40; i++) {
        const a = rand(0, Math.PI * 2), r = rand(2, 4) * palm;
        this.parts.push(this.mkSprite({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r, tx: o.x, ty: o.y, implode: true, rot: a,
          life: STRIKE.stop + 0.02, real: true, tint: PAL.strike.spark[i % 3], size: rand(0.2, 0.35) * palm, layer: this.sparks }));
      }
      this.effects.push({ type: 'burst', t0: this.clock, o, palm, d }); // 爆開的火星與煙等定格結束才放
      // 出手只小震、小閃；重震、閃白、相機衝擊波都放在命中點（impact），才不像往鏡頭打
      this.kick(8, 0.2, STRIKE.stop);
      this.doFlash(0.25, 0.08, STRIKE.stop);
      this.title.show('推掌', PAL.strike);
    }
  }

  // 定格（打擊頓點）：相機畫面停住；fx＝true 時特效時鐘也停（推掌：先聚氣、定格結束才爆）
  hitStop(sec, fx = true) {
    if (fx) this.freezeLeft = Math.max(this.freezeLeft, sec);
    this.camFreezeLeft = Math.max(this.camFreezeLeft ?? 0, sec);
    if (this.videoSource) this.videoSource.autoUpdate = false;
  }

  // 新震動比「目前剩下的震幅」大才換
  kick(amp, dur, delay = 0) {
    const t = this.real + delay;
    const { amp: a0, dur: d0, t: t0 } = this.shake;
    const left = a0 ? a0 * clamp01(1 - (this.real - t0) / d0) ** 2 : 0;
    if (amp >= left) this.shake = { amp, dur, t };
  }

  flashLeft() {
    const { t, dur, peak } = this.flash;
    return t < 0 || this.real < t ? 0 : peak * clamp01(1 - (this.real - t) / dur);
  }
  doFlash(peak, dur, delay = 0) { if (peak >= this.flashLeft()) this.flash = { t: this.real + delay, dur, peak }; }
  doSplit(amp, dur, delay = 0) { this.split = { t: this.real + delay, dur, amp }; }

  spark(x, y, a, sp, life, tint, size, gravity = 0) {
    this.parts.push(this.mkSprite({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, tint, size, drag: 3.5, gravity, stretch: true, layer: this.sparks }));
  }

  puff(x, y, palm, tint, alpha, life) {
    const a = rand(0, Math.PI * 2), sp = rand(0.3, 1.2) * palm;
    this.parts.push(this.mkSprite({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6 * palm, life, tint, size: rand(1.2, 2) * palm,
      grow: 2.2, alpha, drag: 1.2, layer: this.smoke, smoke: true }));
  }

  mkSprite(p) {
    const s = new Sprite(softTexture());
    s.anchor.set(0.5);
    s.tint = p.tint;
    s.position.set(p.x, p.y);
    s.alpha = 0;
    if (!p.smoke) s.blendMode = 'add';
    p.layer.addChild(s);
    return { vx: 0, vy: 0, drag: 0, gravity: 0, grow: 1, alpha: 1, age: 0, ...p, s };
  }

  get active() { return this.effects.length > 0 || this.parts.length > 0 || this.freezeLeft > 0 || this.camFreezeLeft > 0; }

  // 每個畫面幀呼叫；dt：秒；screenW/H：螢幕大小
  update(dt, screenW, screenH) {
    this.real += dt;
    let fdt = dt; // 特效時鐘的 dt（定格時為 0）
    if (this.freezeLeft > 0) { this.freezeLeft -= dt; fdt = 0; }
    if (this.camFreezeLeft > 0) {
      this.camFreezeLeft -= dt;
      if (this.camFreezeLeft <= 0 && this.videoSource) this.videoSource.autoUpdate = true;
    }
    this.clock += fdt;

    const g = this.g;
    g.clear();
    this.effects = this.effects.filter((e) => {
      const age = this.clock - e.t0;
      if (e.type === 'slash') { drawSlash(g, e, age); return age < SLASH.life; }
      if (e.type === 'strike') { drawStrike(g, e, age); return age < STRIKE.life; }
      if (e.type === 'ring') { drawRing(g, e, age); return age < 0.4; }
      if (e.type === 'burst' && age > 0) { this.burst(e); return false; }
      if (e.type === 'impact' && age > 0) { this.impact(e); return false; }
      return true;
    });

    this.parts = this.parts.filter((p) => {
      const step = p.real ? dt : fdt;
      p.age += step;
      const k = p.age / p.life;
      if (k >= 1) { p.s.destroy(); return false; }
      if (p.implode) { // 往中心吸
        const e = easeOut(k);
        p.s.position.set(p.x + (p.tx - p.x) * e, p.y + (p.ty - p.y) * e);
        p.s.alpha = 0.5 + 0.5 * k;
        p.s.rotation = p.rot; // 沿著往中心的方向拉長成光線
        p.s.scale.set((p.size / 32) * (3.5 - 2 * k), (p.size / 32) * 0.6);
        return true;
      }
      const drag = Math.exp(-p.drag * step);
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.s.position.set(p.x, p.y);
      if (p.smoke) {
        p.s.scale.set((p.size / 32) * (1 + (p.grow - 1) * easeOut(k)));
        p.s.alpha = p.alpha * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.5);
      } else if (p.stretch) { // 火星：沿速度方向拉長，微微閃爍
        const v = Math.hypot(p.vx, p.vy);
        p.s.rotation = Math.atan2(p.vy, p.vx);
        p.s.scale.set((p.size / 32) * (1 + v / (p.size * 6)), p.size / 32);
        p.s.alpha = (1 - k) * (Math.random() < 0.15 ? 0.5 : 1);
      } else {
        p.s.scale.set((p.size / 32) * (1 - 0.5 * k));
        p.s.alpha = 1 - k;
      }
      return true;
    });

    // 泛光只在有特效時開（省效能）
    this.glow.filters = this.active ? [this.bloom] : null;

    // 全畫面閃白
    this.flashG.clear();
    const fl = this.flashLeft();
    if (fl > 0.01) this.flashG.rect(0, 0, screenW, screenH).fill({ color: 0xffffff, alpha: fl });

    // world 濾鏡：色差＋衝擊波扭曲相機畫面
    const filters = [];
    const sp = this.split;
    const sa = sp.t >= 0 && this.real >= sp.t ? sp.amp * clamp01(1 - (this.real - sp.t) / sp.dur) : 0;
    if (sa > 0.3) {
      this.rgb.red = { x: -sa, y: 0 };
      this.rgb.blue = { x: sa, y: sa * 0.3 };
      filters.push(this.rgb);
    }
    const w = this.wave;
    if (w.o && this.real >= w.t && this.real - w.t < w.dur) {
      // 濾鏡的座標原點是相機畫面在螢幕上的左上角（鏡像時左右對調）
      const c = this.world.toGlobal(w.o);
      const p0 = this.world.toGlobal({ x: 0, y: 0 }), p1 = this.world.toGlobal({ x: this.vw, y: this.vh });
      this.shockwave.center = { x: c.x - Math.min(p0.x, p1.x), y: c.y - Math.min(p0.y, p1.y) };
      this.shockwave.time = this.real - w.t;
      const sc = Math.abs(this.world.scale.y); // 參數是螢幕像素：跟著畫面縮放
      this.shockwave.amplitude = 40 * sc * (1 - (this.real - w.t) / w.dur);
      this.shockwave.wavelength = 220 * sc;
      this.shockwave.speed = 1400 * sc;
      filters.push(this.shockwave);
    }
    this.world.filters = filters.length ? filters : null;

    this.title.update(dt, screenW, screenH);
  }

  // 推掌定格結束：火星四散後往下掉，煙慢慢散開
  burst(e) {
    const { o, palm } = e;
    const base = Math.atan2(e.d.y, e.d.x);
    for (let i = 0; i < 70; i++) { // 大多往掌氣方向噴
      const a = i % 4 ? base + rand(-0.6, 0.6) : rand(0, Math.PI * 2);
      this.spark(o.x, o.y, a, rand(5, 22) * palm, rand(0.6, 1.6), PAL.strike.spark[i % 3], rand(0.1, 0.22) * palm, 5 * palm);
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0.3, 1.5) * palm;
      this.puff(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r, palm * 1.3, i % 2 ? 0xd8c8b0 : 0x9a8a7a, 0.4, rand(1.4, 2.2));
    }
  }

  // 掌印打到終點：小爆光＋火星＋煙
  impact(e) {
    const { o, palm, d } = e;
    this.effects.push({ type: 'ring', t0: this.clock, o, palm });
    this.wave = { t: this.real, dur: 0.7, o }; // 相機畫面從命中點扭曲
    this.doFlash(0.6, 0.12);
    this.doSplit(12, 0.25);
    const back = Math.atan2(-d.y, -d.x);
    for (let i = 0; i < 40; i++) {
      const a = i % 2 ? back + rand(-1.2, 1.2) : rand(0, Math.PI * 2);
      this.spark(o.x, o.y, a, rand(4, 16) * palm, rand(0.5, 1.2), PAL.strike.spark[i % 3], rand(0.1, 0.2) * palm, 5 * palm);
    }
    for (let i = 0; i < 8; i++) this.puff(o.x + rand(-0.6, 0.6) * palm, o.y + rand(-0.6, 0.6) * palm, palm * 1.2, i % 2 ? 0xd8c8b0 : 0x9a8a7a, 0.4, rand(1.2, 2));
    this.kick(16, 0.32);
  }

  // 畫面震動位移（螢幕像素），main.js 加在 world 位置上
  shakeOffset() {
    const { amp, dur, t } = this.shake;
    if (!amp || this.real < t) return { x: 0, y: 0 };
    const k = 1 - (this.real - t) / dur;
    if (k <= 0) { this.shake.amp = 0; return { x: 0, y: 0 }; }
    const a = amp * k * k;
    return { x: rand(-a, a), y: rand(-a, a) };
  }
}

// 技能手形狀（相對手掌中心，單位＝手掌長），推掌時打出放大的發光掌印
function palmShape(P) {
  if (!Array.isArray(P) || P.length < 21) return null;
  const ids = [0, 5, 9, 13, 17];
  const c = { x: ids.reduce((s, i) => s + P[i].x, 0) / 5, y: ids.reduce((s, i) => s + P[i].y, 0) / 5 };
  const palm = Math.hypot(P[9].x - P[0].x, P[9].y - P[0].y) || 1;
  return P.map((p) => ({ x: (p.x - c.x) / palm, y: (p.y - c.y) / palm }));
}
const FINGERS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const PALM_POLY = [0, 1, 5, 9, 13, 17];

// 劍氣：月牙刀光（中心死白、外圍冷藍＋紫），邊緣不規則閃動，後面拖兩道殘影，沿弧線竄電光
function drawSlash(g, e, age) {
  const { o, d, palm, side } = e;
  const L = SLASH.len * palm;
  const reveal = clamp01(age / SLASH.reveal);
  const fade = clamp01(1 - Math.max(0, age - SLASH.reveal) / (SLASH.life - SLASH.reveal));
  const crescent = (rot, bulgeOut, bulgeIn, jitter) => {
    const cs = Math.cos(rot * side), sn = Math.sin(rot * side);
    const dx = d.x * cs - d.y * sn, dy = d.x * sn + d.y * cs;
    const nx = -dy * side, ny = dx * side;
    const at = (s, b) => [o.x + dx * (s * L - 0.1 * L) + nx * b, o.y + dy * (s * L - 0.1 * L) + ny * b];
    const N = 22, pts = [];
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * reveal;
      pts.push(...at(s, Math.sin(Math.PI * s) * bulgeOut * L * (1 + rand(-jitter, jitter))));
    }
    for (let i = N; i >= 0; i--) {
      const s = (i / N) * reveal;
      pts.push(...at(s, Math.sin(Math.PI * s) * bulgeIn * L));
    }
    return { pts, at };
  };
  // 老闆 11/23：劍氣要細 → 月牙厚度約刀光長的 4%（第二版約 18%）
  for (const [rot, a] of [[-0.3, 0.2], [-0.15, 0.38]]) { // 殘影
    g.poly(crescent(rot, 0.2, 0.18, 0.02).pts).fill({ color: PAL.slash.glow, alpha: a * fade });
  }
  const main = crescent(0, 0.215, 0.175, 0.04);
  g.poly(main.pts).fill({ color: PAL.slash.accent, alpha: 0.5 * fade });
  g.poly(crescent(0, 0.205, 0.185, 0.02).pts).fill({ color: PAL.slash.glow, alpha: 0.9 * fade });
  g.poly(crescent(0, 0.199, 0.191, 0).pts).fill({ color: PAL.slash.core, alpha: fade });
  for (let k = 0; k < 3; k++) { // 電光：沿弧線的鋸齒線
    const b0 = rand(0.17, 0.23);
    for (let i = 0; i <= 14; i++) {
      const s = (i / 14) * reveal;
      const [x, y] = main.at(s, Math.sin(Math.PI * s) * b0 * L + rand(-0.12, 0.12) * palm);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke({ width: 0.035 * palm, color: k ? PAL.slash.glow : PAL.slash.core, alpha: 0.8 * fade });
  }
  g.circle(o.x, o.y, palm * (0.3 - 0.15 * fade)).fill({ color: PAL.slash.core, alpha: 0.6 * fade }); // 起手爆光
}

// 掌氣：中心爆白光＋放大的發光掌印往外推＋兩圈氣浪
function drawStrike(g, e, age) {
  if (age <= 0) return; // 定格聚氣中：還沒爆
  const { o, palm, shape, d } = e;
  const fk = clamp01(1 - age / 0.15);
  if (fk > 0) { // 出手爆光（小）
    g.circle(o.x, o.y, palm * (0.9 + 0.8 * (1 - fk))).fill({ color: PAL.strike.glow, alpha: 0.5 * fk });
    g.circle(o.x, o.y, palm * (0.5 + 0.4 * (1 - fk))).fill({ color: PAL.strike.core, alpha: fk });
  }
  if (age >= STRIKE.palmLife) return;
  // 側面看的掌印：大小不變，往戲偶面向平飛（u＝飛行方向、v＝往上的垂直方向）
  const u = d, v0 = { x: -d.y, y: d.x }, v = v0.y > 0 ? { x: -v0.x, y: -v0.y } : v0;
  const fly = (tt) => easeOut(clamp01(tt / STRIKE.travel)) * STRIKE.dist * palm;
  const sc = 1.5 * palm;
  let toSide = null;
  if (shape) { // 手的上方（腕→中指根）對到 v；手的寬度方向壓扁成側面（看起來是掌緣朝鏡頭、掌心朝前）
    const up = { x: shape[9].x - shape[0].x, y: shape[9].y - shape[0].y };
    const ul = Math.hypot(up.x, up.y) || 1, a = { x: up.x / ul, y: up.y / ul }, b = { x: -a.y, y: a.x };
    toSide = (p) => { const pa = p.x * a.x + p.y * a.y, pb = p.x * b.x + p.y * b.y; return { x: u.x * pb * 0.35 + v.x * pa, y: u.y * pb * 0.35 + v.y * pa }; };
  }
  const k = age / STRIKE.palmLife;
  const fade = 1 - k * k;
  const head = fly(age);
  const c = { x: o.x + u.x * head, y: o.y + u.y * head };
  // 速度線：從出手點拉到掌印後方
  for (let i = -3; i <= 3; i++) {
    const off = i * 0.28 * palm, tail = Math.max(0, head - (2 + Math.abs(i) * 0.8) * palm);
    const p0 = { x: o.x + u.x * tail + v.x * off, y: o.y + u.y * tail + v.y * off };
    const p1 = { x: c.x - u.x * 0.6 * palm + v.x * off, y: c.y - u.y * 0.6 * palm + v.y * off };
    g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: (i === 0 ? 0.18 : 0.08) * palm, color: i === 0 ? PAL.strike.core : PAL.strike.glow, alpha: 0.8 * fade });
  }
  // 前方的氣壓弧「)))」
  for (let j = 0; j < 3; j++) {
    const ahead = (0.6 + j * 0.45) * palm, r = (1.4 + j * 0.25) * palm;
    const cc = { x: c.x + u.x * (ahead - r), y: c.y + u.y * (ahead - r) };
    const base = Math.atan2(u.y, u.x);
    for (let i = 0; i <= 12; i++) {
      const ang = base + (i / 12 - 0.5) * 1.3;
      const x = cc.x + Math.cos(ang) * r, y = cc.y + Math.sin(ang) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke({ width: (0.14 - j * 0.03) * palm, color: j ? PAL.strike.accent : PAL.strike.glow, alpha: (0.85 - j * 0.25) * fade });
  }
  // 掌印本體（殘影＋本體）
  if (toSide) {
    for (const [lag, ghost] of [[0.05, 0.25], [0.025, 0.45], [0, 1]]) {
      const hh = fly(Math.max(0, age - lag));
      const cg = { x: o.x + u.x * hh, y: o.y + u.y * hh };
      const pt = (i) => { const q = toSide(shape[i]); return [cg.x + q.x * sc, cg.y + q.y * sc]; };
      const layers = ghost < 1 ? [[0.3, PAL.strike.glow, 0.7]] : [[0.5, PAL.strike.accent, 0.5], [0.3, PAL.strike.glow, 0.85], [0.14, PAL.strike.core, 1]];
      for (const [w, color, alpha] of layers) {
        g.poly(PALM_POLY.flatMap(pt)).fill({ color, alpha: alpha * fade * ghost * 0.6 });
        for (const f of FINGERS) {
          g.moveTo(...pt(f[0]));
          for (const i of f.slice(1)) g.lineTo(...pt(i));
          g.stroke({ width: w * sc * 0.35, color, alpha: alpha * fade * ghost, cap: 'round', join: 'round' });
        }
      }
    }
  } else {
    g.circle(c.x, c.y, 0.7 * palm).fill({ color: PAL.strike.core, alpha: fade });
  }
}

// 掌印打到終點的爆光圈
function drawRing(g, e, age) {
  const { o, palm } = e;
  const k = age / 0.4;
  g.circle(o.x, o.y, palm * (0.8 + 0.8 * (1 - k))).fill({ color: PAL.strike.core, alpha: 0.7 * (1 - k) * (1 - k) });
  g.circle(o.x, o.y, palm * (0.5 + 4 * easeOut(k))).stroke({ width: palm * 0.35 * (1 - k) + 1, color: PAL.strike.glow, alpha: 0.9 * (1 - k) });
}

// 招式名：直排楷書大字，先「砸」進來（放大縮回＋墨色筆刷底由上往下刷出），停一下再往上散掉
export class MoveTitle {
  constructor() {
    this.view = new Container();
    this.brush = new Graphics();
    this.text = new Text({
      text: '',
      style: {
        fontFamily: ['Kaiti TC', 'Kai', 'STKaiti', 'BiauKai', 'DFKai-SB', 'Songti TC', 'serif'],
        fontSize: 120, fontWeight: '900', fill: 0xfff4d6, lineHeight: 128, align: 'center',
        stroke: { color: 0x6a0f0f, width: 10, join: 'round' },
      },
    });
    this.text.anchor.set(0.5);
    this.view.addChild(this.brush, this.text);
    this.view.alpha = 0;
    this.age = Infinity;
  }

  show(name, pal) {
    this.text.text = [...name].join('\n'); // 直排
    this.age = 0;
    const h = this.text.height + 60, w = 170; // 筆刷底：粗糙邊緣的直條，每次形狀都不一樣
    const b = this.brush;
    b.clear();
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push(-w / 2 + rand(-14, 10), -h / 2 + (h * i) / 12);
    for (let i = 12; i >= 0; i--) pts.push(w / 2 + rand(-10, 14), -h / 2 + (h * i) / 12 + rand(-6, 6));
    b.poly(pts).fill({ color: 0x140806, alpha: 0.82 });
    b.rect(-w / 2 - 6, -h / 2, 10, h).fill({ color: pal.glow, alpha: 0.9 }); // 一道色邊
    for (let i = 0; i < 6; i++) b.circle(rand(-0.75, 0.75) * w, rand(-h / 2, h / 2), rand(2, 6)).fill({ color: 0x140806, alpha: 0.7 }); // 墨點（貼著筆刷邊）
  }

  update(dt, screenW, screenH) {
    this.age += dt;
    const age = this.age;
    if (age > 1.4) { this.view.alpha = 0; return; }
    const s = Math.min(screenW, screenH) / 900;
    let pop = 1, alpha = 1, rise = 0;
    if (age < 0.09) { pop = 2.6 - 1.6 * (age / 0.09); alpha = age / 0.09; }
    else if (age > 1.05) { const k = (age - 1.05) / 0.35; alpha = 1 - k; rise = 30 * k; pop = 1 + 0.08 * k; }
    this.brush.scale.y = clamp01(age / 0.12);
    this.view.position.set(screenW * 0.86, screenH * 0.46 - rise);
    this.view.scale.set(s * pop);
    this.view.alpha = alpha;
  }
}
