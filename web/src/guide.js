// 引導錄製：頁面一步一步提示老闆做動作、自動貼標籤，老闆不用自己按鍵、不用逐條回報。
// 每步先倒數 3 秒準備，再錄 sec 秒。錄完 Claude 讀 web/logs/ 分析。
const STEPS = [
  { label: 'puppet', sec: 8, text: '左手擺戲偶手，慢慢轉幾個角度（右手放下）' },
  { label: 'puppet', sec: 8, text: '換右手擺戲偶手，慢慢轉幾個角度（左手放下）' },
  { label: 'slash', sec: 12, text: '左手戲偶＋右手劍指斬：劃 5 次' },
  { label: 'slash', sec: 12, text: '左手戲偶＋右手劍指「直劈」：由上往下、往鏡頭劈 5 次' },
  { label: 'strike', sec: 12, text: '左手戲偶＋右手張掌推向鏡頭：推 5 次' },
  { label: 'idle', sec: 10, text: '兩手隨便動、比 YA、揮手（不要擺戲偶）' },
  { label: 'idle', sec: 8, text: '左手戲偶不動＋右手隨便晃（不要劍指、不要推）' },
];
const PREP = 3;

export function mountGuide(log, el, button) {
  let running = false;
  button.addEventListener('click', async () => {
    if (running) return;
    running = true;
    button.disabled = true;
    el.hidden = false;
    log.mark('guide-start');
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      log.setLabel('none');
      await countdown(PREP, (n) => (el.innerHTML = `<small>第 ${i + 1}/${STEPS.length} 步・準備</small><div>${s.text}</div><b>${n}</b>`));
      log.setLabel(s.label);
      await countdown(s.sec, (n) => (el.innerHTML = `<small>第 ${i + 1}/${STEPS.length} 步・錄製中 ●</small><div>${s.text}</div><b>${n}</b>`));
    }
    log.setLabel('none');
    log.mark('guide-end');
    await log.flush();
    el.innerHTML = '<div>錄好了！跟 Claude 說「錄好了」</div>';
    setTimeout(() => (el.hidden = true), 4000);
    button.disabled = false;
    running = false;
  });
}

function countdown(sec, render) {
  return new Promise((resolve) => {
    let n = sec;
    render(n);
    const id = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(id); resolve(); } else render(n);
    }, 1000);
  });
}
