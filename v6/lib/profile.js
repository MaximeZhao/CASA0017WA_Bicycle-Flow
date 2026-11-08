'use strict';
const crypto = require('node:crypto');
const MAX_AVATAR_BYTES = 512 * 1024;

function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function username(value) {
  if (typeof value !== 'string' || !/^[\p{L}\p{N} ._'’-]{2,40}$/u.test(value.trim()))
    throw invalid('Use 2–40 letters, numbers, spaces or simple punctuation for your username.');
  return value.trim();
}
function text(value, name, max) {
  if (typeof value !== 'string' || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))
    throw invalid(`${name} must contain no more than ${max} characters.`);
  return value.trim();
}
function avatar(value) {
  if (value === null) return null;
  const match = typeof value === 'string' && value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw invalid('Choose a JPG, PNG or WebP image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_AVATAR_BYTES) throw invalid('The resized avatar must be 512 KB or smaller.');
  if (bytes.toString('base64') !== match[2]) throw invalid('The image data is invalid.');
  const type = match[1];
  const png = bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const jpg = bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const webp = bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!(type === 'image/png' && png || type === 'image/jpeg' && jpg || type === 'image/webp' && webp))
    throw invalid('The file contents do not match a supported image format.');
  return { type, data: match[2], version: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 20) };
}
function updateProfile(account, input) {
  if (input.email !== undefined && input.email !== account.email) throw invalid('Your account email cannot be changed here.');
  const result = { ...account };
  if (input.username !== undefined) result.username = username(input.username);
  for (const [key, label, max] of [['fullName', 'Full name', 80], ['location', 'Location', 80], ['bio', 'Bio', 400]])
    if (input[key] !== undefined) result[key] = text(input[key], label, max);
  if (input.avatarData !== undefined) result.avatar = avatar(input.avatarData);
  return result;
}
function publicUser(account) {
  return {
    username: account.username, email: account.email,
    fullName: account.fullName || '', location: account.location || '', bio: account.bio || '',
    avatarUrl: account.avatar ? '/api/auth/avatar?v=' + account.avatar.version : null,
  };
}
module.exports = { username, updateProfile, publicUser, MAX_AVATAR_BYTES };
