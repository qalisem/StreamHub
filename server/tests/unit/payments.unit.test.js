// Unit tests: mock payment module (FR-4.1, FR-4.2, FR-4.3). No HTTP, no database.
const { luhn, charge, renew } = require('../../src/payments');

const NOW = () => new Date('2026-10-15T12:00:00Z');
const card = (over = {}) => ({ name: 'Test User', number: '4242 4242 4242 4242', expMonth: 12, expYear: 2030, cvv: '123', ...over });

describe('luhn()', () => {
  test.each([
    ['4242 4242 4242 4242', true],
    ['4000-0000-0000-0002', true],
    ['4000000000000341', true],
    ['4242424242424241', false],
    ['abcd', false],
    ['', false],
  ])('luhn(%p) is %p', (n, ok) => expect(luhn(n)).toBe(ok));
});

describe('charge()', () => {
  test('a valid card succeeds and returns only the last 4 digits', () => {
    expect(charge(card(), NOW)).toEqual({ status: 'succeeded', last4: '4242' });
  });

  test('test card 4000 0000 0000 0002 is declined', () => {
    expect(charge(card({ number: '4000 0000 0000 0002' }), NOW).status).toBe('declined');
  });

  test.each([
    [{ name: '  ' }, 'Name is required'],
    [{ number: '4242 4242 4242 4241' }, 'Card number is invalid'],
    [{ number: '4242' }, 'Card number is invalid'],
    [{ expMonth: 13 }, 'Expiration month must be between 1 and 12'],
    [{ expMonth: 0 }, 'Expiration month must be between 1 and 12'],
    [{ expYear: 2025 }, 'Card is expired'],
    [{ expYear: 2026, expMonth: 9 }, 'Card is expired'],
    [{ cvv: '12' }, 'CVV must be 3 or 4 digits'],
    [{ cvv: 'abc' }, 'CVV must be 3 or 4 digits'],
  ])('rejects %p', (over, msg) => {
    expect(() => charge(card(over), NOW)).toThrow(msg);
  });

  test('a card expiring this month is still accepted', () => {
    expect(charge(card({ expYear: 2026, expMonth: 10 }), NOW).status).toBe('succeeded');
  });

  test('a 4 digit CVV is accepted', () => {
    expect(charge(card({ cvv: '1234' }), NOW).status).toBe('succeeded');
  });
});

describe('renew()', () => {
  test('a saved card renews', () => expect(renew('4242')).toEqual({ status: 'succeeded' }));
  test('card ending 0341 declines at renewal', () => expect(renew('0341')).toEqual({ status: 'declined' }));
  test('card ending 0341 still passes checkout', () => {
    expect(charge(card({ number: '4000 0000 0000 0341' }), NOW).status).toBe('succeeded');
  });
});
