// M1.3 錄影：錄 PixiJS 畫布（相機畫面＋特效＋招式名稱）＋音效，停止後可下載。
// 介面（HUD、按鈕、標籤列）是網頁元素，不會錄進去。

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Safari、新版 Chrome：直接 mp4，手機相簿最好用
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export class CanvasRecorder {
  constructor(canvas, audioStream, fps = 30) {
    this.canvas = canvas;
    this.audioStream = audioStream;
    this.fps = fps;
    this.mime = pickMime();
    this.mimeList = typeof MediaRecorder === 'undefined' ? [] : MIME_CANDIDATES.filter((m) => MediaRecorder.isTypeSupported(m));
    this.rec = null;
    this.t0 = 0;
  }

  get supported() { return this.mime !== null && typeof this.canvas.captureStream === 'function'; }
  get recording() { return this.rec?.state === 'recording'; }
  get elapsed() { return this.recording ? (performance.now() - this.t0) / 1000 : 0; }

  start() {
    const stream = this.canvas.captureStream(this.fps);
    for (const tr of this.audioStream?.getAudioTracks() ?? []) stream.addTrack(tr);
    const stopVideo = () => { for (const tr of stream.getVideoTracks()) tr.stop(); }; // 只停畫布的軌，音軌留著下次用
    const chunks = [];
    // 有些 Chrome 說支援 mp4＋AAC，實際一開就失敗 → 依序退回下一種格式
    let lastErr = null;
    this.rec = null;
    for (const mime of [...this.mimeList, '']) {
      const opts = { videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 };
      if (mime) opts.mimeType = mime;
      try {
        const r = new MediaRecorder(stream, opts);
        r.start(1000); // 每秒切一塊，長錄影不會一次吃太多記憶體
        this.rec = r;
        this.mime = mime;
        break;
      } catch (err) { lastErr = err; }
    }
    if (!this.rec) { stopVideo(); throw lastErr ?? new Error('MediaRecorder 無法啟動'); }
    this.rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    this.done = new Promise((resolve, reject) => {
      this.rec.onstop = () => {
        stopVideo();
        const type = this.rec.mimeType || this.mime || 'video/webm';
        resolve({ blob: new Blob(chunks, { type }), type, sec: (performance.now() - this.t0) / 1000 });
      };
      this.rec.onerror = (e) => { stopVideo(); reject(e.error || e); };
    });
    this.t0 = performance.now();
  }

  stop() {
    if (!this.recording) return Promise.resolve(null);
    this.rec.stop();
    return this.done;
  }
}

export function fileName(type) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const ext = type.includes('mp4') ? 'mp4' : 'webm';
  return `puppet-vfx-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}
