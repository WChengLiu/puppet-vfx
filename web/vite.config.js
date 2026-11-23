import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { logServer } from './scripts/logServer.js';

// `npm run dev:https`：給手機在區網測試用（手機瀏覽器開相機必須是 HTTPS）。
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || '/',
  plugins: [logServer(import.meta.dirname), ...(mode === 'https' ? [basicSsl()] : [])],
  server: { watch: { ignored: ['**/logs/**'] } },
  build: { rollupOptions: { input: { main: 'index.html', editor: 'editor.html' } } }, // 擺零件視窗是第二頁
}));
