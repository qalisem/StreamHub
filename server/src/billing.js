const { renew } = require('./payments');

const DAY_MS = 86400000;
const CURRENT_SUBSCRIPTION_SQL = `SELECT
    s.*,
    p.name AS plan_name, p.price_cents, p.quality, p.screens, p.rank,
    pp.name AS pending_name, pp.price_cents AS pending_price_cents,
    pp.quality AS pending_quality, pp.screens AS pending_screens, pp.rank AS pending_rank
  FROM subscriptions s
  JOIN plans p ON p.code = s.plan_code
  LEFT JOIN plans pp ON pp.code = s.pending_plan_code
  WHERE s.user_id = ? AND s.status IN ('active','cancelled','past_due')`;

function refreshSubscription(db, userId, now = () => new Date()) {
  const findCurrent = db.prepare(CURRENT_SUBSCRIPTION_SQL);
  const refresh = db.transaction(() => {
    const currentTime = now();
    let subscription = findCurrent.get(userId);

    while (subscription && currentTime.getTime() >= new Date(subscription.period_end).getTime()) {
      if (subscription.status === 'cancelled') {
        db.prepare("UPDATE subscriptions SET status = 'expired' WHERE id = ?").run(subscription.id);
        return null;
      }
      if (subscription.status === 'past_due') return subscription;

      const renewalAt = new Date(subscription.period_end);
      if (subscription.pending_plan_code) {
        db.prepare(`UPDATE subscriptions
          SET plan_code = pending_plan_code, pending_plan_code = NULL
          WHERE id = ?`).run(subscription.id);
        subscription = findCurrent.get(userId);
      }

      const result = renew(subscription.card_last4);
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, kind, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'renewal', ?, ?)`)
        .run(userId, subscription.id, subscription.plan_code, subscription.price_cents,
          subscription.card_last4, result.status, `${subscription.plan_name} renewal`, renewalAt.toISOString());

      if (result.status === 'declined') {
        db.prepare("UPDATE subscriptions SET status = 'past_due' WHERE id = ?").run(subscription.id);
        return findCurrent.get(userId);
      }

      const nextPeriodEnd = new Date(renewalAt.getTime() + 30 * DAY_MS);
      db.prepare('UPDATE subscriptions SET period_end = ? WHERE id = ?')
        .run(nextPeriodEnd.toISOString(), subscription.id);
      subscription = findCurrent.get(userId);
    }

    return subscription;
  });

  return refresh();
}

module.exports = { refreshSubscription };
