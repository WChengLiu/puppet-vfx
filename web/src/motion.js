// 每隻手的速度估計：拿「現在」和「約 windowMs 以前」的樣本相減，比逐幀相減穩。
// 速度單位＝手掌長／秒；growth＝手掌大小的對數變化率（/秒），> 0 代表手往鏡頭靠近。

export class MotionTracker {
  constructor(windowMs = 80, maxAgeMs = 400) {
    this.windowMs = windowMs;
    this.maxAgeMs = maxAgeMs;
    this.hist = new Map(); // key -> [{t, center, tip, palm}]
  }

  update(key, tMs, f) {
    let h = this.hist.get(key);
    if (!h) this.hist.set(key, (h = []));
    const last = h[h.length - 1];
    const palm = last ? last.palm + 0.5 * (f.palm - last.palm) : f.palm; // 手掌大小先輕度平滑
    h.push({ t: tMs, center: f.center, tip: f.tip, palm });
    while (h.length && tMs - h[0].t > this.maxAgeMs) h.shift();

    // 找最接近 windowMs 以前的樣本
    let ref = null;
    for (let i = h.length - 2; i >= 0; i--) {
      ref = h[i];
      if (tMs - h[i].t >= this.windowMs) break;
    }
    if (!ref) return { speed: 0, tipSpeed: 0, growth: 0, vx: 0, vy: 0, tvx: 0, tvy: 0, twist: 0 };
    const dt = (tMs - ref.t) / 1000;
    const unit = palm || 1;
    const vx = (f.center.x - ref.center.x) / unit / dt;
    const vy = (f.center.y - ref.center.y) / unit / dt;
    const tvx = (f.tip.x - ref.tip.x) / unit / dt;
    const tvy = (f.tip.y - ref.tip.y) / unit / dt;
    const growth = Math.log(palm / ref.palm) / dt;
    // twist：指尖相對手掌中心的移動，扣掉「手放大」造成的部分 → 剩下的是揮動／轉腕。
    // 手整體平移或往鏡頭推（放大）時接近 0；揮手、甩手時很大。
    const rx = (f.tip.x - f.center.x) / unit, ry = (f.tip.y - f.center.y) / unit;
    const twist = Math.hypot(tvx - vx - growth * rx, tvy - vy - growth * ry);
    return {
      vx, vy, tvx, tvy, twist, growth,
      speed: Math.hypot(vx, vy),
      tipSpeed: Math.hypot(tvx, tvy),
    };
  }

  retain(keys) {
    for (const k of [...this.hist.keys()]) if (!keys.has(k)) this.hist.delete(k);
  }
}
