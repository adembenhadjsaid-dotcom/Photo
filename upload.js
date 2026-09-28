const MAX_BYTES = 2_000_000;

function decodeImage(image) {
  if (typeof image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) return null;
  const encoded = image.split(',')[1];
  if (encoded.length > Math.ceil(MAX_BYTES * 4 / 3) + 4) return null;
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length > MAX_BYTES || buffer.length < 100 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) return null;
  return buffer;
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || typeof token !== 'string') return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return false;
  return (await res.json()).success === true;
}

async function getAccessToken() {
  const { GOOGLE_CLIENT_ID: client_id, GOOGLE_CLIENT_SECRET: client_secret, GOOGLE_REFRESH_TOKEN: refresh_token } = process.env;
  if (!client_id || !client_secret || !refresh_token || !process.env.GOOGLE_DRIVE_FOLDER_ID) throw new Error('missing_configuration');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('google_auth_failed');
  return data.access_token;
}

async function uploadToDrive(image, token) {
  const boundary = `photo_${crypto.randomUUID().replace(/-/g, '')}`;
  const filename = `photo_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto.randomUUID().slice(0, 8)}.jpg`;
  const meta = JSON.stringify({ name: filename, mimeType: 'image/jpeg', parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    image,
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body, signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`google_upload_failed_${res.status}`);
  const data = await res.json();
  if (!data.id) throw new Error('google_upload_missing_id');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'الطريقة غير مدعومة.' });
  try {
    const image = decodeImage(req.body?.image);
    if (!image) return res.status(400).json({ error: 'الصورة غير صالحة أو حجمها كبير.' });
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (!await verifyTurnstile(req.body?.turnstileToken, ip)) return res.status(403).json({ error: 'كمّل التحقق وعاود جرّب.' });
    const token = await getAccessToken();
    await uploadToDrive(image, token);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Upload failed:', error.message);
    return res.status(500).json({ error: 'تعذّر إرسال الصورة. حاول مرة أخرى.' });
  }
};

module.exports.decodeImage = decodeImage;
