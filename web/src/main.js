import { Application, Container, Sprite, Texture, VideoSource } from 'pixi.js';
import { openCamera } from './camera.js';
import { createHandTracker } from './handTracker.js';
import { handFeatures, toPixels } from './features.js';
import { MotionTracker } from './motion.js';
import { GestureFSM } from './fsm.js';
import { loadConfig, mountTuningPanel } from './tuning.js';
import { SkeletonLayer } from './skeleton.js';
import { PuppetSkin, OUTFITS } from './puppetSkin.js';
import { SessionLog, LABELS } from './sessionLog.js';
import { mountGuide } from './guide.js';
import { VfxDirector } from './vfx.js';
import { Sfx } from './audio.js';
import { CanvasRecorder, fileName } from './recorder.js';

// 網址參數：?cam=environment 用後鏡頭
const params = new URLSearchParams(location.search);
const facing = params.get('cam') === 'environment' ? 'environment' : 'user';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const startBtn = $('start-btn');

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  // 音效要在使用者點擊的當下解鎖（瀏覽器規定），所以在任何 await 之前建立
  let sfx = null;
  try { sfx = new Sfx(); sfx.unlock(); } catch (err) { console.warn('音效無法啟用', err); }
  try {
    statusEl.textContent = '開相機中…';
    const video = await openCamera(facing);
    statusEl.textContent = '載入手部模型中…';
    const { landmarker, delegate } = await createHandTracker();
    await run(video, landmarker, delegate, sfx);
    $('start-panel').hidden = true;
    $('hud').hidden = false;
    $('tune').hidden = false;
    $('label-bar').hidden = !import.meta.env.DEV;
    $('rec-bar').hidden = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `失敗：${err.message || err}`;
    startBtn.disabled = false;
  }
});

const STATE_LABEL = { NO_PUPPET: '沒戲偶（擺出戲偶手才能出招）', READY: '戲偶就位' };
const HAND_COLOR = { Left: 0x4fc3f7, Right: 0xff7043 };

async function run(video, landmarker, delegate, sfx) {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#000000',
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  $('stage').appendChild(app.canvas);
  window.__app = app; // 方便除錯

  // world 的本地座標＝影片像素座標。相機畫面、骨架、之後的特效都放進 world，
  // 所以鏡像與縮放只做一次，錄影時也會一起錄到相機畫面。
  const world = new Container();
  app.stage.addChild(world);

  const vw = video.videoWidth, vh = video.videoHeight;
  const source = new VideoSource({ resource: video, autoPlay: false });
  const videoSprite = new Sprite(new Texture({ source }));
  videoSprite.width = vw;
  videoSprite.height = vh;
  world.addChild(videoSprite);

  const skin = new PuppetSkin(); // 虛擬布袋戲偶，蓋在戲偶手上
  world.addChild(skin.view);
  const skeleton = new SkeletonLayer();
  world.addChild(skeleton.view);
  // 特效疊在骨架上面；招式名與閃白放舞台層（不鏡像）
  const vfx = new VfxDirector({ app, world, videoSource: source, vw, vh });

  const mirror = facing === 'user'; // 前鏡頭照鏡子習慣：左右翻轉
  const base = { x: 0, y: 0 };
  const layout = () => {
    const s = Math.min(app.screen.width / vw, app.screen.height / vh); // contain：整張畫面都看得到
    world.scale.set(mirror ? -s : s, s);
    base.x = (app.screen.width - vw * s) / 2 + (mirror ? vw * s : 0);
    base.y = (app.screen.height - vh * s) / 2;
    world.position.set(base.x, base.y);
  };
  layout();
  app.renderer.on('resize', layout);

  $('delegate').textContent = delegate;
  const cfg = loadConfig();
  const log = new SessionLog(import.meta.env.DEV);
  log.meta({ video: [vw, vh], facing, delegate });
  window.__log = log; // 方便除錯與自動測試
  log.config(cfg);
  mountTuningPanel($('tune'), cfg, (c) => log.config(c));
  mountLabelBar(log);
  mountGuide(log, $('guide'), $('guide-btn'));
  mountRecBar(app, skeleton, sfx, skin);
  window.__fx = { vfx, sfx, skin }; // 方便除錯與自動測試
  const motion = new MotionTracker();
  const fsm = new GestureFSM(cfg); // cfg 是同一個物件，滑桿改了立即生效

  let lastVideoTime = -1;
  let detectCount = 0, inferSum = 0, statT0 = performance.now();
  let hands = [], out = { state: 'NO_PUPPET', puppetKey: null, skillKey: null, events: [] };

  app.ticker.add(() => {
    // 相機有新的一幀才推論（相機 30fps、螢幕可能 60/120fps）
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const t0 = performance.now();
      const result = landmarker.detectForVideo(video, t0);
      inferSum += performance.now() - t0;
      detectCount++;

      const keys = new Set();
      hands = result.landmarks.map((landmarks, i) => {
        const label = result.handedness[i]?.[0]?.categoryName ?? `H${i}`;
        const key = keys.has(label) ? `${label}${i}` : label;
        keys.add(key);
        const P = toPixels(landmarks, vw, vh);
        const f = handFeatures(P, cfg);
        return { key, lm: landmarks, P, f, m: motion.update(key, t0, f), color: HAND_COLOR[label] ?? 0xffffff };
      });
      motion.retain(keys);
      out = fsm.update(t0 / 1000, hands);
      log.frame(t0 / 1000, hands, out);
      for (const ev of out.events) {
        onEvent(ev);
        // 有虛擬偶時：偶自動做攻擊動作，劍氣從劍尖、掌氣從偶的手發出
        if (skin.view.visible && skin.geo) {
          skin.attack(ev.type, ev.dir);
          const o = ev.type === 'slash' ? skin.swordTip() : skin.palmTip();
          if (o) ev.origin = { ...o };
        }
        vfx.trigger(ev, hands.find((h) => h.key === ev.hand)?.P); // 推掌掌印用技能手的形狀
        sfx?.play(ev.type);
      }
      updateDebug(hands, out);
    }

    const puppetHand = hands.find((h) => h.key === out.puppetKey) ?? null;
    window.__puppetPose = puppetHand ? { lm: puppetHand.lm.map((p) => [p.x, p.y, p.z]), w: vw, h: vh } : null; // F 鍵抓給擺零件視窗
    if (skin.view.visible) skin.draw(puppetHand, performance.now() / 1000);
    if (skeleton.view.visible) skeleton.draw(hands, 1 / Math.abs(world.scale.y), out.puppetKey);
    vfx.update(Math.min(app.ticker.deltaMS / 1000, 0.05), app.screen.width, app.screen.height);
    const sh = vfx.shakeOffset();
    world.position.set(base.x + sh.x, base.y + sh.y);

    const now = performance.now();
    if (now - statT0 >= 1000) {
      const sec = (now - statT0) / 1000;
      setStat('fps-render', app.ticker.FPS.toFixed(0), app.ticker.FPS < 24);
      setStat('fps-detect', (detectCount / sec).toFixed(0), detectCount / sec < 24);
      setStat('infer-ms', detectCount ? (inferSum / detectCount).toFixed(1) : '–', false);
      detectCount = 0; inferSum = 0; statT0 = now;
      $('log-status').textContent = log.ok ? `紀錄中 ${(log.sent / 1024).toFixed(0)} KB` : '⚠ 紀錄沒存到！請告訴 Claude';
      $('log-status').classList.toggle('bad', !log.ok);
    }
  });
}

// ── 標籤列：告訴紀錄「我現在在做什麼」，按鈕或數字鍵 0~5；X 或「判錯了」標記剛剛判斷錯 ──
function mountLabelBar(log) {
  const bar = $('label-bar');
  const buttons = new Map();
  // 不論是按鍵還是引導錄製改標籤，按鈕高亮都跟著變
  const setLabel = log.setLabel.bind(log);
  log.setLabel = (label) => {
    setLabel(label);
    for (const [l, b] of buttons) b.classList.toggle('active', l === label);
  };
  const select = (label) => log.setLabel(label);
  for (const [key, label, name] of LABELS) {
    const b = document.createElement('button');
    b.textContent = `${key} ${name}`;
    b.addEventListener('click', () => select(label));
    bar.insertBefore(b, $('mark-btn'));
    buttons.set(label, b);
  }
  const mark = () => {
    log.mark('wrong');
    const m = $('mark-btn');
    m.classList.add('flash');
    setTimeout(() => m.classList.remove('flash'), 300);
  };
  $('mark-btn').addEventListener('click', mark);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const hit = LABELS.find(([k]) => k === e.key);
    if (hit) select(hit[1]);
    else if (e.key === 'x' || e.key === 'X') mark();
  });
  select('none');
}

// ── 錄影列：錄影／停止、下載、骨架開關、音效開關 ──
function mountRecBar(app, skeleton, sfx, skin) {
  const rec = new CanvasRecorder(app.canvas, sfx?.stream);
  const btn = $('rec-btn'), time = $('rec-time'), dl = $('rec-dl');
  if (!rec.supported) {
    btn.disabled = true;
    btn.textContent = '這個瀏覽器不能錄影';
  }
  let timer = 0, url = '';
  const toggle = async () => {
    if (!rec.supported || btn.disabled) return;
    if (!rec.recording) {
      sfx?.unlock();
      try { rec.start(); } catch (err) { console.error(err); time.textContent = `錄影失敗：${err.message || err}`; return; }
      btn.classList.add('on');
      btn.textContent = '■ 停止（R）';
      dl.hidden = true;
      timer = setInterval(() => { time.textContent = fmt(rec.elapsed); }, 250);
    } else {
      btn.disabled = true;
      clearInterval(timer);
      try {
        const out = await rec.stop();
        if (!out) throw new Error('錄影已中斷');
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(out.blob);
        dl.href = url;
        dl.download = fileName(out.type);
        dl.textContent = `⬇ 下載影片（${fmt(out.sec)}，${(out.blob.size / 1e6).toFixed(1)} MB）`;
        dl.hidden = false;
        time.textContent = '';
      } catch (err) {
        console.error(err);
        time.textContent = `錄影失敗：${err.message || err}`;
      }
      btn.classList.remove('on');
      btn.textContent = '● 錄影（R）';
      btn.disabled = false;
    }
  };
  btn.addEventListener('click', toggle);
  const skelBtn = $('skel-btn');
  const toggleSkel = () => {
    skeleton.view.visible = !skeleton.view.visible;
    skelBtn.textContent = `骨架：${skeleton.view.visible ? '開' : '關'}（S）`;
  };
  skelBtn.addEventListener('click', toggleSkel);
  const skinBtn = $('skin-btn');
  const toggleSkin = () => {
    skin.view.visible = !skin.view.visible;
    skinBtn.textContent = `戲偶：${skin.view.visible ? '開' : '關'}（P）`;
  };
  skinBtn.addEventListener('click', toggleSkin);
  const headBtn = $('head-btn');
  const nextHead = () => { headBtn.textContent = `偶頭 ${skin.nextHead() + 1}/7（H）`; };
  headBtn.textContent = `偶頭 ${skin.headIdx + 1}/7（H）`;
  headBtn.addEventListener('click', nextHead);
  const outfitBtn = $('outfit-btn');
  const showOutfit = (i) => { outfitBtn.textContent = `衣服 ${i + 1}/${OUTFITS.length} ${OUTFITS[i].name}（C）`; };
  showOutfit(skin.layout.outfit);
  const nextOutfit = () => showOutfit(skin.nextOutfit());
  outfitBtn.addEventListener('click', nextOutfit);
  // 擺零件：另開分頁；F 把目前戲偶手的姿勢存給它用
  $('edit-btn').addEventListener('click', () => window.open('editor.html', 'puppet-editor'));
  const grabPose = () => {
    const pose = window.__puppetPose;
    time.textContent = pose ? '✓ 姿勢已抓給擺零件視窗' : '沒看到戲偶手，抓不到';
    if (pose) try { localStorage.setItem('puppet-vfx.pose', JSON.stringify(pose)); } catch {}
    setTimeout(() => { if (!rec.recording) time.textContent = ''; }, 1500);
  };
  $('grab-btn').addEventListener('click', grabPose);
  const soundBtn = $('sound-btn');
  if (!sfx) { soundBtn.disabled = true; soundBtn.textContent = '音效：無法啟用'; }
  soundBtn.addEventListener('click', () => {
    if (!sfx) return;
    const on = sfx.master.gain.value > 0;
    sfx.master.gain.value = on ? 0 : 0.8;
    soundBtn.textContent = `音效：${on ? '關' : '開'}`;
    sfx.unlock();
  });
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return; // Cmd+R 重新整理不要誤觸
    if (e.key === 'r' || e.key === 'R') toggle();
    else if (e.key === 's' || e.key === 'S') toggleSkel();
    else if (e.key === 'p' || e.key === 'P') toggleSkin();
    else if (e.key === 'h' || e.key === 'H') nextHead();
    else if (e.key === 'f' || e.key === 'F') grabPose();
    else if (e.key === 'c' || e.key === 'C') nextOutfit();
  });
}

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// ── 除錯顯示 ──
const t00 = performance.now();
function onEvent(ev) {
  const name = ev.type === 'slash' ? '劍指斬！' : '推掌！';
  const li = document.createElement('li');
  li.textContent = `${((ev.t * 1000 - t00) / 1000).toFixed(1)}s ${name} (${ev.hand})`;
  const log = $('event-log');
  log.prepend(li);
  while (log.children.length > 6) log.lastChild.remove();
}

let lastDebug = 0;
function updateDebug(hands, out) {
  $('fsm-state').textContent = STATE_LABEL[out.state] ?? out.state;
  $('fsm-state').classList.toggle('bad', out.state !== 'READY');
  const now = performance.now();
  if (now - lastDebug < 100) return; // 數字每 0.1 秒更新一次，看得清楚
  lastDebug = now;
  $('hand-info').innerHTML = hands.map(({ key, f, m }) => {
    const role = key === out.puppetKey ? '🎎戲偶' : key === out.skillKey ? '✋技能' : '';
    const pose = f.puppet ? '<b class="on">戲偶手</b>' : f.sword ? '<b class="on">劍指</b>' : f.open ? '<b class="on">張掌</b>' : '其他';
    return `<div>${key} ${role}：${pose}｜食中 ${f.splitDeg.toFixed(0)}° 拇 ${f.thumbDeg.toFixed(0)}° 兩指距 ${f.tipGap.toFixed(2)}｜指尖 ${m.tipSpeed.toFixed(1)} 變大 ${m.growth.toFixed(2)}</div>`;
  }).join('') || '<div>（沒偵測到手）</div>';
}

function setStat(id, text, bad) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('bad', bad);
}
