import { Graphics } from 'pixi.js';
import { HAND_CONNECTIONS } from './handTracker.js';

const COLOR = { puppet: 0xffc83d, sword: 0xff4fd8, open: 0x4fe3ff };

// 在「影片像素座標」上畫手部骨架與除錯圖形。外層容器負責縮放與鏡像。
export class SkeletonLayer {
  constructor() {
    this.view = new Graphics();
  }

  // hands：[{ key, P(像素座標), f(特徵), color }]；px：一個螢幕像素等於幾個影片像素
  draw(hands, px, puppetKey) {
    const g = this.view;
    g.clear();
    for (const { key, P, f, color } of hands) {
      const isPuppet = key === puppetKey;
      const c = isPuppet ? COLOR.puppet : f.sword ? COLOR.sword : f.open ? COLOR.open : color;
      for (const { start, end } of HAND_CONNECTIONS) g.moveTo(P[start].x, P[start].y).lineTo(P[end].x, P[end].y);
      g.stroke({ width: (isPuppet ? 5 : 3) * px, color: c, alpha: 0.9 });
      for (const p of P) g.circle(p.x, p.y, 3.5 * px);
      g.fill({ color: 0xffffff });
      if (isPuppet) { // 戲偶的頭（食指尖）
        g.circle(f.anchors.head.x, f.anchors.head.y, 0.25 * f.palm).stroke({ width: 3 * px, color: COLOR.puppet });
      }
    }
  }
}
