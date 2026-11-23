// 開發用：接收測試頁送來的試揮紀錄，存成 web/logs/<session>.jsonl（每次開頁一個新檔，不覆蓋舊檔）。
// 只在 `npm run dev` 時存在，打包後的網站沒有這個功能。紀錄只有關鍵點數字，不含任何影像。
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function logServer(rootDir) {
  const dir = join(rootDir, 'logs');
  return {
    name: 'puppet-vfx-log-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__log', (req, res) => {
        const session = new URL(req.url, 'http://x').searchParams.get('s') || '';
        if (req.method !== 'POST' || !/^[0-9A-Za-z_-]{6,40}$/.test(session)) {
          res.statusCode = 400;
          return res.end('bad request');
        }
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 8e6) req.destroy(); });
        req.on('end', () => {
          mkdirSync(dir, { recursive: true });
          appendFileSync(join(dir, `${session}.jsonl`), body.endsWith('\n') ? body : body + '\n');
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}
