'use strict';

// Small, persistent account store for this single-server university project.
// Passwords use salted scrypt hashes; only an opaque session ID goes to the browser.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const COOKIE = 'mtd_session';
const SESSION_SECONDS = 60 * 60 * 8;
const profile = require('./profile');

function problem(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readBody(req, limit = 8192) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || ''))
    throw problem(415, 'Please send JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw problem(413, 'This form is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch { throw problem(400, 'Please check the form and try again.'); }
}

function createAuth({ accountsFile = path.join(__dirname, '../.local/accounts.json') } = {}) {
  const sessions = new Map();
  const attempts = new Map();
  let writes = Promise.resolve();

  async function accounts() {
    try {
      const value = JSON.parse(await fs.readFile(accountsFile, 'utf8'));
      if (!Array.isArray(value)) throw Error('Invalid account store');
      return value;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  function changeAccounts(change) {
    const write = writes.then(async () => {
      const users = await accounts();
      const result = change(users);
      await fs.mkdir(path.dirname(accountsFile), { recursive: true, mode: 0o700 });
      await fs.writeFile(accountsFile + '.tmp', JSON.stringify(users), { mode: 0o600 });
      await fs.rename(accountsFile + '.tmp', accountsFile);
      return result;
    });
    writes = write.catch(() => {});
    return write;
  }

  function tokenFrom(req) {
    const match = (req.headers.cookie || '').match(/(?:^|;\s*)mtd_session=([a-f0-9]{64})(?:;|$)/);
    return match?.[1];
  }

  async function session(req) {
    const token = tokenFrom(req);
    const entry = sessions.get(token);
    if (!entry) return null;
    if (entry.expires <= Date.now()) { sessions.delete(token); return null; }
    return (await accounts()).find(user => user.email === entry.email) || null;
  }

  function cookie(req, res, token, maxAge = SESSION_SECONDS) {
    // Direct HTTPS is secure; only opt into proxy HTTPS when deployment explicitly trusts it.
    const secure = req.socket.encrypted || process.env.COOKIE_SECURE === 'true';
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
  }

  function signIn(req, res, user) {
    const now = Date.now();
    for (const [key, entry] of sessions) if (entry.expires <= now) sessions.delete(key);
    sessions.delete(tokenFrom(req));
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { email: user.email, expires: now + SESSION_SECONDS * 1000 });
    cookie(req, res, token);
    return profile.publicUser(user);
  }

  async function handle(req, res, pathname, json) {
    if (!pathname.startsWith('/api/auth/')) return false;
    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const account = await session(req);
      json(res, 200, { user: account ? profile.publicUser(account) : null });
      return true;
    }
    if (['/api/auth/profile', '/api/auth/avatar'].includes(pathname) && req.method === 'GET') {
      const account = await session(req);
      if (!account) throw problem(401, 'Log in to manage your profile.');
      if (pathname === '/api/auth/profile') json(res, 200, { user: profile.publicUser(account) });
      else if (!account.avatar) json(res, 404, { error: 'No profile photo has been uploaded.' });
      else {
        const bytes = Buffer.from(account.avatar.data, 'base64');
        res.writeHead(200, { 'Content-Type': account.avatar.type, 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(bytes);
      }
      return true;
    }
    if (!['/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/profile'].includes(pathname)) {
      json(res, 404, { error: 'Not found' }); return true;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      json(res, 405, { error: 'Use POST for this action.' }); return true;
    }
    // A JSON-only POST plus origin validation prevents cross-site form submissions.
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { throw problem(403, 'Invalid request origin.'); }
      if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol))
        throw problem(403, 'Please use the form on this website.');
    }
    if (pathname === '/api/auth/logout') {
      await readBody(req);
      sessions.delete(tokenFrom(req));
      cookie(req, res, '', 0);
      json(res, 200, { user: null }); return true;
    }
    if (pathname === '/api/auth/profile') {
      const account = await session(req);
      if (!account) throw problem(401, 'Log in to manage your profile.');
      const body = await readBody(req, 750 * 1024);
      const updated = await changeAccounts(users => {
        const i = users.findIndex(user => user.email === account.email);
        if (i < 0) throw problem(401, 'Please log in again.');
        users[i] = profile.updateProfile(users[i], body);
        return users[i];
      });
      json(res, 200, { user: profile.publicUser(updated) });
      return true;
    }
    // Bounded per-IP throttling for a local, single-process server.
    const now = Date.now();
    for (const [key, value] of attempts) if (value.reset <= now) attempts.delete(key);
    const ip = req.socket.remoteAddress || 'local';
    const attempt = attempts.get(ip) || { count: 0, reset: now + 10 * 60 * 1000 };
    if (++attempt.count > 30) {
      res.setHeader('Retry-After', String(Math.ceil((attempt.reset - now) / 1000)));
      throw problem(429, 'Too many attempts. Please try again in a few minutes.');
    }
    attempts.set(ip, attempt);
    const body = await readBody(req);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw problem(400, 'Please enter a valid email address.');
    if (password.length < 8 || password.length > 128)
      throw problem(400, 'Use a password with 8–128 characters.');

    if (pathname === '/api/auth/register') {
      const username = profile.username(body.username);
      if (body.confirmPassword !== password) throw problem(400, 'Your passwords do not match.');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = (await scrypt(password, salt, 64)).toString('hex');
      // Serialize the read/modify/write so simultaneous signups cannot overwrite each other.
      await changeAccounts(users => {
        if (users.some(user => user.email === email))
          throw problem(409, 'An account already uses this email. Please log in.');
        users.push({ email, username, salt, hash });
      });
      json(res, 201, { user: signIn(req, res, { username, email }) });
    } else {
      const user = (await accounts()).find(item => item.email === email);
      // Perform the same expensive hash for missing accounts, too.
      const hash = await scrypt(password, user?.salt || 'missing-account-salt', 64);
      if (!user || !crypto.timingSafeEqual(hash, Buffer.from(user.hash, 'hex')))
        throw problem(401, 'Email or password is incorrect.');
      json(res, 200, { user: signIn(req, res, user) });
    }
    return true;
  }
  return { handle };
}

module.exports = { createAuth };
