// Story 10 acceptance tests: Watchlist (FR-5.1)
const { setup, request } = require('./helpers');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Story 10: Watchlist', () => {
  let ctx, user;
  const list = async () => (await request(ctx.app).get('/api/watchlist').set(auth(user))).body;
  const add = (titleId) => request(ctx.app).post('/api/watchlist').set(auth(user)).send({ titleId });

  beforeEach(async () => {
    ctx = setup(9);
    user = await ctx.login('user@streamhub.test', 'User1234');
  });

  test('TC-10.1 adds a title and lists it with name, poster, tier, and date added', async () => {
    expect((await add(2)).status).toBe(201);
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ titleId: 2 });
    ['name', 'posterUrl', 'tier', 'addedAt'].forEach((k) => expect(items[0]).toHaveProperty(k));
  });

  test('TC-10.2 adding the same title twice keeps one entry (no duplicates)', async () => {
    await add(2);
    const again = await add(2);
    expect([200, 201]).toContain(again.status);
    expect(await list()).toHaveLength(1);
  });

  test('TC-10.3 lists newest first', async () => {
    await add(1);
    ctx.advance(1);
    await add(3);
    expect((await list()).map((i) => i.titleId)).toEqual([3, 1]);
  });

  test('TC-10.4 removes a title, and removing one that is not there returns 404', async () => {
    await add(2);
    expect((await request(ctx.app).delete('/api/watchlist/2').set(auth(user))).status).toBe(204);
    expect(await list()).toHaveLength(0);
    expect((await request(ctx.app).delete('/api/watchlist/2').set(auth(user))).status).toBe(404);
  });

  test('TC-10.5 unknown or deleted titles cannot be added', async () => {
    expect((await add(999)).status).toBe(404);
    const admin = await ctx.login('admin@streamhub.test', 'Admin123');
    await request(ctx.app).delete('/api/titles/4').set(auth(admin));
    expect((await add(4)).status).toBe(404);
  });

  test('TC-10.6 a title deleted by an admin disappears from watchlists (FR-2.2)', async () => {
    await add(5);
    const admin = await ctx.login('admin@streamhub.test', 'Admin123');
    await request(ctx.app).delete('/api/titles/5').set(auth(admin));
    expect(await list()).toHaveLength(0);
  });

  test('TC-10.7 watchlists are private and persist per user; login required', async () => {
    await add(2);
    const other = await ctx.login('basic@streamhub.test', 'Basic1234');
    expect((await request(ctx.app).get('/api/watchlist').set(auth(other))).body).toHaveLength(0);
    expect((await request(ctx.app).get('/api/watchlist')).status).toBe(401);
    expect((await request(ctx.app).post('/api/watchlist').send({ titleId: 2 })).status).toBe(401);
  });
});
