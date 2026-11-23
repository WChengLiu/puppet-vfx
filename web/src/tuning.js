// 門檻調整面板：滑桿即時改 cfg，存在這台瀏覽器（localStorage），可一鍵複製目前數值回報。
import { DEFAULTS } from './fsm.js';

const KEY = 'puppet-vfx.cfg.v7'; // v7：加戲偶鎖定
const SPEC = { // [最小, 最大, 間隔, 中文名]
  extendRatio: [1, 1.6, 0.01, '手指伸直倍數'],
  swordGap: [0.1, 1, 0.01, '劍指兩指距離'],
  puppetSplitDeg: [0, 90, 1, '戲偶食中分開°'],
  puppetThumbDeg: [0, 120, 1, '戲偶拇指分開°'],
  puppetGrace: [0, 1, 0.05, '戲偶抗抖秒'],
  lockJump: [0.5, 5, 0.1, '鎖定戲偶追蹤距離'],
  facingHold: [0, 1, 0.05, '翻面確認秒數'],
  poseWindow: [0.05, 0.6, 0.05, '手勢穩定秒'],
  pushGrowth: [0.3, 6, 0.1, '推掌變大速度'],
  pushMaxSide: [0.5, 10, 0.1, '推掌揮動上限'],
  pushMaxMove: [1, 20, 0.5, '推掌平移上限'],
  strikePoseRatio: [0, 1, 0.05, '推掌張掌穩定'],
  strikeCooldown: [0, 2, 0.05, '推掌冷卻秒'],
  slashSpeed: [2, 40, 0.5, '劍指斬速度'],
  slashPoseRatio: [0, 1, 0.05, '劍指穩定比例'],
  pointToward: [0, 1, 0.05, '直劈指向鏡頭'],
  slashCooldown: [0, 2, 0.05, '劍指斬冷卻秒'],
  chopAimRatio: [0, 1, 0.05, '直劈跟丟前劍指比例'],
  chopSpeed: [0, 15, 0.5, '直劈跟丟前往下速度'],
  chopReturn: [0, 2, 0.05, '直劈後舉手不算秒'],
};

export function loadConfig() {
  const cfg = { ...DEFAULTS };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === 'number') cfg[k] = saved[k];
  } catch { /* 無痕或封鎖儲存：用預設值 */ }
  return cfg;
}

function save(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* 忽略 */ }
}

export function mountTuningPanel(root, cfg, onChange = () => {}) {
  const list = root.querySelector('#tune-list');
  const syncs = Object.entries(SPEC).map(([k, [min, max, step, label]]) => {
    const row = document.createElement('label');
    row.className = 'tune-row';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const input = row.querySelector('input'), out = row.querySelector('output');
    const sync = () => {
      input.value = cfg[k];
      out.textContent = (+cfg[k]).toFixed(2);
      out.classList.toggle('changed', cfg[k] !== DEFAULTS[k]);
    };
    input.addEventListener('input', () => { cfg[k] = +input.value; sync(); save(cfg); });
    input.addEventListener('change', () => onChange(cfg));
    sync();
    list.appendChild(row);
    return sync;
  });
  root.querySelector('#tune-reset').addEventListener('click', () => {
    Object.assign(cfg, DEFAULTS); save(cfg); syncs.forEach((s) => s()); onChange(cfg);
  });
  const copyBtn = root.querySelector('#tune-copy');
  copyBtn.addEventListener('click', async () => {
    const text = JSON.stringify(cfg);
    try { await navigator.clipboard.writeText(text); copyBtn.textContent = '已複製'; }
    catch { root.querySelector('#tune-dump').textContent = text; copyBtn.textContent = '請手動複製下方'; }
    setTimeout(() => (copyBtn.textContent = '複製數值'), 1500);
  });
  root.querySelector('#tune-toggle').addEventListener('click', () => root.classList.toggle('collapsed'));
}
