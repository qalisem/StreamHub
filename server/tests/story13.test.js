// Story 13 acceptance tests: renewal, Past Due, billing history, receipts
// FR-3.6 (Past Due), FR-4.3 (renewal), FR-4.4 (billing history), FR-4.5 (receipts)
// Put this file in server/tests/. Uses the same helpers as Sprint 2.
const { setup, request } = require('./helpers');

const GOOD = { name: 'Demo User', number: '4242 4242 4242 4242', expMonth: 12, expYear: 2030, cvv: '123' };
const RENEWAL_FAILS = { ...GOOD, number: '4000 0000 0000 0341' }; // succeeds at checkout, declines on renewal
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Story 13: Renewal, Past Due, billing history, receipts', () => {
  let ctx, user;
  const sub = async () => (await request(ctx.app).get('/api/subscription').set(auth(user))).body.subscription;
  const payments = async () => (await request(ctx.app).get('/api/payments').set(auth(user))).body;
  const subscribe = (card = GOOD, planCode = 'standard') =>
    request(ctx.app).post('/api/subscription').set(auth(user)).send({ planCode, card });

  beforeEach(async () => {
    ctx = setup(9);
    user = await ctx.login('user@streamhub.test', 'User1234');
  });

  test('TC-13.1 an active plan renews at the end of the period: one charge, period moves 30 days', async () => {
    await subscribe();
    const firstEnd = new Date((await sub()).periodEnd);
    ctx.advance(31);
    const s = await sub();
    expect(s.status).toBe('active');
    expect(new Date(s.periodEnd).getTime()).toBe(firstEnd.getTime() + 30 * 86400000);
    const renewals = (await payments()).filter((p) => p.kind === 'renewal');
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ amountCents: 1399, status: 'succeeded' });
  });

  test('TC-13.2 reading the subscription many times never double-charges (Priya: no double charges)', async () => {
    await subscribe();
    ctx.advance(31);
    await sub(); await sub(); await payments();
    await request(ctx.app).post('/api/titles/1/play').set(auth(user));
    const renewals = (await payments()).filter((p) => p.kind === 'renewal');
    expect(renewals).toHaveLength(1);
  });

  test('TC-13.3 after 3 missed periods there are exactly 3 renewals', async () => {
    await subscribe();
    ctx.advance(91);
    await sub();
    expect((await payments()).filter((p) => p.kind === 'renewal')).toHaveLength(3);
  });

  test('TC-13.4 a pending downgrade applies first, then renews at the new price', async () => {
    await subscribe(GOOD, 'standard');
    await request(ctx.app).post('/api/subscription/change').set(auth(user)).send({ planCode: 'basic' });
    ctx.advance(31);
    expect((await sub()).plan.code).toBe('basic');
    const renewal = (await payments()).find((p) => p.kind === 'renewal');
    expect(renewal.amountCents).toBe(899);
  });

  test('TC-13.5 a failed renewal sets Past Due, records the decline, and blocks playback', async () => {
    await subscribe(RENEWAL_FAILS);
    ctx.advance(31);
    expect((await sub()).status).toBe('past_due');
    const declined = (await payments()).filter((p) => p.status === 'declined');
    expect(declined).toHaveLength(1);
    const play = await request(ctx.app).post('/api/titles/1/play').set(auth(user));
    expect(play.status).toBe(402);
  });

  test('TC-13.6 Past Due does not retry on every read (one decline per period)', async () => {
    await subscribe(RENEWAL_FAILS);
    ctx.advance(31);
    await sub(); await sub(); await sub();
    expect((await payments()).filter((p) => p.status === 'declined')).toHaveLength(1);
  });

  test('TC-13.7 updating the card on a Past Due plan charges it and reactivates for 30 days', async () => {
    await subscribe(RENEWAL_FAILS);
    ctx.advance(31);
    const res = await request(ctx.app).post('/api/subscription/retry').set(auth(user)).send({ card: GOOD });
    expect(res.status).toBe(200);
    expect(res.body.subscription).toMatchObject({ status: 'active', cardLast4: '4242' });
    expect((await request(ctx.app).post('/api/titles/1/play').set(auth(user))).status).toBe(200);
  });

  test('TC-13.8 retry is rejected when the plan is not Past Due', async () => {
    await subscribe();
    expect((await request(ctx.app).post('/api/subscription/retry').set(auth(user)).send({ card: GOOD })).status).toBe(400);
    const u2 = await ctx.login('basic@streamhub.test', 'Basic1234');
    expect((await request(ctx.app).post('/api/subscription/retry').set(auth(u2)).send({ card: GOOD })).status).toBe(400);
  });

  test('TC-13.9 a cancelled plan does not renew, it expires', async () => {
    await subscribe();
    await request(ctx.app).post('/api/subscription/cancel').set(auth(user));
    ctx.advance(31);
    expect(await sub()).toBeNull();
    expect((await payments()).filter((p) => p.kind === 'renewal')).toHaveLength(0);
  });

  test('TC-13.10 billing history lists only my payments, newest first, with the fields the UI needs', async () => {
    await subscribe();
    await request(ctx.app).post('/api/subscription/change').set(auth(user)).send({ planCode: 'premium' });
    const list = await payments();
    expect(list.length).toBe(2);
    expect(new Date(list[0].createdAt) >= new Date(list[1].createdAt)).toBe(true);
    ['id', 'createdAt', 'description', 'amountCents', 'status', 'cardLast4', 'planName', 'kind'].forEach((k) => expect(list[0]).toHaveProperty(k));
    expect(list.every((p) => p.cardLast4 === '4242')).toBe(true);
    expect((await request(ctx.app).get('/api/payments')).status).toBe(401);
  });

  test('TC-13.11 a receipt is available for my payment, and 404 for anyone else\'s (Priya: receipts)', async () => {
    await subscribe();
    const [p] = await payments();
    const mine = await request(ctx.app).get(`/api/payments/${p.id}`).set(auth(user));
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ id: p.id, amountCents: 1399, cardLast4: '4242', status: 'succeeded' });
    expect(mine.body.receiptNumber).toMatch(/^SH-\d{6}$/);
    const other = await ctx.login('basic@streamhub.test', 'Basic1234');
    expect((await request(ctx.app).get(`/api/payments/${p.id}`).set(auth(other))).status).toBe(404);
  });
});
