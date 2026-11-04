// Story 12 acceptance tests: Ratings and reviews (FR-5.4, FR-5.5, FR-6.4)
const { setup, request } = require('./helpers');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Story 12: Ratings and reviews', () => {
  let ctx, user, basic;
  const review = (id, body, token = user) => request(ctx.app).put(`/api/titles/${id}/review`).set(auth(token)).send(body);
  const reviews = async (id) => (await request(ctx.app).get(`/api/titles/${id}/reviews`)).body;

  beforeEach(async () => {
    ctx = setup(9);
    user = await ctx.login('user@streamhub.test', 'User1234');
    basic = await ctx.login('basic@streamhub.test', 'Basic1234');
  });

  test('TC-12.1 a user rates and reviews a title', async () => {
    const res = await review(2, { rating: 4, body: 'Great pacing.' });
    expect(res.status).toBe(201);
    const r = await reviews(2);
    expect(r).toMatchObject({ average: 4, count: 1 });
    expect(r.reviews[0]).toMatchObject({ rating: 4, body: 'Great pacing.', displayName: 'Demo User' });
  });

  test('TC-12.2 one review per user per title; a second save updates it', async () => {
    await review(2, { rating: 2, body: 'Meh.' });
    const res = await review(2, { rating: 5, body: 'Changed my mind.' });
    expect(res.status).toBe(200);
    const r = await reviews(2);
    expect(r.count).toBe(1);
    expect(r.reviews[0]).toMatchObject({ rating: 5, body: 'Changed my mind.' });
  });

  test('TC-12.3 average is recalculated and rounded to 1 decimal', async () => {
    await review(2, { rating: 5, body: '' });
    await review(2, { rating: 4, body: '' }, basic);
    const admin = await ctx.login('admin@streamhub.test', 'Admin123');
    await review(2, { rating: 4, body: '' }, admin);
    expect((await reviews(2)).average).toBe(4.3); // 13 / 3
  });

  test('TC-12.4 rating must be a whole number 1 to 5, and the review at most 1000 characters', async () => {
    for (const rating of [0, 6, 3.5, 'five']) expect((await review(2, { rating, body: '' })).status).toBe(400);
    expect((await review(2, { rating: 3, body: 'x'.repeat(1001) })).status).toBe(400);
  });

  test('TC-12.5 a user deletes their own review and the average updates', async () => {
    await review(2, { rating: 1, body: '' });
    await review(2, { rating: 5, body: '' }, basic);
    expect((await request(ctx.app).delete('/api/titles/2/review').set(auth(user))).status).toBe(204);
    expect(await reviews(2)).toMatchObject({ average: 5, count: 1 });
    expect((await request(ctx.app).delete('/api/titles/2/review').set(auth(user))).status).toBe(404);
  });

  test('TC-12.6 no reviews means average null and an empty list; anyone can read reviews', async () => {
    const r = await request(ctx.app).get('/api/titles/3/reviews');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ average: null, count: 0, reviews: [] });
    expect((await request(ctx.app).get('/api/titles/999/reviews')).status).toBe(404);
  });

  test('TC-12.7 writing a review needs login', async () => {
    expect((await request(ctx.app).put('/api/titles/2/review').send({ rating: 4 })).status).toBe(401);
  });

  test('TC-12.8 admins and content managers can remove any review; subscribers cannot (FR-6.4)', async () => {
    await review(2, { rating: 1, body: 'Spam spam spam' });
    const id = (await reviews(2)).reviews[0].id;
    expect((await request(ctx.app).delete(`/api/reviews/${id}`).set(auth(basic))).status).toBe(403);
    const cm = await ctx.login('content@streamhub.test', 'Content123');
    expect((await request(ctx.app).delete(`/api/reviews/${id}`).set(auth(cm))).status).toBe(204);
    expect((await reviews(2)).count).toBe(0);
  });
});
