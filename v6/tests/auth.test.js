'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createServer } = require('../server');

async function start(accountsFile) {
  const server = createServer({ accountsFile });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  return {
    server, base,
    post: (action, body, cookie = '', origin = base) => fetch(base + '/api/auth/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin }, body: JSON.stringify(body),
    }),
    session: cookie => fetch(base + '/api/auth/session', { headers: { Cookie: cookie || '' } }).then(res => res.json()),
  };
}
const signup = { email: 'rider@example.com', username: 'London Rider', password: 'cycling-test-123', confirmPassword: 'cycling-test-123' };
function cookieOf(response) { return response.headers.get('set-cookie').split(';')[0]; }
async function stop(app) { await new Promise(resolve => app.server.close(resolve)); }

test('register, log in, reload a session and log out without exposing passwords', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtd-auth-'));
  const file = path.join(dir, 'accounts.json');
  const app = await start(file);
  try {
    assert.deepEqual(await app.session(), { user: null });
    const registered = await app.post('register', signup);
    assert.equal(registered.status, 201);
    const payload = await registered.json();
    assert.deepEqual(payload, { user: { email: signup.email, username: signup.username, fullName: '', location: '', bio: '', avatarUrl: null } });
    assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    const firstCookie = cookieOf(registered);
    assert.deepEqual(await app.session(firstCookie), payload);
    const stored = await fs.readFile(file, 'utf8');
    assert.ok(!stored.includes(signup.password));
    assert.match(JSON.parse(stored)[0].hash, /^[a-f0-9]{128}$/);
    assert.equal((await app.post('login', { ...signup, password: 'incorrect-password' })).status, 401);
    assert.equal((await app.post('login', { ...signup, email: 'missing@example.com' })).status, 401);
    const login = await app.post('login', { ...signup, email: 'RIDER@EXAMPLE.COM' }, firstCookie);
    assert.equal(login.status, 200);
    const secondCookie = cookieOf(login);
    assert.notEqual(secondCookie, firstCookie);
    assert.deepEqual(await app.session(firstCookie), { user: null });
    assert.deepEqual(await app.session(secondCookie), payload);
    assert.equal((await app.post('logout', {}, secondCookie)).status, 200);
    assert.deepEqual(await app.session(secondCookie), { user: null });
    for (const url of ['/.local/accounts.json', '/lib/auth.js', '/assets/images/../../.local/accounts.json'])
      assert.equal((await fetch(app.base + url)).status, 404);
  } finally { await stop(app); await fs.rm(dir, { recursive: true, force: true }); }
});

test('accounts persist over server restart; concurrent duplicate registration cannot lose accounts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtd-auth-'));
  const file = path.join(dir, 'accounts.json');
  let app = await start(file);
  try {
    const responses = await Promise.all([app.post('register', signup), app.post('register', signup)]);
    assert.deepEqual(responses.map(res => res.status).sort(), [201, 409]);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).length, 1);
    const oldCookie = cookieOf(responses.find(res => res.status === 201));
    await stop(app);
    app = await start(file);
    assert.deepEqual(await app.session(oldCookie), { user: null });
    assert.equal((await app.post('login', signup)).status, 200);
  } finally { await stop(app); await fs.rm(dir, { recursive: true, force: true }); }
});

test('invalid registrations, foreign origins and unsupported actions are rejected', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtd-auth-'));
  const app = await start(path.join(dir, 'accounts.json'));
  try {
    for (const patch of [{ email: 'invalid' }, { username: '<script>' }, { password: 'short' }, { confirmPassword: 'mismatch' }])
      assert.equal((await app.post('register', { ...signup, ...patch })).status, 400);
    assert.equal((await app.post('register', signup, '', 'https://another-site.example')).status, 403);
    assert.equal((await app.post('missing', {})).status, 404);
    assert.equal((await fetch(app.base + '/api/auth/login')).status, 405);
    assert.equal((await app.post('register', { ...signup, username: '骑行者' })).status, 201);
  } finally { await stop(app); await fs.rm(dir, { recursive: true, force: true }); }
});

const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1eAAAAAASUVORK5CYII=';
test('profiles and avatars persist, update the greeting in all sessions and stay private to the account', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtd-profile-'));
  const file = path.join(dir, 'accounts.json');
  let app = await start(file);
  try {
    assert.equal((await app.post('profile', { username: 'Visitor' })).status, 401);
    assert.equal((await fetch(app.base + '/api/auth/avatar')).status, 401);
    const first = await app.post('register', signup);
    const cookie = cookieOf(first);
    const anotherSession = cookieOf(await app.post('login', signup));
    const save = await app.post('profile', { username: 'Alex', fullName: 'Alex Rider', location: 'London', bio: 'Cycling every day.', avatarData: samplePng }, cookie);
    assert.equal(save.status, 200);
    const updated = (await save.json()).user;
    assert.equal(updated.username, 'Alex');
    assert.ok(updated.avatarUrl.startsWith('/api/auth/avatar?v='));
    assert.ok(!Object.hasOwn(updated, 'hash') && !Object.hasOwn(updated, 'avatar'));
    assert.equal((await app.session(anotherSession)).user.username, 'Alex');
    const photo = await fetch(app.base + updated.avatarUrl, { headers: { Cookie: cookie } });
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.match(photo.headers.get('cache-control'), /private/);
    assert.deepEqual(Buffer.from(await photo.arrayBuffer()), Buffer.from(samplePng.split(',')[1], 'base64'));
    const other = cookieOf(await app.post('register', { ...signup, email: 'other@example.com' }));
    assert.equal((await fetch(app.base + updated.avatarUrl, { headers: { Cookie: other } })).status, 404);
    await stop(app); app = await start(file);
    const restoredCookie = cookieOf(await app.post('login', signup));
    const restored = (await app.session(restoredCookie)).user;
    assert.equal(restored.fullName, 'Alex Rider'); assert.equal(restored.location, 'London'); assert.equal(restored.bio, 'Cycling every day.');
    assert.equal((await app.post('profile', { avatarData: null }, restoredCookie)).status, 200);
    assert.equal((await app.session(restoredCookie)).user.avatarUrl, null);
    assert.equal((await fetch(app.base + '/api/auth/avatar', { headers: { Cookie: restoredCookie } })).status, 404);
  } finally { await stop(app); await fs.rm(dir, { recursive: true, force: true }); }
});
test('profile validation rejects unsupported images, changed email and invalid fields without losing the original account', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtd-profile-'));
  const app = await start(path.join(dir, 'accounts.json'));
  try {
    const cookie = cookieOf(await app.post('register', signup));
    for (const patch of [{ username: '<script>' }, { fullName: 'x'.repeat(81) }, { bio: 'x'.repeat(401) }, { email: 'another@example.com' }, { avatarData: 'data:image/svg+xml;base64,PHN2Zz4=' }, { avatarData: 'data:image/png;base64,aGVsbG8=' }])
      assert.equal((await app.post('profile', patch, cookie)).status, 400);
    assert.equal((await app.post('profile', { username: 'Alex' }, cookie, 'https://foreign.example')).status, 403);
    const original = (await app.session(cookie)).user;
    assert.equal(original.username, signup.username); assert.equal(original.avatarUrl, null);
  } finally { await stop(app); await fs.rm(dir, { recursive: true, force: true }); }
});
