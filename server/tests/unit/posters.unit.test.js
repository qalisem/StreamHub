// Unit tests: poster validation (Story 24). No HTTP.
const { parsePoster, MAX_BYTES } = require('../../src/posters');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const url = (type, bytes) => `data:${type};base64,${bytes.toString('base64')}`;

test('accepts a PNG with a real signature', () => {
  const result = parsePoster(url('image/png', Buffer.concat([PNG_SIG, Buffer.alloc(16)])));
  expect(result.ext).toBe('png');
  expect(result.bytes.length).toBe(24);
});

test('rejects a file whose content does not match its declared type', () => {
  expect(parsePoster(url('image/jpeg', Buffer.concat([PNG_SIG, Buffer.alloc(16)])))).toMatchObject({ status: 400 });
});

test('rejects types other than PNG, JPEG, WebP', () => {
  expect(parsePoster(url('image/svg+xml', Buffer.from('<svg/>')))).toMatchObject({ status: 400 });
  expect(parsePoster(url('image/gif', Buffer.from('GIF89a')))).toMatchObject({ status: 400, error: 'Only PNG, JPEG, or WebP images are allowed' });
});

test('enforces the 2 MB limit exactly', () => {
  const atLimit = Buffer.concat([PNG_SIG, Buffer.alloc(MAX_BYTES - 8)]);
  const over = Buffer.concat([PNG_SIG, Buffer.alloc(MAX_BYTES - 7)]);
  expect(parsePoster(url('image/png', atLimit)).ext).toBe('png');
  expect(parsePoster(url('image/png', over))).toMatchObject({ status: 413 });
});

test('rejects anything that is not a base64 data URL', () => {
  expect(parsePoster('https://example.com/poster.png')).toMatchObject({ status: 400 });
  expect(parsePoster(null)).toMatchObject({ status: 400 });
});
