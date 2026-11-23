// 準備本機執行需要的檔案：MediaPipe wasm（從 node_modules 複製）＋手部模型（缺少才下載一次）。
// 執行後推論全在瀏覽器本機，不再連外部 CDN。
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/wasm');
cpSync(wasmSrc, wasmDst, { recursive: true });
console.log('[setup-assets] wasm →', wasmDst);

const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const modelPath = join(root, 'public/models/hand_landmarker.task');
if (!existsSync(modelPath)) {
  mkdirSync(dirname(modelPath), { recursive: true });
  const res = await fetch(modelUrl);
  if (!res.ok) throw new Error(`模型下載失敗：HTTP ${res.status}`);
  writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
  console.log('[setup-assets] model downloaded →', modelPath);
} else {
  console.log('[setup-assets] model exists, skip');
}
