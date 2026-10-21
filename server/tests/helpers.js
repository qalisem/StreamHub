const request = require('supertest');
const { createDb } = require('../src/db');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');

function setup(count = 50) {
  const db = createDb(':memory:');
  seed(db, count);
  const clock = { t: new Date('2026-10-15T12:00:00Z') };
  const app = createApp(db, { now: () => new Date(clock.t) });
  const advance = (days) => { clock.t = new Date(clock.t.getTime() + days * 86400000); };
  const login = async (email, password) => (await request(app).post('/api/auth/login').send({ email, password })).body.token;
  return { db, app, login, advance, clock };
}

module.exports = { setup, request };
