// Unit tests: refreshSubscription() state rules (FR-3.4, FR-3.6, FR-4.3), called directly on an in-memory database.
const { createDb } = require('../../src/db');
const { seed } = require('../../src/seed');
const { refreshSubscription } = require('../../src/billing');

const DAY = 86400000;
const T0 = new Date('2026-10-15T12:00:00Z');
const at = (days) => () => new Date(T0.getTime() + days * DAY);

let db, userId;
const sub = () => db.prepare("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY id DESC").get(userId);
const renewals = () => db.prepare("SELECT * FROM payments WHERE user_id = ? AND kind = 'renewal' ORDER BY id").all(userId);
const set = (sql, ...args) => db.prepare(`UPDATE subscriptions SET ${sql} WHERE user_id = ?`).run(...args, userId);

beforeEach(() => {
  db = createDb(':memory:');
  seed(db, 3, { now: () => T0 });
  userId = db.prepare("SELECT id FROM users WHERE email = 'basic@streamhub.test'").get().id;
});

test('before the period ends nothing changes and no charge is made', () => {
  const s = refreshSubscription(db, userId, at(29));
  expect(s.status).toBe('active');
  expect(renewals()).toHaveLength(0);
});

test('at the period end the plan renews once and the period moves 30 days', () => {
  const before = new Date(sub().period_end).getTime();
  const s = refreshSubscription(db, userId, at(30));
  expect(new Date(s.period_end).getTime()).toBe(before + 30 * DAY);
  expect(renewals()).toHaveLength(1);
  expect(renewals()[0]).toMatchObject({ status: 'succeeded', amount_cents: 899, plan_code: 'basic' });
});

test('calling it again at the same time does not charge twice', () => {
  refreshSubscription(db, userId, at(30));
  refreshSubscription(db, userId, at(30));
  refreshSubscription(db, userId, at(31));
  expect(renewals()).toHaveLength(1);
});

test('catches up one renewal per missed period', () => {
  refreshSubscription(db, userId, at(95));
  expect(renewals()).toHaveLength(3);
  expect(renewals().map((p) => p.created_at)).toEqual([30, 60, 90].map((d) => at(d)().toISOString()));
});

test('a declined renewal sets past_due and records the decline', () => {
  set("card_last4 = '0341'");
  const s = refreshSubscription(db, userId, at(30));
  expect(s.status).toBe('past_due');
  expect(renewals()).toEqual([expect.objectContaining({ status: 'declined' })]);
});

test('past_due does not retry on later reads', () => {
  set("card_last4 = '0341'");
  refreshSubscription(db, userId, at(30));
  refreshSubscription(db, userId, at(70));
  expect(renewals()).toHaveLength(1);
});

test('a pending downgrade applies before the renewal charge', () => {
  set("plan_code = 'premium', pending_plan_code = 'basic'");
  const s = refreshSubscription(db, userId, at(30));
  expect(s.plan_code).toBe('basic');
  expect(s.pending_plan_code).toBeNull();
  expect(renewals()[0].amount_cents).toBe(899);
});

test('a cancelled plan expires at the period end and is not charged', () => {
  set("status = 'cancelled'");
  expect(refreshSubscription(db, userId, at(30))).toBeNull();
  expect(sub().status).toBe('expired');
  expect(renewals()).toHaveLength(0);
});

test('a user with no subscription returns nothing', () => {
  const noPlan = db.prepare("SELECT id FROM users WHERE email = 'user@streamhub.test'").get().id;
  expect(refreshSubscription(db, noPlan, at(30))).toBeUndefined();
});
