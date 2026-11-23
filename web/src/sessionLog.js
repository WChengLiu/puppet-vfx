// 試揮紀錄：每一幀的關鍵點、特徵、狀態與招式都記下來，每 2 秒送到 dev server 存檔。
// 老闆不用逐條回報，Claude 直接讀 web/logs/ 分析。
// 「標籤」＝老闆正在做什麼動作（按數字鍵或點按鈕切換），分析時才知道哪段是想做哪一招。

export const LABELS = [
  ['0', 'none', '自由揮'],
  ['1', 'puppet', '只擺戲偶'],
  ['2', 'strike', '推掌'],
  ['3', 'slash', '劍指斬'],
  ['4', 'idle', '亂動／不該觸發'],
];

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r2 = (v) => Math.round(v * 100) / 100;

export class SessionLog {
  constructor(enabled = true) {
    this.enabled = enabled;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    this.session = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    this.buf = [];
    this.label = 'none';
    this.ok = true;
    this.sent = 0;
    if (!enabled) return;
    setInterval(() => this.flush(), 2000);
    // 頁面切到背景時瀏覽器會暫停偵測，記下來分析時才知道空白是怎麼來的
    document.addEventListener('visibilitychange', () => this.write({ type: 'visibility', t: r2(performance.now() / 1000), hidden: document.hidden }));
    addEventListener('pagehide', () => this.flush(true));
  }

  write(obj) { if (this.enabled) this.buf.push(JSON.stringify(obj)); }

  meta(info) { this.write({ type: 'meta', session: this.session, ua: navigator.userAgent, ...info }); }
  config(cfg) { this.write({ type: 'config', t: r2(performance.now() / 1000), cfg: { ...cfg } }); }
  setLabel(label) { this.label = label; this.write({ type: 'label', t: r2(performance.now() / 1000), label }); }
  mark(note) { this.write({ type: 'mark', t: r2(performance.now() / 1000), note, label: this.label }); }

  frame(t, hands, out) {
    this.write({
      type: 'frame',
      t: r4(t),
      label: this.label,
      state: out.state,
      puppet: out.puppetKey,
      events: out.events.length ? out.events.map((e) => ({ type: e.type, hand: e.hand })) : undefined,
      hands: hands.map(({ key, lm, f, m }) => ({
        key,
        lm: lm.map((p) => [r4(p.x), r4(p.y), r4(p.z)]),
        palm: r2(f.palm), open: f.open, sword: f.sword, pt: f.pointing, pup: f.puppet, ext: f.extended.map(Number).join(''),
        split: Math.round(f.splitDeg), thumb: Math.round(f.thumbDeg), gap: r2(f.tipGap),
        sp: r2(m.speed), tip: r2(m.tipSpeed), gr: r2(m.growth), tw: r2(m.twist),
      })),
    });
  }

  // 注意：fetch 的 keepalive 與 sendBeacon 單次上限約 64KB，有手時 2 秒紀錄常超過，
  // 所以平常用一般 fetch（沒有大小上限）；只有關頁時用 sendBeacon，並切成小塊。
  // 送失敗就把資料放回去下次再送，不丟掉。
  async flush(final = false) {
    if (!this.buf.length || this.sending) return;
    const lines = this.buf;
    this.buf = [];
    const url = `/__log?s=${this.session}`;
    if (final && navigator.sendBeacon) {
      let chunk = '';
      for (const l of lines) {
        if (chunk.length + l.length > 60000 && chunk) { navigator.sendBeacon(url, chunk); chunk = ''; }
        chunk += l + '\n';
      }
      if (chunk) navigator.sendBeacon(url, chunk);
      return;
    }
    this.sending = true;
    try {
      const body = lines.join('\n') + '\n';
      const res = await fetch(url, { method: 'POST', body });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.ok = true;
      this.sent += body.length;
    } catch (err) {
      console.warn('紀錄送出失敗，稍後重送：', err);
      this.ok = false;
      this.buf = lines.concat(this.buf).slice(-20000); // 最多暫存約 20000 行（約 5 分鐘）
    } finally {
      this.sending = false;
    }
  }
}
