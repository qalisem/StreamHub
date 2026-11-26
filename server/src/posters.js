// Story 24: poster image uploads (FR-2.1 extension, risk R8).
// Images arrive as a base64 data URL in JSON, so no extra upload library is needed.
// The declared type must match the file's real signature (magic bytes), and the size is capped.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const TYPES = {
  'image/png': { ext: 'png', matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/webp': { ext: 'webp', matches: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
};
const DATA_URL = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=\s]+)$/;

// Returns { ext, bytes } or { error, status }
function parsePoster(dataUrl) {
  const match = DATA_URL.exec(String(dataUrl || ''));
  if (!match) return { status: 400, error: 'Send the poster as a PNG, JPEG, or WebP image' };
  const type = TYPES[match[1]];
  if (!type) return { status: 400, error: 'Only PNG, JPEG, or WebP images are allowed' };
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > MAX_BYTES) return { status: 413, error: 'Poster must be 2 MB or smaller' };
  if (!type.matches(bytes)) return { status: 400, error: 'The file is not a valid image of that type' };
  return { ext: type.ext, bytes };
}

// Saves under <uploadDir>/posters with a random name and returns the public URL
function savePoster(uploadDir, titleId, { ext, bytes }) {
  const dir = path.join(uploadDir, 'posters');
  fs.mkdirSync(dir, { recursive: true });
  const file = `${titleId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, file), bytes);
  return `/uploads/posters/${file}`;
}

// Removes a previously uploaded poster (never touches seeded or external poster URLs)
function removeUploaded(uploadDir, posterUrl) {
  if (!posterUrl || !posterUrl.startsWith('/uploads/posters/')) return;
  const file = path.join(uploadDir, 'posters', path.basename(posterUrl));
  fs.rmSync(file, { force: true });
}

module.exports = { parsePoster, savePoster, removeUploaded, MAX_BYTES };
