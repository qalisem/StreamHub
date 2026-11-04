// Story 11 acceptance tests: Watch history and continue watching (FR-5.2, FR-5.3)
// Seed data: title 1 is a Basic show (45 min = 2700 s), title 4 is a Basic show.
// basic@streamhub.test has an active Basic plan, so it can play Basic titles.
const { setup, request } = require('./helpers');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Story 11: Watch history and continue watching', () => {
  let ctx, basic;
  const progress = (id, positionSeconds, token = basic) =>
    request(ctx.app).post(`/api/titles/${id}/progress`).set(auth(token)).send({ positionSeconds });
  const history = async () => (await request(ctx.app).get('/api/history').set(auth(basic))).body;
  const cont = async () => (await request(ctx.app).get('/api/history/continue').set(auth(basic))).body;

  beforeEach(async () => {
    ctx = setup(9);
    basic = await ctx.login('basic@streamhub.test', 'Basic1234');
  });

  test('TC-11.1 saves playback progress and returns position, duration, and completed', async () => {
    const res = await progress(1, 600);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ positionSeconds: 600, durationSeconds: 2700, completed: false });
  });

  test('TC-11.2 progress is clamped between 0 and the title duration', async () => {
    expect((await progress(1, -50)).body.positionSeconds).toBe(0);
    expect((await progress(1, 999999)).body.positionSeconds).toBe(2700);
    expect((await progress(1, 'abc')).status).toBe(400);
  });

  test('TC-11.3 watching 95% or more marks the title completed', async () => {
    expect((await progress(1, 2565)).body.completed).toBe(true); // 2565 / 2700 = 95%
  });

  test('TC-11.4 history lists one row per title, most recent first, with percent watched', async () => {
    await progress(1, 270);
    ctx.advance(1);
    await progress(4, 60);
    ctx.advance(1);
    await progress(1, 1350);
    const h = await history();
    expect(h.map((r) => r.titleId)).toEqual([1, 4]);
    expect(h[0]).toMatchObject({ titleId: 1, positionSeconds: 1350, percent: 50 });
    ['name', 'posterUrl', 'durationSeconds', 'updatedAt'].forEach((k) => expect(h[0]).toHaveProperty(k));
  });

  test('TC-11.5 continue watching shows only started, unfinished titles, most recent first', async () => {
    await progress(1, 600);
    ctx.advance(1);
    await progress(4, 0);
    const finishedId = 7;
    await progress(finishedId, 999999);
    const c = await cont();
    expect(c.map((r) => r.titleId)).toEqual([1]);
  });

  test('TC-11.6 progress needs the same access as playback (login, plan, tier)', async () => {
    expect((await request(ctx.app).post('/api/titles/1/progress').send({ positionSeconds: 10 })).status).toBe(401);
    const noPlan = await ctx.login('user@streamhub.test', 'User1234');
    expect((await progress(1, 10, noPlan)).status).toBe(402);
    expect((await progress(3, 10)).status).toBe(403); // title 3 is Premium
    expect((await progress(999, 10)).status).toBe(404);
  });

  test('TC-11.7 history is private to each user', async () => {
    await progress(1, 600);
    const other = await ctx.login('admin@streamhub.test', 'Admin123');
    expect((await request(ctx.app).get('/api/history').set(auth(other))).body).toHaveLength(0);
  });
});
