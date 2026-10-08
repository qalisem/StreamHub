const { setup, request } = require('./helpers');

const sample = { name: 'Test Movie', type: 'movie', genre: 'Drama', year: 2024, rating: 7.5, synopsis: 'S', cast_list: 'A, B', tier: 'premium' };

describe('Story 2: Admin manages titles', () => {
  let app, login, admin, cm, user;
  beforeEach(async () => {
    ({ app, login } = setup(5));
    admin = await login('admin@streamhub.test', 'Admin123');
    cm = await login('content@streamhub.test', 'Content123');
    user = await login('user@streamhub.test', 'User1234');
  });
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  test('TC-2.1 admin adds a title and it appears in the catalog', async () => {
    const res = await request(app).post('/api/titles').set(auth(admin)).send(sample);
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/titles?q=Test Movie');
    expect(list.body.items.map((t) => t.id)).toContain(res.body.id);
  });

  test('TC-2.2 content manager can also add titles', async () => {
    expect((await request(app).post('/api/titles').set(auth(cm)).send(sample)).status).toBe(201);
  });

  test('TC-2.3 subscribers and visitors cannot add titles', async () => {
    expect((await request(app).post('/api/titles').set(auth(user)).send(sample)).status).toBe(403);
    expect((await request(app).post('/api/titles').send(sample)).status).toBe(401);
  });

  test('TC-2.4 required fields are validated', async () => {
    const res = await request(app).post('/api/titles').set(auth(admin)).send({ name: '', type: 'tv', year: 3000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/);
  });

  test('TC-2.5 admin edits a title', async () => {
    const res = await request(app).put('/api/titles/1').set(auth(admin)).send({ name: 'Renamed', rating: 9 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed', rating: 9 });
  });

  test('TC-2.6 delete is a soft delete and hides the title', async () => {
    expect((await request(app).delete('/api/titles/1').set(auth(admin))).status).toBe(204);
    expect((await request(app).get('/api/titles/1')).status).toBe(404);
    expect((await request(app).delete('/api/titles/1').set(auth(admin))).status).toBe(404);
  });

  test('TC-2.7 edit or delete of a missing title returns 404', async () => {
    expect((await request(app).put('/api/titles/999').set(auth(admin)).send({ name: 'x' })).status).toBe(404);
  });
});

describe('Stories 3, 4, 5: Browse, search, filter, detail', () => {
  let app;
  beforeAll(() => ({ app } = setup(50)));

  test('TC-3.1 catalog is paginated at 20 per page', async () => {
    const p1 = await request(app).get('/api/titles');
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body).toMatchObject({ total: 50, totalPages: 3 });
    const p3 = await request(app).get('/api/titles?page=3');
    expect(p3.body.items).toHaveLength(10);
  });

  test('TC-4.1 keyword search is partial and case-insensitive on name and cast', async () => {
    const byName = await request(app).get('/api/titles?q=crimson');
    expect(byName.body.total).toBeGreaterThan(0);
    byName.body.items.forEach((t) => expect(t.name.toLowerCase()).toContain('crimson'));
    const byCast = await request(app).get('/api/titles?q=maya');
    expect(byCast.body.total).toBeGreaterThan(0);
  });

  test('TC-4.2 filters combine (genre, type, year, rating)', async () => {
    const res = await request(app).get('/api/titles?genre=Drama,Comedy&type=movie&yearFrom=2000&minRating=6');
    res.body.items.forEach((t) => {
      expect(['Drama', 'Comedy']).toContain(t.genre);
      expect(t.type).toBe('movie');
      expect(t.year).toBeGreaterThanOrEqual(2000);
      expect(t.rating).toBeGreaterThanOrEqual(6);
    });
  });

  test('TC-4.3 sorting by rating and A to Z', async () => {
    const r = (await request(app).get('/api/titles?sort=rating')).body.items.map((t) => t.rating);
    expect(r).toEqual([...r].sort((a, b) => b - a));
    const n = (await request(app).get('/api/titles?sort=az')).body.items.map((t) => t.name.toLowerCase());
    expect(n).toEqual([...n].sort());
  });

  test('TC-4.4 no results returns an empty list, not an error', async () => {
    const res = await request(app).get('/api/titles?q=zzzzzz');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  test('TC-4.5 search input is parameterized (SQL injection attempt is harmless)', async () => {
    const res = await request(app).get("/api/titles?q=' OR 1=1 --");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  test('TC-4.6 genres endpoint lists distinct genres', async () => {
    const res = await request(app).get('/api/titles/genres');
    expect(res.body).toContain('Drama');
    expect(new Set(res.body).size).toBe(res.body.length);
  });

  test('TC-5.1 detail page returns full title info', async () => {
    const res = await request(app).get('/api/titles/1');
    expect(res.status).toBe(200);
    ['synopsis', 'cast_list', 'genre', 'runtime', 'rating', 'trailer_url'].forEach((k) => expect(res.body).toHaveProperty(k));
  });

  test('TC-5.2 unknown title returns 404', async () => {
    expect((await request(app).get('/api/titles/9999')).status).toBe(404);
  });

  test('NFR-1 search over 1,000 titles returns within 2 seconds', async () => {
    const big = setup(1000);
    const start = Date.now();
    const res = await request(big.app).get('/api/titles?q=signal&genre=Drama&sort=rating');
    expect(res.status).toBe(200);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
