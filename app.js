const start = document.querySelector('#start');
const capture = document.querySelector('#capture');
const retry = document.querySelector('#retry');
const send = document.querySelector('#send');
const video = document.querySelector('#camera');
const preview = document.querySelector('#preview');
const placeholder = document.querySelector('#placeholder');
const status = document.querySelector('#status');
let stream = null;
let photo = null;
let turnstileWidget = null;

function tell(message, error = false) { status.textContent = message; status.classList.toggle('error', error); }
function stopCamera() { stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; }
function view(state) {
  placeholder.hidden = state !== 'idle';
  video.hidden = state !== 'camera';
  preview.hidden = state !== 'preview';
  start.hidden = state !== 'idle';
  capture.hidden = state !== 'camera';
  retry.hidden = state !== 'preview';
  send.hidden = state !== 'preview';
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { tell('الكاميرا موش متاحة. افتح الرابط عبر HTTPS في متصفح حديث.', true); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
    video.srcObject = stream;
    await video.play();
    view('camera');
    tell('الكاميرا مفتوحة. اضغط «التقط صورة» وقت تكون مستعد.');
  } catch { stopCamera(); tell('تعذّر فتح الكاميرا. تأكّد من سماح المتصفح بالكاميرا.', true); }
}

start.addEventListener('click', openCamera);
retry.addEventListener('click', async () => { photo = null; preview.removeAttribute('src'); await openCamera(); });
capture.addEventListener('click', () => {
  if (!stream || !video.videoWidth) return;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  photo = canvas.toDataURL('image/jpeg', 0.76);
  preview.src = photo;
  stopCamera();
  view('preview');
  tell('شوف الصورة. تنجم تعاود التصوير أو توافق على إرسالها.');
});

async function initTurnstile() {
  try {
    const config = await fetch('/api/config').then(res => res.json());
    if (!config.siteKey) return;
    const container = document.querySelector('#turnstile-container');
    container.hidden = false;
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => { turnstileWidget = window.turnstile.render(container, { sitekey: config.siteKey }); };
    script.onerror = () => tell('تعذّر تحميل التحقق. عاود فتح الصفحة.', true);
    document.head.append(script);
  } catch { /* Upload will surface connectivity errors. */ }
}
initTurnstile();

send.addEventListener('click', async () => {
  if (!photo) return;
  const token = turnstileWidget === null ? null : window.turnstile.getResponse(turnstileWidget);
  send.disabled = true;
  retry.disabled = true;
  tell('جاري إرسال الصورة…');
  try {
    const res = await fetch('/api/upload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: photo, turnstileToken: token })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'تعذّر الإرسال. عاود المحاولة.');
    photo = null;
    preview.removeAttribute('src');
    view('idle');
    tell('وصلت الصورة، يعطيك الصحة! ✅');
  } catch (error) {
    tell(error.message || 'تعذّر الإرسال. عاود المحاولة.', true);
    if (turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
  } finally { send.disabled = false; retry.disabled = false; }
});
window.addEventListener('pagehide', stopCamera);
