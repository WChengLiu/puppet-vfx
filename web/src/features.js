// 從 21 個關鍵點算出單手的姿勢特徵（純函式，不碰畫面，方便測試）。
// 座標換成影片像素，長度一律用「手掌長」當單位，手離鏡頭遠近不影響門檻。

const FINGERS = [ // [指尖, 第二關節 PIP]
  [8, 6], // 食指
  [12, 10], // 中指
  [16, 14], // 無名指
  [20, 18], // 小指
];

export function toPixels(landmarks, w, h) {
  return landmarks.map((p) => ({ x: p.x * w, y: p.y * h, z: p.z * w }));
}

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const vec = (a, b) => ({ x: b.x - a.x, y: b.y - a.y });
const angleDeg = (u, v) => {
  const c = (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};
const cross = (u, v) => u.x * v.y - u.y * v.x;
const avg = (ps) => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
  z: ps.reduce((s, p) => s + (p.z ?? 0), 0) / ps.length,
});

const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
const cos3 = (u, v) => (u.x * v.x + u.y * v.y + u.z * v.z) / ((Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z)) || 1);

export function handFeatures(P, cfg) {
  const palm = d2(P[0], P[9]) || 1; // 手掌長：腕 → 中指根
  // 手指伸直：指尖離手腕比第二關節遠一定比例
  const extended = FINGERS.map(([tip, pip]) => d2(P[0], P[tip]) > d2(P[0], P[pip]) * cfg.extendRatio);
  const [idx, mid, ring, pinky] = extended;
  const open = extended.every(Boolean);
  const tipGap = d2(P[8], P[12]) / palm; // 食指與中指指尖距離
  // ── 劍指指向鏡頭：模型會把正對鏡頭的手指誤認成彎的（老闆 11/23 紀錄），
  //    改看「食中兩指指尖併攏、指向鏡頭（z 方向為主）、無名小指沒伸直」 ──
  const toward = (a, b) => { const v = { x: P[b].x - P[a].x, y: P[b].y - P[a].y, z: P[b].z - P[a].z }; return -v.z / (Math.hypot(v.x, v.y, v.z) || 1); };
  const towardCam = Math.min(toward(5, 8), toward(9, 12));
  // 劍指角度容錯：除了 2D 長度比，斜指鏡頭或微傾時改看 3D 關節伸直度（不與正對鏡頭 pointing 或握拳混淆）
  const straight3 = (m, p, t) => cos3(sub3(P[p], P[m]), sub3(P[t], P[p])) > 0.45;
  const curled3 = (m, p, t) => cos3(sub3(P[p], P[m]), sub3(P[t], P[p])) < 0.2;
  const idxMidStraight = (idx && mid) || (towardCam < cfg.pointToward && straight3(5, 6, 8) && straight3(9, 10, 12));
  const ringPinkyCurled = (!ring && !pinky) || (curled3(13, 14, 16) && curled3(17, 18, 20));
  const sword = idxMidStraight && ringPinkyCurled && tipGap < cfg.swordGap;
  const pointing = ringPinkyCurled && tipGap < cfg.swordGap && towardCam >= cfg.pointToward;

  // ── 戲偶手（老闆實際姿勢，2026-11-23 確認）：食指當頭，拇指與中指當兩臂，無名指和小指彎起來 ──
  const vIndex = vec(P[5], P[8]), vThumb = vec(P[2], P[4]), vMid = vec(P[9], P[12]);
  const splitDeg = angleDeg(vIndex, vMid); // 食指和中指分開的角度
  const thumbDeg = angleDeg(vIndex, vThumb); // 食指和拇指分開的角度
  const sidesOpposite = cross(vIndex, vThumb) * cross(vIndex, vMid) < 0; // 拇指和中指在食指兩側
  // 和劍指互斥：劍指是兩指併攏（tipGap 小），戲偶是兩指張開
  const puppet = idx && mid && !ring && !pinky && !sword && sidesOpposite
    && splitDeg >= cfg.puppetSplitDeg && thumbDeg >= cfg.puppetThumbDeg;

  const center = avg([P[0], P[5], P[9], P[13], P[17]]);
  const tip = avg([P[8], P[12]]);
  // 戲偶身上的錨點：頭、身體、兩隻手臂（M1.3 特效從這裡發出）
  const anchors = { head: P[8], body: avg([P[0], P[5], P[9]]), armThumb: P[4], armOther: P[12] };
  // 戲偶正面＝掌心那面（老闆 11/23）。手掌平面法向量，取「無名指、小指彎下去」的那一側＝掌心側
  // （老闆紀錄 3030 幀檢查：這個判斷 100% 一致，不受左右手標籤影響）
  const v1 = sub3(P[5], P[0]), v2 = sub3(P[17], P[0]);
  let n = { x: v1.y * v2.z - v1.z * v2.y, y: v1.z * v2.x - v1.x * v2.z, z: v1.x * v2.y - v1.y * v2.x };
  const curl = sub3(avg([P[16], P[20]]), center);
  if (n.x * curl.x + n.y * curl.y + n.z * curl.z < 0) n = { x: -n.x, y: -n.y, z: -n.z };
  const nl = Math.hypot(n.x, n.y, n.z) || 1;
  const facing = { x: n.x / nl, y: n.y / nl, z: n.z / nl }; // z < 0：掌心朝鏡頭
  const fist = !idx && !mid && !ring && !pinky;
  return { palm, extended, open, fist, sword, pointing, towardCam, tipGap, puppet, splitDeg, thumbDeg, center, tip, anchors, facing };
}
