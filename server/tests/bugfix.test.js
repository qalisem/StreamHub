// Regression guard for the Sprint 2 code review finding: one shared state function
// The play endpoint must use the same subscription rules as /api/subscription (refactor in story 13).
const { setup, request } = require('./helpers');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Shared subscription state (refactor)', () => {
  test('TC-R.1 a Past Due subscriber cannot play, whichever endpoint reads the subscription first', async () => {
    const ctx = setup(5);
    const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
    ctx.db.prepare("UPDATE subscriptions SET status = 'past_due' WHERE user_id = (SELECT id FROM users WHERE email = 'basic@streamhub.test')").run();
    expect((await request(ctx.app).post('/api/titles/1/play').set(auth(basic))).status).toBe(402);
  });

  test('TC-R.2 the subscription rules live in one module, exported for reuse', () => {
    const billing = require('../src/billing');
    expect(typeof billing.refreshSubscription).toBe('function');
  });
});
