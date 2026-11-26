// Story 23 acceptance tests: seasons and episodes (FR-2.3)
// Seed data: titles 1, 4, 7 are Basic shows with 2 seasons of 3 episodes; title 2 is a movie.
const { setup, request } = require('./helpers');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Story 23: Seasons and episodes', () => {
  let ctx, cm;
  const episodes = async (id) => request(ctx.app).get(`/api/titles/${id}/episodes`);
  const add = (id, body, token = cm) => request(ctx.app).post(`/api/titles/${id}/episodes`).set(auth(token)).send(body);
  const episodeId = (titleId, season, episode) => ctx.db.prepare('SELECT id FROM episodes WHERE title_id = ? AND season = ? AND episode = ?').get(titleId, season, episode).id;

  beforeEach(async () => {
    ctx = setup(9);
    cm = await ctx.login('content@streamhub.test', 'Content123');
  });

  test('TC-23.1 a show lists its seasons and episodes in order; movies have none', async () => {
    const res = await episodes(1);
    expect(res.status).toBe(200);
    expect(res.body.seasons.map((s) => s.season)).toEqual([1, 2]);
    expect(res.body.seasons[0].episodes.map((e) => e.episode)).toEqual([1, 2, 3]);
    expect(res.body.seasons[0].episodes[0]).toMatchObject({ name: 'Pilot', runtime: 45 });
    expect((await episodes(2)).body.seasons).toEqual([]);
    expect((await episodes(999)).status).toBe(404);
  });

  test('TC-23.2 content managers add an episode and it appears in the right place', async () => {
    const res = await add(1, { season: 1, episode: 4, name: 'Bonus', runtime: 50 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ season: 1, episode: 4, name: 'Bonus', runtime: 50 });
    const season1 = (await episodes(1)).body.seasons[0].episodes;
    expect(season1.map((e) => e.name)).toEqual(['Pilot', 'The Signal', 'Crossing Over', 'Bonus']);
    await add(1, { season: 3, episode: 1, name: 'New Season' });
    expect((await episodes(1)).body.seasons.map((s) => s.season)).toEqual([1, 2, 3]);
  });

  test('TC-23.3 only staff can add episodes', async () => {
    const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
    expect((await add(1, { season: 3, episode: 1, name: 'X' }, basic)).status).toBe(403);
    expect((await request(ctx.app).post('/api/titles/1/episodes').send({ season: 3, episode: 1, name: 'X' })).status).toBe(401);
  });

  test('TC-23.4 episode input is validated; duplicates and movies are rejected', async () => {
    expect((await add(1, { season: 0, episode: 1, name: 'X' })).status).toBe(400);
    expect((await add(1, { season: 1, episode: 1.5, name: 'X' })).status).toBe(400);
    expect((await add(1, { season: 3, episode: 1, name: '' })).status).toBe(400);
    expect((await add(1, { season: 3, episode: 1, name: 'X', runtime: 0 })).status).toBe(400);
    expect((await add(1, { season: 1, episode: 1, name: 'Again' })).status).toBe(409);
    const movie = await add(2, { season: 1, episode: 1, name: 'X' });
    expect(movie.status).toBe(400);
    expect(movie.body.error).toBe('Episodes can only be added to shows');
  });

  test('TC-23.5 staff delete an episode', async () => {
    const id = episodeId(1, 2, 3);
    expect((await request(ctx.app).delete(`/api/titles/1/episodes/${id}`).set(auth(cm))).status).toBe(204);
    expect((await episodes(1)).body.seasons[1].episodes).toHaveLength(2);
    expect((await request(ctx.app).delete(`/api/titles/1/episodes/${id}`).set(auth(cm))).status).toBe(404);
  });

  test('TC-23.6 watching an episode saves its progress and Continue Watching shows that episode', async () => {
    const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
    const id = episodeId(1, 1, 2);
    const res = await request(ctx.app).post(`/api/titles/1/episodes/${id}/progress`).set(auth(basic)).send({ positionSeconds: 900 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ episodeId: id, positionSeconds: 900, durationSeconds: 2700, completed: false });
    const progress = (await request(ctx.app).get('/api/titles/1/episodes/progress').set(auth(basic))).body;
    expect(progress).toEqual([expect.objectContaining({ episodeId: id, positionSeconds: 900 })]);
    const [row] = (await request(ctx.app).get('/api/history/continue').set(auth(basic))).body;
    expect(row).toMatchObject({ titleId: 1, percent: 33, lastEpisode: { season: 1, episode: 2, name: 'The Signal' } });
  });

  test('TC-23.7 episode progress is clamped and 95% marks it completed', async () => {
    const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
    const id = episodeId(4, 1, 1);
    const post = (positionSeconds) => request(ctx.app).post(`/api/titles/4/episodes/${id}/progress`).set(auth(basic)).send({ positionSeconds });
    expect((await post(-10)).body.positionSeconds).toBe(0);
    const done = await post(99999);
    expect(done.body).toMatchObject({ positionSeconds: 2700, completed: true });
    expect((await post('abc')).status).toBe(400);
  });

  test('TC-23.8 episodes follow the same access rules as playback', async () => {
    const id = episodeId(1, 1, 1);
    const noPlan = await ctx.login('user@streamhub.test', 'User1234');
    expect((await request(ctx.app).post(`/api/titles/1/episodes/${id}/progress`).send({ positionSeconds: 1 })).status).toBe(401);
    expect((await request(ctx.app).post(`/api/titles/1/episodes/${id}/progress`).set(auth(noPlan)).send({ positionSeconds: 1 })).status).toBe(402);
    const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
    // an episode id that belongs to another show
    expect((await request(ctx.app).post(`/api/titles/4/episodes/${id}/progress`).set(auth(basic)).send({ positionSeconds: 1 })).status).toBe(404);
  });
});
