import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env.BASE_URL;

// 建立 HandLandmarker（VIDEO 模式、最多兩隻手）。先試 GPU，失敗退回 CPU。
export async function createHandTracker() {
  const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: `${BASE}models/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
  });
  try {
    const landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    return { landmarker, delegate: 'GPU' };
  } catch (err) {
    console.warn('GPU 後端失敗，改用 CPU：', err);
    const landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    return { landmarker, delegate: 'CPU' };
  }
}

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;
