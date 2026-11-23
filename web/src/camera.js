// 開相機。facing：'user'（前鏡頭，預設）或 'environment'（後鏡頭）。
export async function openCamera(facing = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('這個瀏覽器不能開相機（手機需用 HTTPS 開啟頁面）');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) {
    await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  }
  return video;
}
