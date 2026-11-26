// Story 24 acceptance tests: admin uploads a poster image (FR-2.1 extension, risk R8)
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
// Smallest valid files of each type (real signatures)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(30)]);
const dataUrl = (type, bytes) => `data:${type};base64,${bytes.toString('base64')}`;

describe('Story 24: Admin poster upload', () => {
  let db, app, uploadDir, cm;
  const upload = (id, image, token = cm) => request(app).post(`/api/titles/${id}/poster`).set(auth(token)).send({ image });
  const files = () => fs.readdirSync(path.join(uploadDir, 'posters'));

  beforeEach(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamhub-posters-'));
    db = createDb(':memory:');
    seed(db, 5);
    app = createApp(db, { uploadDir });
    cm = (await request(app).post('/api/auth/login').send({ email: 'content@streamhub.test', password: 'Content123' })).body.token;
  });
  afterEach(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

  test('TC-24.1 a content manager uploads a PNG; the title now uses it and the file is served', async () => {
    const res = await upload(2, dataUrl('image/png', PNG));
    expect(res.status).toBe(200);
    expect(res.body.poster_url).toMatch(/^\/uploads\/posters\/2-[a-f0-9]{16}\.png$/);
    expect((await request(app).get('/api/titles/2')).body.poster_url).toBe(res.body.poster_url);
    const served = await request(app).get(res.body.poster_url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
  });

  test('TC-24.2 JPEG and WebP are accepted too', async () => {
    expect((await upload(2, dataUrl('image/jpeg', JPEG))).body.poster_url).toMatch(/\.jpg$/);
    expect((await upload(3, dataUrl('image/webp', WEBP))).body.poster_url).toMatch(/\.webp$/);
  });

  test('TC-24.3 other file types are rejected, even when renamed', async () => {
    expect((await upload(2, dataUrl('image/gif', Buffer.from('GIF89a')))).status).toBe(400);
    expect((await upload(2, dataUrl('image/png', Buffer.from('<script>alert(1)</script>')))).status).toBe(400);
    expect((await upload(2, 'not a data url')).status).toBe(400);
    expect((await upload(2, undefined)).status).toBe(400);
  });

  test('TC-24.4 files over 2 MB are rejected with 413', async () => {
    const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(2 * 1024 * 1024)]);
    const res = await upload(2, dataUrl('image/png', big));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Poster must be 2 MB or smaller');
  });

  test('TC-24.5 only admins and content managers can upload; unknown titles are 404', async () => {
    const sub = (await request(app).post('/api/auth/login').send({ email: 'user@streamhub.test', password: 'User1234' })).body.token;
    expect((await upload(2, dataUrl('image/png', PNG), sub)).status).toBe(403);
    expect((await request(app).post('/api/titles/2/poster').send({ image: dataUrl('image/png', PNG) })).status).toBe(401);
    expect((await upload(999, dataUrl('image/png', PNG))).status).toBe(404);
  });

  test('TC-24.6 replacing a poster removes the old uploaded file; the file name is generated', async () => {
    await upload(2, dataUrl('image/png', PNG));
    const first = files();
    await upload(2, dataUrl('image/jpeg', JPEG));
    const second = files();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]).toMatch(/^2-[a-f0-9]{16}\.jpg$/);
  });
});
