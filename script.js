// ====== 状態 ======
let remainingSeconds = 60;
let timerId = null;

// ====== DOM参照 ======
const timeEl = document.getElementById("time");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const resetBtn = document.getElementById("resetBtn");

// ====== 表示更新 ======
function render() {
  timeEl.textContent = String(remainingSeconds);
}

function setStatus(text) {
  statusEl.textContent = text;
}

// ====== タイマー制御 ======
function start() {
  if (timerId !== null) return; // 二重起動防止

  setStatus("計測中…");

  timerId = setInterval(() => {
    remainingSeconds -= 1;
    render();

    if (remainingSeconds <= 0) {
      stop();
      remainingSeconds = 0;
      render();
      setStatus("終了");
      // ここに「終了時の処理」を後で足せます
    }
  }, 1000);
}

function stop() {
  if (timerId === null) return;
  clearInterval(timerId);
  timerId = null;
  setStatus("停止");
}

function reset() {
  stop();
  remainingSeconds = 60;
  render();
  setStatus("");
}

// ====== イベント ======
startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);
resetBtn.addEventListener("click", reset);

// 初期表示
render();
