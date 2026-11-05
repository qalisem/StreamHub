// Unit tests: auth middleware (FR-1.2, FR-1.3, FR-6.1) with mock request and response objects.
const jwt = require('jsonwebtoken');
const { sign, requireAuth, requireRole, rejectDeactivated } = require('../../src/middleware/auth');

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const reqWith = (token) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
const user = { id: 7, role: 'subscriber', display_name: 'Demo' };

describe('sign()', () => {
  test('puts id, role and name in the token and expires in 30 minutes', () => {
    const p = jwt.decode(sign(user));
    expect(p).toMatchObject({ id: 7, role: 'subscriber', name: 'Demo' });
    expect(p.exp - p.iat).toBe(30 * 60);
  });
});

describe('requireAuth()', () => {
  test('valid token sets req.user and calls next', () => {
    const req = reqWith(sign(user)); const next = jest.fn();
    requireAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.user.id).toBe(7);
  });

  test('missing token returns 401', () => {
    const res = mockRes(); const next = jest.fn();
    requireAuth(reqWith(null), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('tampered token returns 401', () => {
    const res = mockRes();
    requireAuth(reqWith(sign(user) + 'x'), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('requireRole()', () => {
  test('allowed role passes', () => {
    const next = jest.fn();
    requireRole('admin', 'content_manager')({ user: { role: 'content_manager' } }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('other roles get 403', () => {
    const res = mockRes(); const next = jest.fn();
    requireRole('admin')({ user: { role: 'subscriber' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('rejectDeactivated()', () => {
  const dbWith = (row) => ({ prepare: () => ({ get: () => row }) });

  test('deactivated user gets 403', () => {
    const res = mockRes(); const next = jest.fn();
    rejectDeactivated(dbWith({ active: 0 }))(reqWith(sign(user)), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('active user and requests without a token pass through', () => {
    const next = jest.fn();
    rejectDeactivated(dbWith({ active: 1 }))(reqWith(sign(user)), mockRes(), next);
    rejectDeactivated(dbWith(null))(reqWith(null), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
