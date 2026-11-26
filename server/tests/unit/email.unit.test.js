// Unit tests: email templates (Story 15). No database, no HTTP.
const { render, money, day, TEMPLATES } = require('../../src/email');

test('money() formats cents as dollars', () => {
  expect(money(899)).toBe('$8.99');
  expect(money(1900)).toBe('$19.00');
});

test('day() turns a timestamp into a calendar date', () => {
  expect(day('2026-12-01T15:30:00.000Z')).toBe('2026-12-01');
});

test('every template returns a subject and a body that greets the user', () => {
  const data = { name: 'Sam', plan: 'Basic', amountCents: 899, renewsAt: '2026-12-01T00:00:00Z', last4: '4242',
    accessUntil: '2026-12-01T00:00:00Z', endedAt: '2026-12-01T00:00:00Z', token: 'a'.repeat(64) };
  for (const name of Object.keys(TEMPLATES)) {
    const mail = render(name, data);
    expect(mail.subject.length).toBeGreaterThan(5);
    expect(mail.body).toMatch(/^Hi Sam,/);
  }
});

test('renewal reminder includes plan, amount, and date (FR-7.2)', () => {
  const mail = render('renewal_reminder', { name: 'Sam', plan: 'Standard', amountCents: 1399, renewsAt: '2026-12-01T00:00:00Z' });
  expect(mail.subject).toBe('Your Standard plan renews on 2026-12-01');
  expect(mail.body).toContain('$13.99');
});

test('cancellation states the last day of access (FR-7.3)', () => {
  expect(render('cancellation', { name: 'Sam', plan: 'Basic', accessUntil: '2026-12-05T10:00:00Z' }).body).toContain('until 2026-12-05');
});

test('reset email carries the token link and the 30 minute expiry (FR-1.5)', () => {
  const body = render('password_reset', { name: 'Sam', token: 'f'.repeat(64) }).body;
  expect(body).toContain(`/reset-password?token=${'f'.repeat(64)}`);
  expect(body).toContain('30 minutes');
});

test('unknown templates are rejected', () => {
  expect(() => render('nope', {})).toThrow('Unknown email template');
});
