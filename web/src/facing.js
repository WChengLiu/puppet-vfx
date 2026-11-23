// 戲偶手面向的時間連續性（老闆 11/23：改善翻手的判斷）
// 紀錄分析：面向 z 常常單幀從 -0.9 跳到 +0.9 再跳回來，手的寬度完全沒變（不是真的翻面），
// 多半是模型那幀把左右手認反，「掌心在哪一側」的判斷跟著反。真的翻手會經過側面、連續轉過去。
// 做法：每幀的面向跟上一幀比，反向就先不信，連續反向超過 hold 秒才接受（快速翻手最多慢 hold 秒）。

export class FacingTracker {
  constructor({ hold = 0.25 } = {}) {
    this.hold = hold;
    this.reset();
  }

  reset() { this.v = null; this.since = null; }

  // f：{x,y,z} 單位向量；t：秒
  update(t, f) {
    if (!this.v) { this.v = { ...f }; return this.v; }
    const d = f.x * this.v.x + f.y * this.v.y + f.z * this.v.z;
    if (d >= 0) { this.since = null; this.v = { ...f }; return this.v; }
    if (this.since === null) this.since = t;
    if (t - this.since >= this.hold) { this.since = null; this.v = { ...f }; return this.v; } // 一直反向：真的翻了
    this.v = { x: -f.x, y: -f.y, z: -f.z }; // 同一個手掌平面，先照舊的那一面
    return this.v;
  }
}
