// Story 14 acceptance tests: Admin manages users and subscriptions (FR-6.1, FR-6.2, FR-6.3)
const { setup, request } = require('./helpers');
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const GOOD = { name: 'Demo User', number: '4242 4242 4242 4242', expMonth: 12, expYear: 2030, cvv: '123' };

describe('Story 14: Admin manages users and subscriptions', () => {
  let ctx, admin;
  const userId = (email) => ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;

  beforeEach(async () => {
    ctx = setup(5);
    admin = await ctx.login('admin@streamhub.test', 'Admin123');
  });

  test('TC-14.1 admin lists and searches users, with each user\'s plan and status', async () => {
    const all = await request(ctx.app).get('/api/admin/users').set(auth(admin));
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThanOrEqual(4);
    const found = (await request(ctx.app).get('/api/admin/users?q=basic').set(auth(admin))).body;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ email: 'basic@streamhub.test', role: 'subscriber', active: true });
    expect(found[0].subscription).toMatchObject({ plan: 'basic', status: 'active' });
    expect(found[0]).not.toHaveProperty('password_hash');
  });

  test('TC-14.2 only admins can use admin endpoints (content managers and subscribers get 403)', async () => {
    const cm = await ctx.login('content@streamhub.test', 'Content123');
    const sub = await ctx.login('user@streamhub.test', 'User1234');
    expect((await request(ctx.app).get('/api/admin/users').set(auth(cm))).status).toBe(403);
    expect((await request(ctx.app).get('/api/admin/users').set(auth(sub))).status).toBe(403);
    expect((await request(ctx.app).get('/api/admin/users')).status).toBe(401);
  });

  test('TC-14.3 a deactivated user cannot log in or use an old session; reactivating restores access', async () => {
    const oldToken = await ctx.login('user@streamhub.test', 'User1234');
    const id = userId('user@streamhub.test');
    expect((await request(ctx.app).patch(`/api/admin/users/${id}`).set(auth(admin)).send({ active: false })).status).toBe(200);
    const login = await request(ctx.app).post('/api/auth/login').send({ email: 'user@streamhub.test', password: 'User1234' });
    expect(login.status).toBe(403);
    expect((await request(ctx.app).get('/api/auth/me').set(auth(oldToken))).status).toBe(403);
    await request(ctx.app).patch(`/api/admin/users/${id}`).set(auth(admin)).send({ active: true });
    expect(await ctx.login('user@streamhub.test', 'User1234')).toBeTruthy();
  });

  test('TC-14.4 admin changes a role; invalid roles and deactivating yourself are rejected', async () => {
    const id = userId('user@streamhub.test');
    const res = await request(ctx.app).patch(`/api/admin/users/${id}`).set(auth(admin)).send({ role: 'content_manager' });
    expect(res.body).toMatchObject({ role: 'content_manager' });
    expect((await request(ctx.app).patch(`/api/admin/users/${id}`).set(auth(admin)).send({ role: 'king' })).status).toBe(400);
    const me = userId('admin@streamhub.test');
    expect((await request(ctx.app).patch(`/api/admin/users/${me}`).set(auth(admin)).send({ active: false })).status).toBe(400);
    expect((await request(ctx.app).patch('/api/admin/users/9999').set(auth(admin)).send({ active: false })).status).toBe(404);
  });

  test('TC-14.5 admin extends a user\'s current billing period by 1 to 90 days', async () => {
    const id = userId('basic@streamhub.test');
    const before = new Date(ctx.db.prepare('SELECT period_end FROM subscriptions WHERE user_id = ?').get(id).period_end);
    const res = await request(ctx.app).post(`/api/admin/users/${id}/subscription/extend`).set(auth(admin)).send({ days: 7 });
    expect(res.status).toBe(200);
    expect(new Date(res.body.subscription.periodEnd).getTime()).toBe(before.getTime() + 7 * 86400000);
    expect((await request(ctx.app).post(`/api/admin/users/${id}/subscription/extend`).set(auth(admin)).send({ days: 0 })).status).toBe(400);
    expect((await request(ctx.app).post(`/api/admin/users/${id}/subscription/extend`).set(auth(admin)).send({ days: 91 })).status).toBe(400);
    const noPlan = userId('user@streamhub.test');
    expect((await request(ctx.app).post(`/api/admin/users/${noPlan}/subscription/extend`).set(auth(admin)).send({ days: 7 })).status).toBe(404);
  });

  test('TC-14.6 admin cancels a user\'s subscription; access continues to the end of the period', async () => {
    const id = userId('basic@streamhub.test');
    const res = await request(ctx.app).post(`/api/admin/users/${id}/subscription/cancel`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe('cancelled');
  });

  test('TC-14.7 admin changes a plan price; new subscriptions pay the new price', async () => {
    const res = await request(ctx.app).put('/api/admin/plans/standard').set(auth(admin)).send({ priceCents: 1499 });
    expect(res.status).toBe(200);
    expect((await request(ctx.app).get('/api/plans')).body.find((p) => p.code === 'standard').price_cents).toBe(1499);
    const user = await ctx.login('user@streamhub.test', 'User1234');
    await request(ctx.app).post('/api/subscription').set(auth(user)).send({ planCode: 'standard', card: GOOD });
    const paid = ctx.db.prepare("SELECT amount_cents FROM payments p JOIN users u ON u.id = p.user_id WHERE u.email = 'user@streamhub.test'").get();
    expect(paid.amount_cents).toBe(1499);
    for (const priceCents of [0, -5, 9.99, 'free']) {
      expect((await request(ctx.app).put('/api/admin/plans/standard').set(auth(admin)).send({ priceCents })).status).toBe(400);
    }
    expect((await request(ctx.app).put('/api/admin/plans/gold').set(auth(admin)).send({ priceCents: 999 })).status).toBe(404);
  });
});
