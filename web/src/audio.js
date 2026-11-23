// M1.3 音效：用 Web Audio 即時合成（不需要音效檔，之後可換成真錄音）。
// 所有聲音都經過 master，master 同時接喇叭和錄影用的音軌。

export class Sfx {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor(); // 疊很多聲音時不要爆音
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    this.recordDest = this.ctx.createMediaStreamDestination();
    comp.connect(this.recordDest);
    this.noise = makeNoise(this.ctx, 1);
  }

  // 一定要在使用者點擊時呼叫一次（瀏覽器規定）
  unlock() {
    if (this.ctx.state !== 'running') return this.ctx.resume();
  }

  get stream() { return this.recordDest.stream; }

  play(type) {
    // iOS 切到背景再回來會變成 interrupted／suspended：順手喚醒，這一聲先跳過
    if (this.ctx.state !== 'running') { this.ctx.resume().catch(() => {}); return; }
    if (type === 'slash') this.slash();
    else this.strike();
  }

  // 劍氣破空：雜訊經帶通濾波器由高往低掃（咻），加一聲金屬高音（鏘）
  slash() {
    const { ctx } = this, t = ctx.currentTime;
    const src = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(7000, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.28);
    const g = env(ctx, t, 0.01, 0.3, 0.9);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.35);

    for (const [f, v] of [[2350, 0.18], [3520, 0.08]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const og = env(ctx, t + 0.02, 0.003, 0.45, v);
      o.connect(og).connect(this.master);
      o.start(t + 0.02); o.stop(t + 0.5);
    }
  }

  // 掌風氣爆：低頻下墜（轟）＋低通雜訊（爆）
  strike() {
    const { ctx } = this, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    const og = env(ctx, t, 0.005, 0.5, 1);
    const shaper = ctx.createWaveShaper(); // 加一點破音讓它更厚
    shaper.curve = softClip(2.5);
    o.connect(shaper).connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.55);

    const src = this.noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2500, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.35);
    const ng = env(ctx, t, 0.003, 0.4, 0.8);
    src.connect(lp).connect(ng).connect(this.master);
    src.start(t); src.stop(t + 0.45);
  }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    return s;
  }
}

// 快速起音、指數衰減的音量包絡
function env(ctx, t, attack, decay, peak) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function makeNoise(ctx, sec) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function softClip(k) {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
