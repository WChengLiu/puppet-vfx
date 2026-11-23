// One Euro Filter（Casiez 等人 2012）：慢的時候強力去抖，快的時候減少延遲。
// 自己實作（約 30 行），不用 LGPL 的現成套件（docs/RESOURCES.md）。
// 只用在「畫」虛擬偶（判斷招式仍用原始關鍵點，門檻是用原始資料調的）。

const alpha = (cutoff, dt) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  // minCutoff：靜止時的截止頻率（Hz，越小越穩）；beta：速度越快、截止頻率加多少（越大越跟手）
  constructor({ minCutoff = 1.2, beta = 0.02, dCutoff = 1 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() { this.x = null; this.dx = 0; this.t = null; }

  // t：秒
  filter(x, t) {
    if (this.x === null) { this.x = x; this.t = t; return x; }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const dxRaw = (x - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (x - this.x);
    return this.x;
  }
}

// 21 個關鍵點（x、y）一起濾
export class LandmarkFilter {
  constructor(opts) {
    this.opts = opts;
    this.fs = null;
  }

  reset() { this.fs = null; }

  filter(P, t) {
    if (!this.fs) this.fs = P.map(() => [new OneEuro(this.opts), new OneEuro(this.opts)]);
    return P.map((p, i) => ({ x: this.fs[i][0].filter(p.x, t), y: this.fs[i][1].filter(p.y, t) }));
  }
}
