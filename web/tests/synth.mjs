// 合成手部關鍵點（影片像素座標），給單元測試用。掌心朝鏡頭、手指朝上。
// pose: 'open' 張掌、'sword' 劍指、'fist' 握拳、'puppet' 戲偶手（老闆實際姿勢：食指頭、拇指中指兩臂、無名小指彎）、'vsign' 比 YA（拇指收起）
// 每根手指給「從正上方往小指側偏幾度」與是否伸直。
const POSES = {
  open: { thumb: [-60, true], index: [-10, true], middle: [0, true], ring: [10, true], pinky: [20, true] },
  sword: { thumb: [-30, false], index: [-3, true], middle: [3, true], ring: [5, false], pinky: [10, false] },
  fist: { thumb: [-30, false], index: [0, false], middle: [0, false], ring: [5, false], pinky: [10, false] },
  puppet: { thumb: [-25, true], index: [0, true], middle: [24, true], ring: [5, false], pinky: [10, false] }, // 角度照老闆實測
  vsign: { thumb: [70, true], // 拇指橫壓掌心、指向小指側
           index: [-12, true], middle: [12, true], ring: [5, false], pinky: [10, false] },
};
const BASES = { thumb: [1, -0.35, 0.3], index: [5, -0.3, 0.9], middle: [9, 0, 1], ring: [13, 0.2, 0.95], pinky: [17, 0.38, 0.85] };

export function synthHand({ x = 640, y = 400, size = 100, pose = 'open' } = {}) {
  const s = size;
  const P = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  for (const [finger, [ang, straight]] of Object.entries(POSES[pose])) {
    const [b, bx, by] = BASES[finger];
    const r = (ang * Math.PI) / 180;
    const dir = { x: Math.sin(r), y: -Math.cos(r) };
    const base = { x: x + bx * s, y: y - by * s, z: 0 };
    const at = (p, d, k) => ({ x: p.x + d.x * k * s, y: p.y + d.y * k * s, z: 0 });
    P[b] = base;
    if (straight) {
      for (let j = 1; j <= 3; j++) P[b + j] = at(base, dir, 0.3 * j);
    } else { // 第二關節之後折回掌心（朝手腕方向）
      const down = { x: 0, y: 1 };
      P[b + 1] = at(base, dir, 0.3);
      P[b + 2] = at(P[b + 1], down, 0.15);
      P[b + 3] = at(P[b + 2], down, 0.12);
    }
  }
  return P;
}
