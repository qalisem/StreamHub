// Story 15: email notifications (FR-7.1, FR-7.2, FR-7.3) and password reset email (FR-1.5).
// Every email is written to the email_outbox table. In development and tests that is the
// whole delivery. In production a provider adapter sends the outbox rows (risk R16 in the
// Sprint 4 risk register: the app works even before the email supplier is set up).

const APP_URL = process.env.APP_URL || 'http://localhost:4000';

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const day = (iso) => new Date(iso).toISOString().slice(0, 10);

const TEMPLATES = {
  welcome: (d) => ({
    subject: 'Welcome to StreamHub',
    body: `Hi ${d.name},\n\nYour StreamHub account is ready. Choose a plan to start watching: ${APP_URL}/plans\n\nThe StreamHub team`,
  }),
  renewal_reminder: (d) => ({
    subject: `Your ${d.plan} plan renews on ${day(d.renewsAt)}`,
    body: `Hi ${d.name},\n\nYour ${d.plan} plan renews on ${day(d.renewsAt)} for ${money(d.amountCents)}. `
      + `You can change or cancel your plan before then on your account page: ${APP_URL}/account\n\nThe StreamHub team`,
  }),
  payment_failed: (d) => ({
    subject: 'Your StreamHub payment failed',
    body: `Hi ${d.name},\n\nWe could not renew your ${d.plan} plan (${money(d.amountCents)}) with the card ending ${d.last4}. `
      + `Playback is paused until you update your card: ${APP_URL}/account\n\nThe StreamHub team`,
  }),
  cancellation: (d) => ({
    subject: 'Your StreamHub plan is cancelled',
    body: `Hi ${d.name},\n\nYour ${d.plan} plan is cancelled. You can keep watching until ${day(d.accessUntil)}, your last day of access.\n\nThe StreamHub team`,
  }),
  expiry: (d) => ({
    subject: 'Your StreamHub plan has ended',
    body: `Hi ${d.name},\n\nYour ${d.plan} plan ended on ${day(d.endedAt)}. Choose a plan any time to start watching again: ${APP_URL}/plans\n\nThe StreamHub team`,
  }),
  password_reset: (d) => ({
    subject: 'Reset your StreamHub password',
    body: `Hi ${d.name},\n\nUse this link to reset your password. It works once and expires in 30 minutes:\n${APP_URL}/reset-password?token=${d.token}\n\n`
      + 'If you did not ask for this, you can ignore this email.\n\nThe StreamHub team',
  }),
  password_changed: (d) => ({
    subject: 'Your StreamHub password was changed',
    body: `Hi ${d.name},\n\nYour password was just changed. If this was not you, reset your password right away: ${APP_URL}/forgot-password\n\nThe StreamHub team`,
  }),
};

function render(template, data) {
  const build = TEMPLATES[template];
  if (!build) throw new Error(`Unknown email template: ${template}`);
  return build(data);
}

// Writes one email to the outbox and returns its id.
function queueEmail(db, { userId, template, data = {}, now = () => new Date() }) {
  const user = db.prepare('SELECT email, display_name FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const { subject, body } = render(template, { name: user.display_name, ...data });
  const info = db.prepare(`INSERT INTO email_outbox (user_id, to_email, template, subject, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(userId, user.email, template, subject, body, now().toISOString());
  return info.lastInsertRowid;
}

module.exports = { queueEmail, render, TEMPLATES, money, day };
