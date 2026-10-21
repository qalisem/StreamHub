const { setup, request } = require('./helpers');
const { luhn } = require('../src/payments');

const GOOD = { name: 'Demo User', number: '4242 4242 4242 4242', expMonth: 12, expYear: 2028, cvv: '123' };
const DECLINE = { ...GOOD, number: '4000000000000002' };
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Story 6: View plans', () => {
  test('TC-6.1 lists 3 plans with price, quality and screens, no login needed', async () => {
    const { app } = setup(1);
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.code)).toEqual(['basic', 'standard', 'premium']);
    res.body.forEach((p) => ['price_cents', 'quality', 'screens'].forEach((k) => expect(p).toHaveProperty(k)));
  });
});

describe('Story 7: Subscribe with mock payment', () => {
  let ctx, user;
  beforeEach(async () => { ctx = setup(5); user = await ctx.login('user@streamhub.test', 'User1234'); });
  const subscribe = (card = GOOD, planCode = 'standard') =>
    request(ctx.app).post('/api/subscription').set(auth(user)).send({ planCode, card });

  test('TC-7.1 successful payment activates the plan', async () => {
    const res = await subscribe();
    expect(res.status).toBe(201);
    expect(res.body.subscription).toMatchObject({ status: 'active', cardLast4: '4242' });
    expect(res.body.subscription.plan.code).toBe('standard');
  });

  test('TC-7.2 declined card does not activate a plan but is recorded', async () => {
    const res = await subscribe(DECLINE);
    expect(res.status).toBe(402);
    const sub = await request(ctx.app).get('/api/subscription').set(auth(user));
    expect(sub.body.subscription).toBeNull();
    expect(ctx.db.prepare("SELECT COUNT(*) n FROM payments WHERE status = 'declined'").get().n).toBe(1);
  });

  test.each([
    [{ ...GOOD, number: '4242424242424241' }, /Card number/],
    [{ ...GOOD, expMonth: 13 }, /month/],
    [{ ...GOOD, expYear: 2020 }, /expired/],
    [{ ...GOOD, cvv: '12' }, /CVV/],
    [{ ...GOOD, name: '' }, /Name/],
  ])('TC-7.3 rejects invalid card details (%#)', async (card, msg) => {
    const res = await subscribe(card);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(msg);
  });

  test('TC-7.4 only one active subscription per user', async () => {
    await subscribe();
    expect((await subscribe(GOOD, 'premium')).status).toBe(409);
  });

  test('TC-7.5 only the last 4 digits are stored, never the full number or CVV', async () => {
    await subscribe();
    const dump = JSON.stringify([ctx.db.prepare('SELECT * FROM subscriptions').all(), ctx.db.prepare('SELECT * FROM payments').all()]);
    expect(dump).not.toContain('4242424242424242');
    expect(dump).not.toContain('"123"');
  });

  test('TC-7.6 a payment record is created with the plan price', async () => {
    await subscribe();
    const p = ctx.db.prepare("SELECT p.* FROM payments p JOIN users u ON u.id = p.user_id WHERE u.email = 'user@streamhub.test'").get();
    expect(p).toMatchObject({ amount_cents: 1399, status: 'succeeded', card_last4: '4242' });
  });

  test('TC-7.7 must be logged in and pick a valid plan', async () => {
    expect((await request(ctx.app).post('/api/subscription').send({ planCode: 'basic', card: GOOD })).status).toBe(401);
    expect((await subscribe(GOOD, 'gold')).status).toBe(400);
  });

  test('TC-7.8 Luhn check works on known numbers', () => {
    expect(luhn('4242424242424242')).toBe(true);
    expect(luhn('5555555555554444')).toBe(true);
    expect(luhn('1234567812345678')).toBe(false);
  });
});

describe('Story 8: Upgrade, downgrade, cancel', () => {
  let ctx, user;
  const change = (planCode) => request(ctx.app).post('/api/subscription/change').set(auth(user)).send({ planCode });
  const current = async () => (await request(ctx.app).get('/api/subscription').set(auth(user))).body.subscription;
  beforeEach(async () => {
    ctx = setup(5);
    user = await ctx.login('user@streamhub.test', 'User1234');
    await request(ctx.app).post('/api/subscription').set(auth(user)).send({ planCode: 'standard', card: GOOD });
  });

  test('TC-8.1 upgrade applies now with a prorated charge', async () => {
    ctx.advance(15); // half way through the 30-day cycle
    const res = await change('premium');
    expect(res.status).toBe(200);
    expect(res.body.subscription.plan.code).toBe('premium');
    expect(res.body.chargedCents).toBe(250); // ($18.99 - $13.99) x 15/30
  });

  test('TC-8.2 downgrade waits until the end of the billing cycle', async () => {
    const res = await change('basic');
    expect(res.body.subscription.plan.code).toBe('standard');
    expect(res.body.subscription.pendingPlan.code).toBe('basic');
    ctx.advance(31);
    expect((await current()).plan.code).toBe('basic');
  });

  test('TC-8.3 choosing the current plan undoes a pending downgrade', async () => {
    await change('basic');
    const res = await change('standard');
    expect(res.body.subscription.pendingPlan).toBeNull();
  });

  test('TC-8.4 cancel keeps access until the period ends, then expires', async () => {
    const res = await request(ctx.app).post('/api/subscription/cancel').set(auth(user));
    expect(res.body.subscription.status).toBe('cancelled');
    ctx.advance(10);
    expect((await current()).status).toBe('cancelled');
    ctx.advance(25);
    expect(await current()).toBeNull();
    expect(ctx.db.prepare("SELECT s.status FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE u.email = 'user@streamhub.test'").get().status).toBe('expired');
  });

  test('TC-8.5 cannot change or cancel without an active plan', async () => {
    await request(ctx.app).post('/api/subscription/cancel').set(auth(user));
    expect((await change('premium')).status).toBe(400);
    expect((await request(ctx.app).post('/api/subscription/cancel').set(auth(user))).status).toBe(400);
  });

  test('TC-8.6 can subscribe again after the old plan expires', async () => {
    await request(ctx.app).post('/api/subscription/cancel').set(auth(user));
    ctx.advance(31);
    const res = await request(ctx.app).post('/api/subscription').set(auth(user)).send({ planCode: 'basic', card: GOOD });
    expect(res.status).toBe(201);
  });
});

describe('Story 9: Content restricted by plan tier', () => {
  let ctx;
  beforeAll(() => { ctx = setup(9); }); // titles 1,4,7 basic; 2,5,8 standard; 3,6,9 premium
  const play = async (email, pw, id) => request(ctx.app).post(`/api/titles/${id}/play`).set(auth(await ctx.login(email, pw)));

  test('TC-9.1 no subscription means no playback', async () => {
    const res = await play('user@streamhub.test', 'User1234', 1);
    expect(res.status).toBe(402);
  });

  test('TC-9.2 Basic plan plays basic titles only', async () => {
    expect((await play('basic@streamhub.test', 'Basic1234', 1)).status).toBe(200);
    const res = await play('basic@streamhub.test', 'Basic1234', 3);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ requiredTier: 'premium', currentPlan: 'basic' });
  });

  test('TC-9.3 Premium plan plays every tier', async () => {
    const token = await ctx.login('user@streamhub.test', 'User1234');
    await request(ctx.app).post('/api/subscription').set(auth(token)).send({ planCode: 'premium', card: GOOD });
    for (const id of [1, 2, 3]) {
      expect((await request(ctx.app).post(`/api/titles/${id}/play`).set(auth(token))).status).toBe(200);
    }
  });

  test('TC-9.4 visitors must log in, staff can preview any title', async () => {
    expect((await request(ctx.app).post('/api/titles/3/play')).status).toBe(401);
    expect((await play('admin@streamhub.test', 'Admin123', 3)).status).toBe(200);
  });
});

describe('Story 22: Edit profile and change password', () => {
  let ctx, user;
  beforeEach(async () => { ctx = setup(1); user = await ctx.login('user@streamhub.test', 'User1234'); });

  test('TC-22.1 updates display name', async () => {
    const res = await request(ctx.app).put('/api/auth/me').set(auth(user)).send({ displayName: 'Movie Fan' });
    expect(res.body.user.displayName).toBe('Movie Fan');
    expect((await request(ctx.app).put('/api/auth/me').set(auth(user)).send({ displayName: '  ' })).status).toBe(400);
  });

  test('TC-22.2 password change needs the current password', async () => {
    const bad = await request(ctx.app).put('/api/auth/password').set(auth(user)).send({ currentPassword: 'nope1234', newPassword: 'NewPass99' });
    expect(bad.status).toBe(400);
    const ok = await request(ctx.app).put('/api/auth/password').set(auth(user)).send({ currentPassword: 'User1234', newPassword: 'NewPass99' });
    expect(ok.status).toBe(200);
    expect(await ctx.login('user@streamhub.test', 'NewPass99')).toBeTruthy();
    expect(await ctx.login('user@streamhub.test', 'User1234')).toBeUndefined();
  });

  test('TC-22.3 new password must meet the rules', async () => {
    const res = await request(ctx.app).put('/api/auth/password').set(auth(user)).send({ currentPassword: 'User1234', newPassword: 'short' });
    expect(res.status).toBe(400);
  });
});
