const DECLINED_NUMBER = '4000000000000002';

function normalizeNumber(number) {
  return String(number || '').replace(/[ -]/g, '');
}

function luhn(number) {
  const digits = normalizeNumber(number);
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function charge(card, now = () => new Date()) {
  if (!String(card?.name || '').trim()) throw new Error('Name is required');

  const number = normalizeNumber(card?.number);
  if (!/^\d{13,19}$/.test(number) || !luhn(number)) throw new Error('Card number is invalid');

  const expMonth = Number(card?.expMonth);
  if (!Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12) {
    throw new Error('Expiration month must be between 1 and 12');
  }

  const expYear = Number(card?.expYear);
  const today = now();
  if (!Number.isInteger(expYear) || expYear < today.getUTCFullYear()
    || (expYear === today.getUTCFullYear() && expMonth < today.getUTCMonth() + 1)) {
    throw new Error('Card is expired');
  }

  if (!/^\d{3,4}$/.test(String(card?.cvv || ''))) throw new Error('CVV must be 3 or 4 digits');

  return {
    status: number === DECLINED_NUMBER ? 'declined' : 'succeeded',
    last4: number.slice(-4),
  };
}

module.exports = { charge, luhn };
