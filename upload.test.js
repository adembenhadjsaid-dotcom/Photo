const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/upload');

const originalFetch = global.fetch;
const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID', 'TURNSTILE_SECRET_KEY'];
const oldEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of keys) { if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key]; }
});

function response() {
  return {
    code: null,
    value: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(value) { this.value = value; return this; }
  };
}
const image = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(256, 42)]).toString('base64')}`;

test('rejects an invalid or oversized upload before calling external APIs', async () => {
  global.fetch = () => { throw new Error('Unexpected external request'); };
  for (const data of ['data:image/png;base64,AAAA', `data:image/jpeg;base64,${'A'.repeat(3_000_000)}`]) {
    const res = response();
    await handler({ method: 'POST', body: { image: data }, headers: {} }, res);
    assert.equal(res.code, 400);
  }
});

test('uploads a validated image only after the challenge succeeds', async () => {
  Object.assign(process.env, { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REFRESH_TOKEN: 'refresh', GOOGLE_DRIVE_FOLDER_ID: 'folder', TURNSTILE_SECRET_KEY: 'turnstile' });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('turnstile')) return { ok: true, json: async () => ({ success: true }) };
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'access' }) };
    return { ok: true, json: async () => ({ id: 'file-id' }) };
  };
  const res = response();
  await handler({ method: 'POST', body: { image, turnstileToken: 'challenge' }, headers: {} }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.value, { ok: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].options.headers.Authorization, 'Bearer access');
  assert.match(calls[2].options.body.toString(), /"parents":\["folder"\]/);
});

test('challenge failure does not request Drive credentials', async () => {
  process.env.TURNSTILE_SECRET_KEY = 'turnstile';
  let count = 0;
  global.fetch = async () => { count++; return { ok: true, json: async () => ({ success: false }) }; };
  const res = response();
  await handler({ method: 'POST', body: { image, turnstileToken: 'bad' }, headers: {} }, res);
  assert.equal(res.code, 403);
  assert.equal(count, 1);
});
