const { setup, request } = require('./helpers');

describe('Story 1: Register and log in', () => {
  let app, login;
  beforeEach(() => ({ app, login } = setup(5)));

  test('TC-1.1 registers a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'New@Mail.com', password: 'abc12345', displayName: 'New' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'new@mail.com', role: 'subscriber' });
  });

  test('TC-1.2 rejects a duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'user@streamhub.test', password: 'abc12345', displayName: 'X' });
    expect(res.status).toBe(409);
  });

  test.each([['short1'], ['allletters'], ['12345678']])('TC-1.3 rejects weak password "%s"', async (pw) => {
    const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: pw, displayName: 'A' });
    expect(res.status).toBe(400);
  });

  test('TC-1.4 rejects an invalid email and missing name', async () => {
    expect((await request(app).post('/api/auth/register').send({ email: 'bad', password: 'abc12345', displayName: 'A' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ email: 'a@b.com', password: 'abc12345' })).status).toBe(400);
  });

  test('TC-1.5 logs in with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'user@streamhub.test', password: 'User1234' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('subscriber');
  });

  test('TC-1.6 gives a generic error for wrong password or unknown email', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'user@streamhub.test', password: 'wrong123' });
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@x.com', password: 'wrong123' });
    expect(a.status).toBe(401);
    expect(a.body.error).toBe(b.body.error);
  });

  test('TC-1.7 stores passwords hashed, never in plain text', () => {
    const { db } = setup(1);
    const u = db.prepare("SELECT password_hash FROM users WHERE email = 'user@streamhub.test'").get();
    expect(u.password_hash).not.toBe('User1234');
    expect(u.password_hash.startsWith('$2')).toBe(true);
  });

  test('TC-1.8 /me requires a valid token', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const token = await login('admin@streamhub.test', 'Admin123');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.user.role).toBe('admin');
  });
});
