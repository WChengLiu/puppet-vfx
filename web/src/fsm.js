// 招式狀態機（M1.2，2026-11-23 老闆改設計）：一手擺戲偶（角色），另一手比技能。
// 必須有戲偶才能出招；特效從戲偶身上發出。聚氣先拿掉。
// 所有門檻都是暫定值，老闆實機試揮後才定案（可用測試頁的調整面板即時改）。
import { FacingTracker } from './facing.js';

export const DEFAULTS = {
  extendRatio: 1.15, // 手指伸直判定：指尖到腕 > 第二關節到腕 × 這個倍數
  swordGap: 0.45, // 劍指：食指與中指指尖距離 < 手掌長 × 這個值
  puppetSplitDeg: 15, // 戲偶手：食指與中指分開角度 ≥ 這個值（老闆實測約 24°）
  puppetThumbDeg: 12, // 戲偶手：食指與拇指分開角度 ≥ 這個值（老闆實測約 24°）
  puppetGrace: 0.3, // 戲偶手短暫偵測不到，幾秒內仍算戲偶在（抗抖）
  facingHold: 0.25, // 戲偶面向突然反過來，要連續這麼久才算真的翻面（擋單幀左右手認反，src/facing.js）
  puppetLock: true, // 鎖定戲偶（老闆 11/23）：認到一次後，這隻手還在畫面就一直是戲偶（翻手時模型認不出姿勢）
  lockJump: 2, // 鎖定時用位置追同一隻手：一幀最多移動幾個手掌長（左右手標籤翻手時會跳）
  poseWindow: 0.25, // 手勢穩定度：看最近幾秒（老闆 11/23 紀錄重播：0.25～0.3 誤判 0）
  pushGrowth: 1.8, // 推掌（往鏡頭）：手掌變大速度（對數/秒）≥ 這個值
  pushMaxSide: 2.5, // 推掌：揮動量 twist（扣掉平移與放大後的指尖速度）≤ 這個值（老闆實測真推掌 ≤ 1.3）
  pushMaxMove: 8, // 推掌：手掌中心平移速度（手掌長/秒）≤ 這個值（老闆實測真推掌 ≤ 4）
  strikePoseRatio: 0.8, // 推掌：最近 poseWindow 秒內張掌的比例 ≥ 這個值
  strikeCooldown: 0.8,
  slashSpeed: 12, // 劍指斬：指尖速度（手掌長/秒）≥ 這個值
  slashPoseRatio: 0.25, // 劍指斬：最近 poseWindow 秒內劍指的比例 ≥ 這個值（揮手時一閃而過的劍指不算）
  slashSticky: true, // 劍指斬：劈下去那一刻手指轉向鏡頭（認不出劍指）也算，只要最近有穩定劍指（直劈用）
  pointToward: 0.6, // 指向鏡頭的程度（0~1）≥ 這個值才算「劍指指向鏡頭」
  slashCooldown: 0.5,
  // 直劈「跟丟」判定（老闆 11/23 引導錄製：往下劈太快畫面糊掉，手部模型整個跟丟 0.1～0.3 秒）
  chopAimRatio: 0.5, // 跟丟前 poseWindow 秒內劍指（含指向鏡頭）比例 ≥ 這個值
  chopSpeed: 3, // 跟丟前指尖往下速度（手掌長/秒）≥ 這個值
  chopReturn: 0.8, // 手往下劈到跟丟後，幾秒內「往上」的劍指斬不算（劈完把手舉回來）
};

// 離位置 p 最近、且在 maxPalm 個手掌長內的手
function nearest(hands, p, maxPalm) {
  let bd = Infinity, best = null;
  for (const h of hands) {
    const d = Math.hypot(h.f.center.x - p.x, h.f.center.y - p.y) / h.f.palm;
    if (d < bd) { bd = d; best = h; }
  }
  return bd <= maxPalm ? best : null;
}

// 掌氣方向＝戲偶面向（掌心那面）投影到畫面上（老闆 11/23：不是往螢幕打）。
// 戲偶正對鏡頭、看不出左右時，往「遠離技能手」的那一側打。
function facingDir(puppet, skill) {
  const f = puppet.f.facing ?? { x: 0, y: 0, z: -1 };
  const m = Math.hypot(f.x, f.y);
  if (m >= 0.15) return { x: f.x / m, y: f.y / m };
  return { x: puppet.f.center.x >= skill.f.center.x ? 1 : -1, y: 0 };
}

export const STATE = { NO_PUPPET: 'NO_PUPPET', READY: 'READY' };

export class GestureFSM {
  constructor(cfg = DEFAULTS) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.puppetKey = null; // 目前當戲偶的是哪隻手
    this.puppetSeen = -Infinity;
    this.puppetPos = null; // 鎖定中的戲偶手位置
    this.facing = new FacingTracker();
    this.lastStrike = -Infinity;
    this.lastSlash = -Infinity;
    this.poseHist = new Map(); // key -> [{t, sword, aim, open}]
    this.lastSkill = null; // 上一幀技能手的狀態（直劈跟丟時用）
    this.lastChop = -Infinity;
  }

  // 最近 poseWindow 秒內，某手勢出現的比例
  poseRatio(key, t, field) {
    const h = this.poseHist.get(key) ?? [];
    return h.length ? h.filter((p) => p[field]).length / h.length : 0;
  }

  // t：秒；hands：[{ key, f: handFeatures, m: MotionTracker 結果 }]
  update(t, hands) {
    const c = this.cfg;
    const events = [];

    for (const { key, f } of hands) {
      let h = this.poseHist.get(key);
      if (!h) this.poseHist.set(key, (h = []));
      h.push({ t, sword: f.sword, aim: f.sword || f.pointing, open: f.open });
      while (h.length && t - h[0].t > c.poseWindow) h.shift();
    }
    for (const k of [...this.poseHist.keys()]) if (!hands.some((h) => h.key === k)) this.poseHist.delete(k);

    // ── 決定哪隻手是戲偶：正在比戲偶姿勢的手；短暫認不到時沿用原本那隻（抗抖）──
    const posing = hands.filter((h) => h.f.puppet);
    let puppet = null;
    if (c.puppetLock && this.puppetPos) {
      // 鎖定中：找離上次戲偶位置最近的手（不看姿勢、不看左右手標籤，翻手時標籤會跳）；
      // 比較接近「上次技能手位置」的手不算（戲偶手剛好沒偵測到時，技能手經過不會搶走戲偶）
      let bd = Infinity;
      const dist = (h, p) => Math.hypot(h.f.center.x - p.x, h.f.center.y - p.y) / h.f.palm;
      const skillTrack = this.skillPos ? nearest(hands, this.skillPos, c.lockJump) : null;
      for (const h of hands) {
        const d = dist(h, this.puppetPos);
        if (this.skillPos && !h.f.puppet && (dist(h, this.skillPos) < d || (this.puppetMissing && h === skillTrack))) continue;
        if (d < bd) { bd = d; puppet = h; }
      }
      if (bd > c.lockJump) puppet = null;
    }
    if (!puppet) puppet = posing.find((h) => h.key === this.puppetKey) ?? posing[0] ?? null;
    if (!puppet && !c.puppetLock && t - this.puppetSeen <= c.puppetGrace) {
      puppet = hands.find((h) => h.key === this.puppetKey) ?? null; // 不鎖定：姿勢短暫沒認到仍算
    }
    if (puppet) {
      if (c.puppetLock || puppet.f.puppet) this.puppetSeen = t;
      this.puppetKey = puppet.key;
      this.puppetPos = { ...puppet.f.center };
      this.facing.hold = c.facingHold;
      if (puppet.f.facing) puppet.f = { ...puppet.f, facing: this.facing.update(t, puppet.f.facing) }; // 面向要時間連續
    } else if (t - this.puppetSeen > c.puppetGrace) {
      this.puppetKey = null;
      this.puppetPos = null;
      this.facing.reset();
      this.skillPos = null;
    }
    const skill = puppet ? hands.find((h) => h.key !== puppet.key) ?? null : null;
    if (puppet) this.skillPos = skill ? { ...skill.f.center } : null;
    else if (this.skillPos) { // 戲偶短暫不見：繼續追技能手的位置，這隻手移到戲偶原位也不會變成戲偶
      const best = nearest(hands, this.skillPos, c.lockJump);
      if (best) this.skillPos = { ...best.f.center };
    }
    this.puppetMissing = !puppet;
    const state = puppet ? STATE.READY : STATE.NO_PUPPET;

    // ── 直劈（跟丟版）：上一幀技能手還在、穩定劍指、正往下動，這一幀突然不見 → 算一次往下的劍指斬 ──
    const ls = this.lastSkill;
    const lost = puppet && ls && !hands.some((h) => h.key === ls.key) && t - ls.t < 0.1;
    if (lost && ls.tvy >= c.chopSpeed / 2) this.lastChop = t; // 往下跟丟（就算沒算成直劈），之後舉手回來也不算
    if (lost && t - this.lastSlash >= c.slashCooldown && ls.aim >= c.chopAimRatio && ls.tvy >= c.chopSpeed) {
      const a = puppet.f.anchors;
      const dT = Math.hypot(a.armThumb.x - ls.center.x, a.armThumb.y - ls.center.y);
      const dO = Math.hypot(a.armOther.x - ls.center.x, a.armOther.y - ls.center.y);
      events.push({ type: 'slash', hand: ls.key, t, origin: dT < dO ? a.armThumb : a.armOther, palm: puppet.f.palm,
        dir: { x: ls.tvx, y: ls.tvy }, chop: true });
      this.lastSlash = t;
      this.lastChop = t;
    }

    if (puppet && skill) {
      const a = puppet.f.anchors;
      // ── 推掌：技能手張掌往鏡頭推 → 從戲偶身體發出 ──
      if (t - this.lastStrike >= c.strikeCooldown && skill.f.open && skill.m.growth >= c.pushGrowth
        && skill.m.twist <= c.pushMaxSide && skill.m.speed <= c.pushMaxMove && this.poseRatio(skill.key, t, 'open') >= c.strikePoseRatio) {
        events.push({ type: 'strike', hand: skill.key, t, origin: a.body, palm: puppet.f.palm, dir: facingDir(puppet, skill) });
        this.lastStrike = t;
      }
      // ── 劍指斬：技能手劍指快速劃過 → 從戲偶靠技能手那側的手臂發出，方向跟著劃的方向 ──
      // 直劈時最快那一刻手指正對鏡頭，模型認不出劍指（老闆 11/23 紀錄），所以看「最近有沒有穩定劍指」
      const swordNow = skill.f.sword || (c.slashSticky && skill.f.pointing);
      // 直劈後把手舉回來（往上為主）不算
      const returning = t - this.lastChop < c.chopReturn && skill.m.tvy < 0 && -skill.m.tvy > Math.abs(skill.m.tvx);
      if (t - this.lastSlash >= c.slashCooldown && swordNow && !returning && skill.m.tipSpeed >= c.slashSpeed
        && this.poseRatio(skill.key, t, 'sword') >= c.slashPoseRatio) {
        const s = skill.f.center;
        const dT = Math.hypot(a.armThumb.x - s.x, a.armThumb.y - s.y);
        const dO = Math.hypot(a.armOther.x - s.x, a.armOther.y - s.y);
        events.push({ type: 'slash', hand: skill.key, t, origin: dT < dO ? a.armThumb : a.armOther, palm: puppet.f.palm,
          dir: { x: skill.m.tvx, y: skill.m.tvy } });
        this.lastSlash = t;
      }
    }
    this.lastSkill = puppet && skill ? { key: skill.key, t, tvx: skill.m.tvx, tvy: skill.m.tvy, center: { ...skill.f.center },
      aim: this.poseRatio(skill.key, t, 'aim') } : null;
    return { state, puppetKey: this.puppetKey, skillKey: skill?.key ?? null, events };
  }
}
