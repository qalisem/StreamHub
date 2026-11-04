const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { charge } = require('../payments');
const { refreshSubscription } = require('../billing');

const DAY_MS = 86400000;

module.exports = (db, { now = () => new Date() } = {}) => {
  const router = express.Router();
  const getPlan = db.prepare('SELECT * FROM plans WHERE code = ?');

  const planJson = (code, name, priceCents, quality, screens, rank) => ({
    code, name, price_cents: priceCents, quality, screens, rank,
  });

  const serialize = (subscription) => {
    if (!subscription) return null;
    return {
      id: subscription.id,
      status: subscription.status,
      plan: planJson(subscription.plan_code, subscription.plan_name, subscription.price_cents,
        subscription.quality, subscription.screens, subscription.rank),
      cardLast4: subscription.card_last4,
      startedAt: subscription.started_at,
      periodEnd: subscription.period_end,
      cancelledAt: subscription.cancelled_at,
      pendingPlan: subscription.pending_plan_code
        ? planJson(subscription.pending_plan_code, subscription.pending_name, subscription.pending_price_cents,
          subscription.pending_quality, subscription.pending_screens, subscription.pending_rank)
        : null,
    };
  };

  const currentFor = (userId) => refreshSubscription(db, userId, now);

  router.get('/subscription', requireAuth, (req, res) => {
    res.json({ subscription: serialize(currentFor(req.user.id)) });
  });

  router.post('/subscription', requireAuth, (req, res) => {
    const plan = getPlan.get(String(req.body.planCode || '').toLowerCase());
    if (!plan) return res.status(400).json({ error: 'Choose a valid plan' });
    if (currentFor(req.user.id)) return res.status(409).json({ error: 'You already have a current plan' });

    let payment;
    try {
      payment = charge(req.body.card, now);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const createdAt = now();
    if (payment.status === 'declined') {
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, description, created_at)
        VALUES (?, NULL, ?, ?, ?, 'declined', ?, ?)`)
        .run(req.user.id, plan.code, plan.price_cents, payment.last4,
          `Declined ${plan.name} subscription`, createdAt.toISOString());
      return res.status(402).json({ error: 'Payment was declined' });
    }

    const periodEnd = new Date(createdAt.getTime() + 30 * DAY_MS);
    const createSubscription = db.transaction(() => {
      const result = db.prepare(`INSERT INTO subscriptions
        (user_id, plan_code, status, card_last4, started_at, period_end)
        VALUES (?, ?, 'active', ?, ?, ?)`)
        .run(req.user.id, plan.code, payment.last4, createdAt.toISOString(), periodEnd.toISOString());
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, description, created_at)
        VALUES (?, ?, ?, ?, ?, 'succeeded', ?, ?)`)
        .run(req.user.id, result.lastInsertRowid, plan.code, plan.price_cents, payment.last4,
          `${plan.name} subscription`, createdAt.toISOString());
    });
    createSubscription();

    res.status(201).json({ subscription: serialize(currentFor(req.user.id)) });
  });

  router.post('/subscription/change', requireAuth, (req, res) => {
    const plan = getPlan.get(String(req.body.planCode || '').toLowerCase());
    if (!plan) return res.status(400).json({ error: 'Choose a valid plan' });
    const subscription = currentFor(req.user.id);
    if (!subscription || subscription.status !== 'active') {
      return res.status(400).json({ error: 'You need an active plan to change it' });
    }

    if (plan.code === subscription.plan_code) {
      db.prepare('UPDATE subscriptions SET pending_plan_code = NULL WHERE id = ?').run(subscription.id);
      return res.json({
        subscription: serialize(currentFor(req.user.id)),
        message: `You will stay on ${plan.name}`,
      });
    }

    if (plan.rank < subscription.rank) {
      db.prepare('UPDATE subscriptions SET pending_plan_code = ? WHERE id = ?').run(plan.code, subscription.id);
      return res.json({
        subscription: serialize(currentFor(req.user.id)),
        message: `Switching to ${plan.name} at the end of the billing cycle`,
      });
    }

    const changedAt = now();
    const msLeft = Math.max(0, new Date(subscription.period_end).getTime() - changedAt.getTime());
    const chargedCents = Math.round((plan.price_cents - subscription.price_cents) * msLeft / (30 * DAY_MS));
    const upgrade = db.transaction(() => {
      db.prepare('UPDATE subscriptions SET plan_code = ?, pending_plan_code = NULL WHERE id = ?')
        .run(plan.code, subscription.id);
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, kind, description, created_at)
        VALUES (?, ?, ?, ?, ?, 'succeeded', 'upgrade', ?, ?)`)
        .run(req.user.id, subscription.id, plan.code, chargedCents, subscription.card_last4,
          `Prorated upgrade to ${plan.name}`, changedAt.toISOString());
    });
    upgrade();
    res.json({
      subscription: serialize(currentFor(req.user.id)),
      message: `Upgraded to ${plan.name}`,
      chargedCents,
    });
  });

  router.post('/subscription/cancel', requireAuth, (req, res) => {
    const subscription = currentFor(req.user.id);
    if (!subscription || subscription.status !== 'active') {
      return res.status(400).json({ error: 'You do not have an active plan to cancel' });
    }
    db.prepare(`UPDATE subscriptions
      SET status = 'cancelled', cancelled_at = ?, pending_plan_code = NULL
      WHERE id = ?`).run(now().toISOString(), subscription.id);
    res.json({
      subscription: serialize(currentFor(req.user.id)),
      message: 'Subscription cancelled. Access continues until the end of the billing cycle.',
    });
  });

  router.post('/subscription/retry', requireAuth, (req, res) => {
    const subscription = currentFor(req.user.id);
    if (!subscription || subscription.status !== 'past_due') {
      return res.status(400).json({ error: 'Only a Past Due subscription can be retried' });
    }

    let payment;
    try {
      payment = charge(req.body.card, now);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const retriedAt = now();
    if (payment.status === 'declined') {
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, kind, description, created_at)
        VALUES (?, ?, ?, ?, ?, 'declined', 'retry', ?, ?)`)
        .run(req.user.id, subscription.id, subscription.plan_code, subscription.price_cents,
          payment.last4, `Declined retry for ${subscription.plan_name}`, retriedAt.toISOString());
      return res.status(402).json({ error: 'Payment was declined' });
    }

    const periodEnd = new Date(retriedAt.getTime() + 30 * DAY_MS);
    const retry = db.transaction(() => {
      db.prepare(`UPDATE subscriptions
        SET status = 'active', card_last4 = ?, period_end = ?, cancelled_at = NULL
        WHERE id = ?`).run(payment.last4, periodEnd.toISOString(), subscription.id);
      db.prepare(`INSERT INTO payments
        (user_id, subscription_id, plan_code, amount_cents, card_last4, status, kind, description, created_at)
        VALUES (?, ?, ?, ?, ?, 'succeeded', 'retry', ?, ?)`)
        .run(req.user.id, subscription.id, subscription.plan_code, subscription.price_cents,
          payment.last4, `${subscription.plan_name} payment retry`, retriedAt.toISOString());
    });
    retry();

    res.json({ subscription: serialize(currentFor(req.user.id)) });
  });

  const paymentJson = (payment) => ({
    id: payment.id,
    createdAt: payment.created_at,
    description: payment.description,
    amountCents: payment.amount_cents,
    status: payment.status,
    cardLast4: payment.card_last4,
    planName: payment.plan_name,
    kind: payment.kind,
  });

  router.get('/payments', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT pay.*, p.name AS plan_name
      FROM payments pay JOIN plans p ON p.code = pay.plan_code
      WHERE pay.user_id = ? ORDER BY pay.created_at DESC, pay.id DESC`).all(req.user.id);
    res.json(rows.map(paymentJson));
  });

  router.get('/payments/:id', requireAuth, (req, res) => {
    const payment = db.prepare(`SELECT pay.*, p.name AS plan_name
      FROM payments pay JOIN plans p ON p.code = pay.plan_code
      WHERE pay.id = ? AND pay.user_id = ?`).get(req.params.id, req.user.id);
    if (!payment) return res.status(404).json({ error: 'Receipt not found' });
    res.json({
      ...paymentJson(payment),
      receiptNumber: `SH-${String(payment.id).padStart(6, '0')}`,
    });
  });

  return router;
};
