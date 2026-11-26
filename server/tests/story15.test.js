// Story 15 acceptance tests: email notifications and password reset (FR-1.5, FR-7.1, FR-7.2, FR-7.3)
const { setup, request } = require('./helpers');
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const DAY = 86400000;

describe('Story 15: Email notifications and password reset', () => {
  let ctx;
  const outbox = (email) => ctx.db.prepare('SELECT * FROM email_outbox WHERE to_email = ? ORDER BY id').all(email);
  const tokenFrom = (body) => body.match(/token=([a-f0-9]{64})/)[1];
  const userId = (email) => ctx.db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  // Move the Basic subscriber's renewal date relative to the test clock
  const renewIn = (days) => ctx.db.prepare('UPDATE subscriptions SET period_end = ?, reminder_sent_for = NULL WHERE user_id = ?')
    .run(new Date(ctx.clock.t.getTime() + days * DAY).toISOString(), userId('basic@streamhub.test'));
  const readSubscription = async (token) => request(ctx.app).get('/api/subscription').set(auth(token));

  beforeEach(() => { ctx = setup(5); });

  describe('Password reset (FR-1.5)', () => {
    const forgot = (email) => request(ctx.app).post('/api/auth/forgot').send({ email });
    const reset = (token, password) => request(ctx.app).post('/api/auth/reset').send({ token, password });

    test('TC-15.1 a reset link is emailed and the new password works; the old one stops working', async () => {
      const res = await forgot('user@streamhub.test');
      expect(res.status).toBe(200);
      const mail = outbox('user@streamhub.test').find((m) => m.template === 'password_reset');
      expect(mail.subject).toBe('Reset your StreamHub password');
      expect((await reset(tokenFrom(mail.body), 'NewPass99')).status).toBe(200);
      expect(await ctx.login('user@streamhub.test', 'NewPass99')).toBeTruthy();
      expect(await ctx.login('user@streamhub.test', 'User1234')).toBeUndefined();
      expect(outbox('user@streamhub.test').some((m) => m.template === 'password_changed')).toBe(true);
    });

    test('TC-15.2 unknown emails get the same answer and no email is sent', async () => {
      const known = await forgot('user@streamhub.test');
      const unknown = await forgot('nobody@streamhub.test');
      expect(unknown.status).toBe(200);
      expect(unknown.body.message).toBe(known.body.message);
      expect(outbox('nobody@streamhub.test')).toHaveLength(0);
      expect((await forgot('not-an-email')).status).toBe(400);
    });

    test('TC-15.3 a reset link works only once', async () => {
      await forgot('user@streamhub.test');
      const token = tokenFrom(outbox('user@streamhub.test')[0].body);
      expect((await reset(token, 'NewPass99')).status).toBe(200);
      expect((await reset(token, 'Another99')).status).toBe(400);
    });

    test('TC-15.4 a reset link expires after 30 minutes', async () => {
      await forgot('user@streamhub.test');
      const token = tokenFrom(outbox('user@streamhub.test')[0].body);
      ctx.clock.t = new Date(ctx.clock.t.getTime() + 31 * 60000);
      const res = await reset(token, 'NewPass99');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid or has expired/);
    });

    test('TC-15.5 the new password must meet the password rule; the link stays usable after a rejected try', async () => {
      await forgot('user@streamhub.test');
      const token = tokenFrom(outbox('user@streamhub.test')[0].body);
      expect((await reset(token, 'short')).status).toBe(400);
      expect((await reset(token, 'NewPass99')).status).toBe(200);
    });

    test('TC-15.6 using one link cancels the other open links; tokens are stored only as hashes', async () => {
      await forgot('user@streamhub.test');
      await forgot('user@streamhub.test');
      const [first, second] = outbox('user@streamhub.test').map((m) => tokenFrom(m.body));
      expect((await reset(second, 'NewPass99')).status).toBe(200);
      expect((await reset(first, 'Another99')).status).toBe(400);
      const stored = ctx.db.prepare('SELECT token_hash FROM password_resets').all().map((r) => r.token_hash);
      expect(stored).not.toContain(first);
    });

    test('TC-15.7 deactivated accounts do not get reset emails', async () => {
      ctx.db.prepare("UPDATE users SET active = 0 WHERE email = 'user@streamhub.test'").run();
      await forgot('user@streamhub.test');
      expect(outbox('user@streamhub.test')).toHaveLength(0);
    });
  });

  describe('Notifications (FR-7.1 to FR-7.3)', () => {
    test('TC-15.8 a welcome email is sent on registration', async () => {
      await request(ctx.app).post('/api/auth/register').send({ email: 'new@streamhub.test', password: 'Welcome123', displayName: 'Nadia' });
      const [mail] = outbox('new@streamhub.test');
      expect(mail).toMatchObject({ template: 'welcome', subject: 'Welcome to StreamHub' });
      expect(mail.body).toContain('Hi Nadia');
    });

    test('TC-15.9 one renewal reminder 3 days before renewal, with plan, amount, and date', async () => {
      const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
      renewIn(4);
      await readSubscription(basic);
      expect(outbox('basic@streamhub.test').filter((m) => m.template === 'renewal_reminder')).toHaveLength(0);
      renewIn(2);
      await readSubscription(basic);
      await readSubscription(basic);
      const reminders = outbox('basic@streamhub.test').filter((m) => m.template === 'renewal_reminder');
      expect(reminders).toHaveLength(1);
      const renewsOn = new Date(ctx.clock.t.getTime() + 2 * DAY).toISOString().slice(0, 10);
      expect(reminders[0].subject).toBe(`Your Basic plan renews on ${renewsOn}`);
      expect(reminders[0].body).toContain('$8.99');
    });

    test('TC-15.10 the next billing period gets its own reminder', async () => {
      const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
      renewIn(1);
      await readSubscription(basic);
      ctx.advance(28); // renewed on day 1, next renewal is day 31, so day 28 is inside the 3 day window
      await readSubscription(basic);
      expect(outbox('basic@streamhub.test').filter((m) => m.template === 'renewal_reminder')).toHaveLength(2);
    });

    test('TC-15.11 the reminder shows the new plan and price when a downgrade is pending', async () => {
      const user = await ctx.login('user@streamhub.test', 'User1234');
      const card = { name: 'Demo User', number: '4242 4242 4242 4242', expMonth: 12, expYear: 2030, cvv: '123' };
      await request(ctx.app).post('/api/subscription').set(auth(user)).send({ planCode: 'premium', card });
      await request(ctx.app).post('/api/subscription/change').set(auth(user)).send({ planCode: 'basic' });
      ctx.advance(28);
      await readSubscription(user);
      const reminder = outbox('user@streamhub.test').find((m) => m.template === 'renewal_reminder');
      expect(reminder.subject).toMatch(/^Your Basic plan renews on/);
      expect(reminder.body).toContain('$8.99');
    });

    test('TC-15.12 cancelling sends a confirmation with the last day of access, and expiry sends another', async () => {
      const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
      renewIn(10);
      await request(ctx.app).post('/api/subscription/cancel').set(auth(basic));
      const lastDay = new Date(ctx.clock.t.getTime() + 10 * DAY).toISOString().slice(0, 10);
      const cancel = outbox('basic@streamhub.test').find((m) => m.template === 'cancellation');
      expect(cancel.body).toContain(`until ${lastDay}`);
      ctx.advance(11);
      await readSubscription(basic);
      expect(outbox('basic@streamhub.test').some((m) => m.template === 'expiry')).toBe(true);
    });

    test('TC-15.13 a failed renewal sends a payment failed email', async () => {
      const basic = await ctx.login('basic@streamhub.test', 'Basic1234');
      ctx.db.prepare("UPDATE subscriptions SET card_last4 = '0341' WHERE user_id = ?").run(userId('basic@streamhub.test'));
      renewIn(1);
      ctx.advance(2);
      await readSubscription(basic);
      const mail = outbox('basic@streamhub.test').find((m) => m.template === 'payment_failed');
      expect(mail.body).toContain('card ending 0341');
    });

    test('TC-15.14 admins can read the email outbox; other roles cannot', async () => {
      await request(ctx.app).post('/api/auth/forgot').send({ email: 'user@streamhub.test' });
      const admin = await ctx.login('admin@streamhub.test', 'Admin123');
      const res = await request(ctx.app).get('/api/admin/emails?to=user@').set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body[0]).toMatchObject({ toEmail: 'user@streamhub.test', template: 'password_reset' });
      const user = await ctx.login('user@streamhub.test', 'User1234');
      expect((await request(ctx.app).get('/api/admin/emails').set(auth(user))).status).toBe(403);
    });
  });
});
